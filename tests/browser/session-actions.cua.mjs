// CUA browser regression. Pass the documented CUA tab; never use element.click().
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function readEvidence(root, file) {
  const original = JSON.parse(await fs.readFile(root + file, 'utf8').catch(() => '[]'));
  const text = await fs.readFile(root + file + '.ndjson', 'utf8').catch(() => '');
  const lines = text.split('\n'); lines.pop(); // ignore a concurrently appended unfinished row
  const rows = lines.filter(Boolean).map(line => JSON.parse(line));
  return file === 'network.json' ? [...new Map([...original, ...rows].map(row => [row.id, row])).values()] : [...original, ...rows];
}
export async function ready(tab, name) {
  const deadline = Date.now() + 20000;
  do {
    const locator = tab.playwright.locator('.focus-session-actions').getByRole('button', { name, exact: true });
    if (await locator.count() === 1 && await locator.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(`Action not ready: ${name}`);
}
export async function geometry(tab) {
  return tab.playwright.locator('.focus-session-actions').evaluate(group => {
    const buttons = [...group.querySelectorAll('button')];
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const controls = buttons.map(button => {
      const r = rect(button), receiver = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const css = getComputedStyle(button);
      return { name: button.getAttribute('aria-label') || button.textContent.trim(), text: button.textContent.trim(), html: button.outerHTML, rect: r, disabled: button.disabled, connected: button.isConnected, hitOwn: !!receiver && (receiver === button || button.contains(receiver)), receiver: receiver?.closest('button')?.textContent.trim(), gridArea: css.gridArea, position: css.position, zIndex: css.zIndex };
    });
    const [a, b] = controls.map(c => c.rect);
    return { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, display: getComputedStyle(group).display, columns: getComputedStyle(group).gridTemplateColumns, overlap: Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)), controls };
  });
}
export function assertGeometry(g, width) {
  assert.equal(g.width, width, 'actual viewport width');
  assert.equal(g.overlap, 0, 'independent pointer rectangles');
  assert.ok(g.scrollWidth <= g.clientWidth, 'no horizontal overflow');
  for (const c of g.controls) {
    assert.ok(c.connected && !c.disabled && c.hitOwn, `${c.name}: enabled unoccluded target`);
    assert.ok(c.rect.width > 0 && c.rect.height >= 40 && c.rect.x >= 0 && c.rect.right <= g.width && c.rect.y >= 0 && c.rect.bottom <= g.height, `${c.name}: unclipped visible bounds`);
  }
}
export async function pointerAction(tab, root, phase, name, endpoint, { width, keyboard = false, wait = false } = {}) {
  const group = tab.playwright.locator('.focus-session-actions');
  const button = group.getByRole('button', { name, exact: true });
  assert.equal(await button.count(), 1, 'unique exact accessible target');
  assert.ok(await button.isVisible() && await button.isEnabled());
  const g = await geometry(tab); assertGeometry(g, width ?? g.width);
  const beforeUi = (await readEvidence(root, 'ui-events.json')).length;
  const beforeNet = (await readEvidence(root, 'network.json')).at(-1)?.id ?? 0;
  const evidence = { phase, intendedName: name, keyboard, before: g, beforeNet, beforeUi, beforeAt: new Date().toISOString() };
  await fs.writeFile(root + phase + '.json', JSON.stringify(evidence, null, 2));
  const snapshot = await tab.playwright.domSnapshot();
  await fs.writeFile(root + phase + '-before.txt', snapshot);
  await fs.writeFile(root + phase + '-before.png', await tab.screenshot({ fullPage: false }));
  if (keyboard) await button.press('Enter'); else await button.click();
  await tab.getAXState({ emit: false });
  if (wait) evidence.result = await assertRequest(root, beforeNet, beforeUi, name, endpoint);
  await fs.writeFile(root + phase + '.json', JSON.stringify(evidence, null, 2));
  return evidence;
}
export async function assertRequest(root, afterId, afterUi, name, endpoint) {
  const deadline = Date.now() + 22000;
  let posts, clicks;
  do {
    posts = (await readEvidence(root, 'network.json')).filter(e => e.id > afterId && e.method === 'POST' && e.path.includes('/study-sessions/'));
    clicks = (await readEvidence(root, 'ui-events.json')).slice(afterUi).filter(e => e.type === 'click' && e.isTrusted);
    if (posts.length && posts.every(e => e.status !== null) && clicks.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(posts.length, 1, 'exactly one session POST per action');
  assert.ok(posts[0].path.endsWith('/' + endpoint), 'expected method/path, no accidental finish');
  assert.equal(posts[0].status, 200, 'successful contract response');
  assert.equal(clicks.length, 1, 'one trusted click');
  assert.equal(clicks[0].target.name, name, 'actual receiver identity');
  return { request: posts[0], receiver: clicks[0] };
}
export async function responsiveCase(tab, viewport, root, width, focus) {
  const phase = `matrix-${focus ? 'focus' : 'today'}-${width}`;
  await fs.writeFile(root + 'control.json', JSON.stringify({ transport: 'fixture', reset: phase + '-' + Date.now(), phase, mode: 'normal' }));
  await viewport.set({ width, height: 900 });
  const url = 'http://127.0.0.1:5175/' + (focus ? 'session' : '');
  if (await tab.url() === url) await tab.reload(); else await tab.goto(url);
  await tab.getAXState({ emit: false });
  await ready(tab, 'Mola ver');
  await pointerAction(tab, root, phase + '-pause', 'Mola ver', 'pause', { width });
  await ready(tab, 'Çalışmaya devam et');
  await pointerAction(tab, root, phase + '-resume', 'Çalışmaya devam et', 'resume', { width });
  await ready(tab, 'Mola ver');
  await pointerAction(tab, root, phase + '-finish', 'Çalışmayı Bitir', 'finish', { width });
  return { width, focus, phase, overlap: 0, geometry: 'PASS', transport: 'fixture', networkVerification: 'PENDING' };
}
