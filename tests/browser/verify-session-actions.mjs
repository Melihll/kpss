import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { assertGeometry, readEvidence } from './session-actions.cua.mjs';
const root = path.resolve(process.argv[2] ?? '.release/mobile-session-action-fix-20261008') + path.sep;
if (!root.startsWith(path.resolve('.release') + path.sep)) throw new Error('Ignored LOCAL evidence root required');
const read = async file => JSON.parse(await fs.readFile(root + file, 'utf8'));
const network = await readEvidence(root, 'network.json'), ui = await readEvidence(root, 'ui-events.json');
const recordedMatrix = await read('responsive-matrix.json');
const matrix = [...new Map(recordedMatrix.map(row => [`${row.width}:${row.focus}`, row])).values()];
assert.equal(matrix.length, 14);
assert.equal(new Set(matrix.map(row => `${row.width}:${row.focus}`)).size, 14);
for (const row of matrix) {
  const actions = await Promise.all(['pause', 'resume', 'finish'].map(action => read(row.phase + '-' + action + '.json')));
  const posts = network.filter(e => e.phase === row.phase && e.transport === 'fixture' && e.method === 'POST' && e.path.includes('/study-sessions/') && e.at >= actions[0].beforeAt);
  assert.deepEqual(posts.map(e => e.path.split('/').at(-1)), ['pause', 'resume', 'finish']);
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]; assertGeometry(action.before, row.width);
    assert.equal(posts[i].status, 200);
    const clicks = ui.filter(e => e.type === 'click' && e.isTrusted && e.width === row.width && e.route === (row.focus ? '/session' : '/') && e.at >= action.beforeAt && e.at <= posts[i].completedAt);
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].target.name, action.intendedName);
    row.networkVerification = 'PASS'; row.result = 'PASS';
  }
  assert.equal(posts[0].response.paused, true);
  assert.equal(posts[1].response.paused, false);
  assert.equal(posts[2].response.session.status, 'completed');
}
const old = [];
for (const page of ['today', 'focus']) {
  const g = await read(`old-${page}-390.json`), click = await read(`old-${page}-390-click.json`);
  assert.throws(() => assertGeometry(g, 390), /independent pointer rectangles/);
  assert.ok(g.overlap > 0 && !g.controls[0].hitOwn);
  assert.equal(click.receiver.target.name, 'Çalışmayı Bitir');
  assert.ok(click.receiver.isTrusted && click.request.path.endsWith('/finish'));
  old.push({ page, result: 'RED', intended: 'Mola ver', receiver: click.receiver.target.name, overlap: g.overlap, method: click.request.method, path: click.request.path, transport: 'fixture' });
}
await fs.writeFile(root + 'responsive-matrix.json', JSON.stringify(matrix, null, 2));
const result = { old, repaired: { viewports: 7, pages: 2, actualPointerActions: 42, expectedResponses: 42, overlap: 0, geometry: 'PASS', receivers: 'PASS', contracts: 'PASS', fixtureOnly: true } };
await fs.writeFile(root + 'pointer-regression-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
