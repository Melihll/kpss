// Test-server injection only; this file is never included in the product build.
(() => {
  if (location.origin !== 'http://127.0.0.1:5175') throw new Error('LOCAL test origin required');
  const ids = new WeakMap(); let next = 0, burst = '';
  const identity = node => {
    if (!ids.has(node)) ids.set(node, ++next);
    const r = node.getBoundingClientRect();
    return { nodeKey: ids.get(node), name: node.getAttribute('aria-label') || node.textContent.trim(), text: node.textContent.trim(), class: node.className, disabled: node.disabled, connected: node.isConnected, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, html: node.outerHTML };
  };
  const send = value => void fetch('/__session_audit/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at: new Date().toISOString(), route: location.pathname, width: innerWidth, ...value }) });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown']) document.addEventListener(type, event => {
    const button = event.target.closest?.('button.focus-action');
    if (button) send({ type, isTrusted: event.isTrusted, key: event.key, clientX: event.clientX, clientY: event.clientY, target: identity(button), rawTargetTag: event.target.tagName });
  }, true);
  setInterval(async () => {
    try {
      const c = await (await fetch('/__session_audit/control')).json();
      if (c.mode === 'rapid-rerender' && c.burst !== burst) {
        burst = c.burst; let n = 0;
        const timer = setInterval(() => {
          window.dispatchEvent(new Event('kpss:execution-changed'));
          send({ type: 'controlled-execution-refresh', burst, iteration: ++n });
          if (n >= c.iterations) clearInterval(timer);
        }, 70);
      }
    } catch { /* a stopped test server is expected at teardown */ }
  }, 300);
})();
