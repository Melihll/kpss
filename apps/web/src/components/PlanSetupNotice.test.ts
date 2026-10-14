// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanSetupNotice } from './PlanSetupNotice';
import type { RoadmapResponse } from '../lib/roadmap';
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(roadmap: unknown, onGenerate = vi.fn()) { await act(async () => root.render(createElement(MemoryRouter, {}, createElement(PlanSetupNotice, { roadmap: roadmap as RoadmapResponse, onGenerate })))); return onGenerate; }
it('shows honest setup-required without a generation control', async () => { await render({ configured: false }); expect(host.textContent).toContain('Plan kurulumu gerekli'); expect(host.querySelector('button')).toBeNull(); });
it('does not offer generation with missing resources or zero capacity', async () => { await render({ configured: true, weekGenerationReadiness: { ready: false } }); expect(host.textContent).toContain('pozitif'); expect(host.querySelector('button')).toBeNull(); });
it('requires a physical explicit action even when ready', async () => { const callback = await render({ configured: true, weekGenerationReadiness: { ready: true } }); expect(callback).not.toHaveBeenCalled(); await act(async () => host.querySelector('button')!.click()); expect(callback).toHaveBeenCalledOnce(); });
it('keeps existing configured pilot plans visible without a setup notice', async () => { await render({ configured: true, currentWeek: { plan: { id: 'pilot' } } }); expect(host.textContent).toBe(''); });
