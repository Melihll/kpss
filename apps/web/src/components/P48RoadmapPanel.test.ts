// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { P48RoadmapPanel } from './P48RoadmapPanel';
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../lib/app-api', () => ({ callAppApi: api.call, AppApiError: class extends Error {}, FRIENDLY_API_ERRORS: {} }));
vi.mock('./Icon', () => ({ Icon: () => null }));
let root: Root, host: HTMLDivElement;
const configured = { configured: true, strategy: { targetExamDate: '2027-09-06', weeklyTargetMinutes: 1800, monthlyTargetMinutes: 7200, daysToExam: 100 }, resourcesSummary: { count: 26, progressPercent: 0 }, currentWeek: { plan: null, tasks: [] }, weekGenerationReadiness: { ready: true } };
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); api.call.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(value: unknown) { api.call.mockResolvedValue(value); await act(async () => root.render(createElement(MemoryRouter, {}, createElement(P48RoadmapPanel)))); }
it.each([false, true])('legacy panel mount and execution refresh are read-only: configured=%s', async ready => {
  await mount(ready ? configured : { configured: false });
  await act(async () => window.dispatchEvent(new Event('kpss:execution-changed')));
  expect(api.call.mock.calls).toEqual([['/p48/roadmap'], ['/p48/roadmap']]);
});
it('legacy pilot requires an explicit button action to generate a missing week', async () => {
  await mount(configured); const button = [...host.querySelectorAll('button')].find(b => b.textContent === 'Haftalık Planı Oluştur')!;
  await act(async () => button.click());
  expect(api.call.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([['/p48/week/generate', { method: 'POST', body: { intent: 'generate_week' } }]]);
});
