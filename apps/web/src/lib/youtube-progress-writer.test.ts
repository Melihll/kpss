import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeProgressWriter, sharedYouTubeProgressWriter, type YouTubeCheckpoint } from "./youtube-progress-writer";

const point = (seconds: number, watched = seconds): YouTubeCheckpoint => ({ lastPositionSeconds: seconds, watchedSeconds: watched });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("existing YouTube progress PUT backpressure", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => vi.useRealTimers());

  it("does not write an unchanged verified initial checkpoint on ready/cleanup", async () => {
    const send = vi.fn(async (body: YouTubeCheckpoint) => body);
    const writer = new YouTubeProgressWriter({send, now: Date.now, initialCheckpoint: point(100, 20)});
    writer.flush(point(100, 20));
    writer.flush(point(100, 20));
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(writer.pendingCheckpoint()).toBeNull();
    writer.flush(point(101, 21));
    await settle();
    expect(send).toHaveBeenCalledExactlyOnceWith(point(101, 21));
  });

  it("exposes only the latest dirty checkpoint to the same stream's remount", async () => {
    const active = deferred<YouTubeCheckpoint>();
    const send = vi.fn().mockReturnValueOnce(active.promise).mockImplementation(async body => body);
    const writer = new YouTubeProgressWriter<YouTubeCheckpoint>({send, now: Date.now, initialCheckpoint: point(100, 20)});
    writer.flush(point(115, 35));
    await settle();
    writer.flush(point(116, 36));
    expect(writer.pendingCheckpoint()).toEqual(point(116, 36));
    expect(writer.pendingCheckpoint()).not.toBe(writer.pendingCheckpoint());
    active.resolve(point(115, 35));
    await settle();
    expect(send.mock.calls.map(([body]) => body)).toEqual([point(115, 35), point(116, 36)]);
    expect(writer.pendingCheckpoint()).toBeNull();
  });

  it("saves normal checkpoints at fifteen seconds and deduplicates unchanged lifecycle flushes", async () => {
    const send = vi.fn(async (body: YouTubeCheckpoint) => body);
    const saved = vi.fn();
    const writer = new YouTubeProgressWriter({ send, now: Date.now });
    writer.subscribe(saved, vi.fn());
    await vi.advanceTimersByTimeAsync(14_999);
    writer.checkpoint(point(14));
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    writer.checkpoint(point(15));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenLastCalledWith(point(15));
    writer.flush(point(15));
    writer.flush(point(15));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps one active PUT and only the latest pending snapshot during many slow ticks", async () => {
    const requests: Array<ReturnType<typeof deferred<YouTubeCheckpoint>>> = [];
    const bodies: YouTubeCheckpoint[] = [];
    let concurrent = 0;
    let maximumConcurrent = 0;
    const send = vi.fn((body: YouTubeCheckpoint) => {
      bodies.push(body);
      concurrent++;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      const request = deferred<YouTubeCheckpoint>();
      requests.push(request);
      return request.promise.finally(() => { concurrent--; });
    });
    const writer = new YouTubeProgressWriter({ send, now: Date.now });
    for (let second = 1; second <= 90; second++) {
      await vi.advanceTimersByTimeAsync(1000);
      writer.checkpoint(point(second));
      await settle();
    }
    expect(send).toHaveBeenCalledTimes(1);
    requests[0]!.resolve(point(15));
    await settle();
    expect(bodies).toEqual([point(15), point(90)]);
    requests[1]!.resolve(point(90));
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(maximumConcurrent).toBe(1);
  });

  it("does not retry on every tick after fast failures or create an automatic retry loop", async () => {
    const send = vi.fn(async () => { throw new Error("controlled network failure"); });
    const error = vi.fn();
    const writer = new YouTubeProgressWriter({ send, now: Date.now });
    writer.subscribe(vi.fn(), error);
    for (let second = 1; second <= 61; second++) {
      await vi.advanceTimersByTimeAsync(1000);
      writer.checkpoint(point(second));
      await settle();
    }
    expect(send).toHaveBeenCalledTimes(4);
    expect(error).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("coalesces critical updates into the latest value and ignores stale response callbacks", async () => {
    const first = deferred<YouTubeCheckpoint>();
    const second = deferred<YouTubeCheckpoint>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const saved = vi.fn();
    const writer = new YouTubeProgressWriter<YouTubeCheckpoint>({ send, now: Date.now });
    writer.subscribe(saved, vi.fn());
    writer.flush(point(350));
    await settle();
    for (const seconds of [361, 362, 363, 370]) writer.flush(point(seconds));
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve(point(350));
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(send.mock.calls.map(([body]) => body)).toEqual([point(350), point(370)]);
    second.resolve(point(370));
    await settle();
    expect(saved).toHaveBeenCalledExactlyOnceWith(point(370));
  });

  it("uses the same stream across Today/Focus and player remount without duplicate PUTs", async () => {
    const response = deferred<YouTubeCheckpoint>();
    const send = vi.fn(() => response.promise);
    const today = sharedYouTubeProgressWriter("owner:today-focus-test-video", { send, now: Date.now });
    const saved = vi.fn();
    const detach = today.subscribe(saved, vi.fn());
    today.flush(point(365));
    await settle();
    const focus = sharedYouTubeProgressWriter("owner:today-focus-test-video", { send, now: Date.now });
    expect(focus).toBe(today);
    detach();
    const focusSaved = vi.fn();
    focus.subscribe(focusSaved, vi.fn());
    focus.flush(point(365));
    response.resolve(point(365));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(focusSaved).toHaveBeenCalledExactlyOnceWith(point(365));
  });

  it("flushes the latest finish state after an active request even before the periodic interval", async () => {
    const active = deferred<YouTubeCheckpoint>();
    const send = vi.fn().mockReturnValueOnce(active.promise).mockImplementation(async (body) => body);
    const writer = new YouTubeProgressWriter<YouTubeCheckpoint>({ send, now: Date.now });
    const saved = vi.fn();
    writer.subscribe(saved, vi.fn());
    writer.flush(point(360));
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    writer.flush(point(371));
    active.resolve(point(360));
    await settle();
    expect(send.mock.calls.map(([body]) => body)).toEqual([point(360), point(371)]);
    expect(saved).toHaveBeenCalledExactlyOnceWith(point(371));
  });

  it("preserves a deliberate backward seek while rejecting the older higher-position response", async () => {
    const active = deferred<YouTubeCheckpoint>();
    const send = vi.fn().mockReturnValueOnce(active.promise).mockImplementation(async (body) => body);
    const writer = new YouTubeProgressWriter<YouTubeCheckpoint>({ send, now: Date.now });
    const saved = vi.fn();
    writer.subscribe(saved, vi.fn());
    writer.flush(point(370));
    await settle();
    writer.flush(point(100, 370));
    active.resolve(point(370));
    await settle();
    expect(saved).toHaveBeenCalledExactlyOnceWith(point(100, 370));
  });

  it("bounds retries for a newer critical final checkpoint after a failed active PUT", async () => {
    const active = deferred<YouTubeCheckpoint>();
    const send = vi.fn().mockReturnValueOnce(active.promise).mockRejectedValue(new Error("offline"));
    const writer = new YouTubeProgressWriter<YouTubeCheckpoint>({ send, now: Date.now });
    writer.flush(point(360));
    await settle();
    writer.flush(point(370));
    active.reject(new Error("offline"));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
