// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayerPanel, type ResourceVideoLibraryResponse, type VideoItem, type VideoProgress } from "./VideoPlayerDrawer";
import type { ResourceForecast } from "../lib/roadmap";
import type { YouTubeCheckpoint } from "../lib/youtube-progress-writer";

const api = vi.hoisted(() => ({ call: vi.fn(), owner: "local-test-owner" }));
vi.mock("../lib/app-api", () => ({ callAppApi: api.call, AppApiError: class extends Error {}, FRIENDLY_API_ERRORS: {} }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: api.owner } }) }));

type PlayerOptions = ConstructorParameters<NonNullable<Window["YT"]>["Player"]>[1];
const playlistId = "00000000-0000-4000-8000-000000000100";
const resource: ResourceForecast = { resourceId: "00000000-0000-4000-8000-000000000200", resourceName: "SDK replacement regression", plannedMinutes: 60, actualMinutes: 0, remainingMinutes: 60, progressPercent: 0, completed: false, forecastFinishDate: null };
const progress = (video: VideoItem, body: YouTubeCheckpoint): VideoProgress => ({ youtubePlaylistVideoId: video.id, ...body, durationSeconds: video.durationSeconds, progressPercent: Math.floor(body.watchedSeconds / 10), remainingSeconds: video.durationSeconds - body.watchedSeconds, completed: false, completedAt: null, createdAt: null, updatedAt: null });
const videos: VideoItem[] = Array.from({length: 91}, (_, i) => {
  const video: VideoItem = { id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, youtubeVideoId: `ytmock_${String(i).padStart(4, "0")}`, title: `Lesson ${i}`, position: i, durationSeconds: 1000, thumbnailUrl: null, channelTitle: null, publishedAt: null, progress: null };
  return { ...video, progress: progress(video, {lastPositionSeconds: 100 + i, watchedSeconds: 20 + i}) };
});
const library: ResourceVideoLibraryResponse = { resource: {id: resource.resourceId, name: resource.resourceName, resourceType: "video_course"}, playlists: [{id: playlistId, sourceUrl: "https://www.youtube.com/playlist?list=test", youtubePlaylistId: "test", title: "91-video SDK regression", totalDurationSeconds: 91000, videoCount: 91, lastSyncedAt: null, videos}] };
const instances: FakePlayer[] = [];
const lifecycle: Array<Record<string, unknown>> = [];

// Crucial SDK behavior: replace the passed node; do not preserve a React div.
class FakePlayer {
  readonly iframe = document.createElement("iframe");
  readonly destroy = vi.fn(() => { this.iframe.remove(); lifecycle.push({event: "destroy", videoId: this.options.videoId}); });
  readonly seekTo = vi.fn((seconds: number) => { this.position = seconds; });
  readonly playVideo = vi.fn(() => this.state(1));
  readonly pauseVideo = vi.fn(() => this.state(2));
  position = 0;
  constructor(readonly target: HTMLElement, readonly options: PlayerOptions) {
    lifecycle.push({event: "construct-before", videoId: options.videoId, targetClass: target.className, parentClass: target.parentElement?.className, connected: target.isConnected});
    this.iframe.dataset.videoId = options.videoId;
    target.replaceWith(this.iframe);
    lifecycle.push({event: "construct-after", videoId: options.videoId, targetConnected: target.isConnected, iframeConnected: this.iframe.isConnected});
    instances.push(this);
  }
  getCurrentTime() { return this.position; }
  getPlaybackRate() { return 1; }
  ready() {
    this.options.events.onReady({target: this});
    // A restore seek can asynchronously emit PLAYING after onReady pauses it.
    if (this.seekTo.mock.calls.length) this.state(1);
  }
  state(data: number) { this.options.events.onStateChange({target: this, data}); }
  fail() { this.options.events.onError(); }
}

let root: Root | null;
let container: HTMLDivElement;
let uncaught: unknown[];
let activeIntervalCount = () => 0;
const settle = async () => { await act(async () => { await Promise.resolve(); }); };
async function mount(strict = false, extra: Partial<Parameters<typeof VideoPlayerPanel>[0]> = {}) {
  root = createRoot(container, {onUncaughtError: error => { uncaught.push(error); }});
  await act(async () => {
    const panel = createElement(VideoPlayerPanel, {resource, ...extra});
    root!.render(strict ? createElement(StrictMode, null, panel) : panel);
  });
  await settle();
}
async function select(index: number) {
  const button = [...container.querySelectorAll(".youtube-video-list button")].find(b => b.textContent?.includes(`Lesson ${index}YouTube`));
  expect(button).toBeDefined();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await settle();
}
async function ready(player = instances.at(-1)!) { await act(async () => { player.ready(); }); }
async function unmount() { if (root) { await act(async () => { root!.unmount(); }); root = null; } }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function response(video: VideoItem, body?: YouTubeCheckpoint) {
  return {video: {id: video.id, youtubePlaylistId: playlistId, youtubeVideoId: video.youtubeVideoId, title: video.title, durationSeconds: video.durationSeconds, position: video.position}, progress: body ? progress(video, body) : video.progress};
}
function fakeClock() {
  vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"]});
  const starts = vi.spyOn(window, 'setInterval');
  const stops = vi.spyOn(window, 'clearInterval');
  activeIntervalCount = () => {
    const cleared = new Set<unknown>(stops.mock.calls.map(([id]) => id));
    return starts.mock.results.filter(result => result.type === 'return' && !cleared.has(result.value)).length;
  };
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function playFor(player: FakePlayer, seconds: number) {
  for (let i = 0; i < seconds; i++) { player.position++; await advance(1000); }
}
const puts = () => api.call.mock.calls.filter(([, options]) => options?.method === "PUT");

describe("YouTube SDK DOM ownership and player retirement", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.appendChild(container);
    root = null; uncaught = []; instances.length = 0; lifecycle.length = 0;
    activeIntervalCount = () => 0;
    api.owner = `local-test-owner-${crypto.randomUUID()}`;
    window.YT = {Player: FakePlayer, PlayerState: {ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5}};
    api.call.mockReset();
    api.call.mockImplementation(async (path: string, options?: {body?: YouTubeCheckpoint}) => {
      if (path.startsWith("/resources/")) return library;
      const video = videos.find(v => path === `/youtube-videos/${v.id}/progress`)!;
      return response(video, options?.body);
    });
  });
  afterEach(async () => { await unmount(); container.remove(); delete window.YT; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("keeps the React root mounted when the SDK replaces its target and A changes to B", async () => {
    await mount(); await ready();
    expect(instances[0]!.target.isConnected).toBe(false);
    expect(instances[0]!.iframe.isConnected).toBe(true);
    expect(instances[0]!.iframe.parentElement?.parentElement).toBe(container.querySelector('.youtube-player-frame'));
    await select(1);
    expect(uncaught.map(String)).toEqual([]);
    expect(container.querySelector(".youtube-player-panel")).not.toBeNull();
    expect(instances.at(-1)!.options.videoId).toBe(videos[1]!.youtubeVideoId);
    await ready();
    expect(instances.at(-1)!.position).toBe(101);
    await unmount();
    expect(uncaught.map(String)).toEqual([]);
  });

  it("keeps 20 selections through a 91-video catalog bounded, including loading and ready switches", async () => {
    fakeClock();
    await mount();
    const selected: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const index = (i * 7) % videos.length;
      selected.push(index);
      if (i % 2 === 0) {
        await ready();
        const player = instances.at(-1)!;
        await act(async () => { player.playVideo(); });
        player.position += 1;
        await advance(1000);
      }
      await select(index);
      expect(container.querySelectorAll("iframe")).toHaveLength(1);
      expect(instances.filter(p => p.destroy.mock.calls.length === 0)).toHaveLength(1);
      expect(activeIntervalCount()).toBe(0);
    }
    await ready();
    expect(instances.at(-1)!.options.videoId).toBe(videos[selected.at(-1)!]!.youtubeVideoId);
    await unmount();
    expect(instances.every(p => p.destroy.mock.calls.length === 1)).toBe(true);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(uncaught).toEqual([]);
    expect(activeIntervalCount()).toBe(0);
  }, 20_000);

  it("ignores retired ready/state/error callbacks while the next video is still loading", async () => {
    fakeClock();
    await mount();
    const old = instances[0]!;
    await select(1);
    const next = instances.at(-1)!;
    await act(async () => { old.ready(); old.state(1); old.state(0); old.fail(); });
    expect(old.seekTo).not.toHaveBeenCalled();
    expect(next.seekTo).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(activeIntervalCount()).toBe(0);
    await ready(next);
    expect(next.seekTo).toHaveBeenCalledExactlyOnceWith(101, true);
    await unmount();
    await act(async () => { next.ready(); next.state(1); next.fail(); });
    expect(uncaught).toEqual([]);
    expect(activeIntervalCount()).toBe(0);
  });

  it("closes during a pending progress GET without constructing a late player", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    api.call.mockImplementation((path: string) => path.startsWith('/resources/') ? Promise.resolve(library) : pending.promise);
    await mount();
    expect(instances).toHaveLength(0);
    await unmount();
    pending.resolve(response(videos[0]!));
    await settle();
    expect(instances).toHaveLength(0);
    expect(uncaught).toEqual([]);
  });

  it("close/reopen and route-style unmount destroy every SDK instance at most once", async () => {
    await mount(); await ready();
    const first = instances[0]!;
    await unmount(); await unmount();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    await mount(); await ready();
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    await act(async () => { root!.render(createElement('main', null, 'Another route')); });
    expect(container.textContent).toBe('Another route');
    expect(instances.every(p => p.destroy.mock.calls.length === 1)).toBe(true);
    expect(uncaught).toEqual([]);
  });

  it("StrictMode replay and repeated PLAYING events leave one timer and balanced lifecycle listeners", async () => {
    fakeClock();
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    await mount(true); await ready();
    expect(instances).toHaveLength(1);
    await act(async () => { instances[0]!.state(1); instances[0]!.state(1); });
    expect(activeIntervalCount()).toBe(1);
    await unmount();
    expect(activeIntervalCount()).toBe(0);
    expect(instances[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(puts()).toHaveLength(0);
    expect(addDocument.mock.calls.filter(([name]) => name === 'visibilitychange').length).toBe(removeDocument.mock.calls.filter(([name]) => name === 'visibilitychange').length);
    expect(addWindow.mock.calls.filter(([name]) => name === 'pagehide').length).toBe(removeWindow.mock.calls.filter(([name]) => name === 'pagehide').length);
    vi.restoreAllMocks();
  });

  it("keeps A's latest final checkpoint during a slow PUT and does not apply its late completion to B", async () => {
    fakeClock();
    const first = deferred<ReturnType<typeof response>>();
    const onProgressChanged = vi.fn();
    const normal = api.call.getMockImplementation()!;
    api.call.mockImplementation((path: string, options?: {method?: string; body?: YouTubeCheckpoint}) => options?.method === 'PUT' ? first.promise : normal(path, options));
    await mount(false, {onProgressChanged}); await ready();
    const a = instances[0]!;
    await act(async () => { a.playVideo(); });
    await playFor(a, 15);
    expect(puts()).toHaveLength(1);
    a.position = 116; await advance(1000);
    await select(1); await ready();
    expect(puts()).toHaveLength(1);
    expect(instances.at(-1)!.position).toBe(101);
    const callbacksBefore = onProgressChanged.mock.calls.length;
    // The next successful transport resolves the required final point for A.
    api.call.mockImplementation(normal);
    first.resolve(response(videos[0]!, {lastPositionSeconds: 115, watchedSeconds: 35}));
    await settle(); await settle();
    expect(puts().map(([, options]) => options.body.lastPositionSeconds)).toEqual([115, 116]);
    expect(onProgressChanged.mock.calls).toHaveLength(callbacksBefore);
    expect(container.querySelector('.youtube-current-video')?.textContent).toContain('1:41');
    expect(uncaught).toEqual([]);
  });

  it("reopens A from the same-stream pending checkpoint instead of an older server GET", async () => {
    fakeClock();
    const pending = deferred<ReturnType<typeof response>>();
    const normal = api.call.getMockImplementation()!;
    api.call.mockImplementation((path: string, options?: {method?: string}) => options?.method === 'PUT' ? pending.promise : normal(path, options));
    await mount(); await ready();
    const a = instances[0]!;
    await act(async () => { a.playVideo(); });
    await playFor(a, 15);
    a.position = 116; await advance(1000);
    await select(1); await ready(); await select(0); await ready();
    expect(instances.at(-1)!.position).toBe(116);
    api.call.mockImplementation(normal);
    pending.resolve(response(videos[0]!, {lastPositionSeconds: 115, watchedSeconds: 35}));
    await settle(); await settle();
    expect(puts()).toHaveLength(2);
    expect(container.querySelector('.youtube-current-video')?.textContent).toContain('1:56');
  });

  it("failed in-flight saves cannot revive retired callbacks and a newer final flush respects backoff", async () => {
    fakeClock();
    const pending = deferred<ReturnType<typeof response>>();
    const normal = api.call.getMockImplementation()!;
    api.call.mockImplementation((path: string, options?: {method?: string}) => options?.method === 'PUT' ? pending.promise : normal(path, options));
    await mount(); await ready();
    const a = instances[0]!;
    await act(async () => { a.playVideo(); });
    await playFor(a, 15);
    a.position = 116; await advance(1000);
    await select(1); await ready();
    api.call.mockImplementation(normal);
    pending.reject(new Error('controlled offline'));
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(puts()).toHaveLength(1);
    await advance(14_999); expect(puts()).toHaveLength(1);
    await advance(1); expect(puts()).toHaveLength(2);
    expect(puts().at(-1)![1].body.lastPositionSeconds).toBe(116);
    await advance(60_000); expect(puts()).toHaveLength(2);
    expect(uncaught).toEqual([]);
  });

  it("Today → Focus playback and checkpoint-context changes preserve the instance and final flush", async () => {
    fakeClock();
    await mount(false, {playback: 'running', checkpointContext: 'today'}); await ready();
    const player = instances[0]!;
    await playFor(player, 5);
    await act(async () => { root!.render(createElement(VideoPlayerPanel, {resource, playback: 'paused', checkpointContext: 'focus'})); });
    expect(instances).toHaveLength(1);
    expect(activeIntervalCount()).toBe(0);
    expect(puts()).toHaveLength(1);
    expect(puts()[0]![1].body).toEqual({lastPositionSeconds: 105, watchedSeconds: 25});
    await act(async () => { root!.render(createElement(VideoPlayerPanel, {resource, playback: 'running', checkpointContext: 'focus'})); });
    player.position = 106; await advance(1000);
    await unmount();
    await settle();
    expect(puts().at(-1)![1].body.lastPositionSeconds).toBe(106);
    expect(puts().every(([, options]) => options.expectedUserId === api.owner)).toBe(true);
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(activeIntervalCount()).toBe(0);
  });

  it("retirement flushes the cached point even if the SDK can no longer sample or destroy", async () => {
    fakeClock();
    await mount(); await ready();
    const player = instances[0]!;
    await act(async () => { player.playVideo(); });
    player.position = 101; await advance(1000);
    vi.spyOn(player, 'getCurrentTime').mockImplementation(() => { throw new Error('SDK already detached'); });
    player.destroy.mockImplementation(() => { throw new Error('SDK already detached'); });
    await unmount(); await settle();
    expect(puts().at(-1)![1].body.lastPositionSeconds).toBe(101);
    expect(container.querySelector('iframe')).toBeNull();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(uncaught).toEqual([]);
    vi.restoreAllMocks();
  });
});
