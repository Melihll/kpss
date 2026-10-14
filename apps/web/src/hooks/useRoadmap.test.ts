// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoadmap } from './useRoadmap';
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../lib/app-api', () => ({ callAppApi: api.call }));
let root: Root, host: HTMLDivElement;
function Consumer({ enabled = true }) { const state = useRoadmap({ enabled }); return createElement('button', { onClick: state.retry }, String(state.data?.configured)); }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); api.call.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe('roadmap reads cannot acquire initialization authority', () => {
  it.each([false, true])('mount, refresh and retry stay GET-only (configured=%s)', async configured => {
    api.call.mockResolvedValue({ configured, currentWeek: { plan: null, tasks: [] } });
    await act(async () => root.render(createElement(Consumer)));
    await act(async () => window.dispatchEvent(new Event('kpss:execution-changed')));
    await act(async () => host.querySelector('button')!.click());
    expect(api.call.mock.calls).toEqual(Array.from({ length: 3 }, () => ['/p48/roadmap']));
  });
  it('disabled consumers perform no request', async () => { await act(async () => root.render(createElement(Consumer, { enabled: false }))); expect(api.call).not.toHaveBeenCalled(); });
});
