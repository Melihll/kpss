import { YOUTUBE_PROGRESS_CHECKPOINT_MS } from "./youtube-player-progress";

export interface YouTubeCheckpoint {
  readonly lastPositionSeconds: number;
  readonly watchedSeconds: number;
}

interface VersionedCheckpoint {
  readonly body: YouTubeCheckpoint;
  readonly revision: number;
  readonly critical: boolean;
}

interface WriterOptions<Result> {
  send: (body: YouTubeCheckpoint) => Promise<Result>;
  now?: () => number;
  intervalMs?: number;
  onIdle?: () => void;
}

/** Transport backpressure for the existing progress PUT, not another tracker. */
export class YouTubeProgressWriter<Result> {
  private readonly now: () => number;
  private readonly interval: number;
  private lastAttempt: number;
  private retryAfter = 0;
  private latest: VersionedCheckpoint | null = null;
  private pending: VersionedCheckpoint | null = null;
  private active: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private readonly listeners = new Set<{ saved: (value: Result) => void; error: () => void }>();

  constructor(private readonly options: WriterOptions<Result>) {
    this.now = options.now ?? (() => performance.now());
    this.interval = options.intervalMs ?? YOUTUBE_PROGRESS_CHECKPOINT_MS;
    this.lastAttempt = this.now();
  }

  subscribe(saved: (value: Result) => void, error: () => void): () => void {
    const listener = { saved, error };
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); this.discardIfIdle(); };
  }

  observe(body: YouTubeCheckpoint): void {
    if (this.latest?.body.lastPositionSeconds === body.lastPositionSeconds &&
        this.latest.body.watchedSeconds === body.watchedSeconds) return;
    this.latest = { body: { ...body }, revision: (this.latest?.revision ?? 0) + 1, critical: false };
    this.dirty = true;
    if (this.pending) this.pending = { ...this.latest, critical: this.pending.critical };
  }

  checkpoint(body: YouTubeCheckpoint): void {
    this.observe(body);
    if (!this.dirty || !this.latest || this.now() < Math.max(this.lastAttempt + this.interval, this.retryAfter)) return;
    this.pending = { ...this.latest, critical: this.pending?.critical ?? false };
    this.pump();
  }

  /** Explicit lifecycle flush coalesces with active/pending work, including seeks. */
  flush(body?: YouTubeCheckpoint): void {
    if (body) this.observe(body);
    if (!this.dirty || !this.latest) return;
    this.pending = { ...this.latest, critical: true };
    this.pump();
  }

  private pump(): void {
    if (this.active || !this.pending) return;
    const eligible = this.pending.critical ? this.retryAfter : Math.max(this.lastAttempt + this.interval, this.retryAfter);
    if (this.now() < eligible) {
      // Only an explicit critical flush schedules one delayed attempt. Normal
      // errors wait for the next eligible playback checkpoint, never auto-loop.
      if (this.pending.critical && this.retryTimer === null) {
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.pump(); }, eligible - this.now());
      }
      return;
    }
    if (this.retryTimer !== null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    const sent = this.pending;
    this.pending = null;
    this.lastAttempt = this.now();
    this.active = Promise.resolve()
      .then(() => this.options.send(sent.body))
      .then((result) => {
        this.retryAfter = 0;
        if (sent.revision === this.latest?.revision) {
          this.dirty = false;
          if (this.pending?.revision === sent.revision) this.pending = null;
          for (const listener of this.listeners) listener.saved(result);
        }
      })
      .catch(() => {
        this.retryAfter = this.now() + this.interval;
        // Retain the latest dirty state. A *newer* critical snapshot that was
        // already waiting gets one delayed attempt; its own failure is not retried.
        const newerCritical = Boolean(this.pending?.critical && this.pending.revision > sent.revision);
        if (this.latest) this.pending = { ...this.latest, critical: newerCritical };
        for (const listener of this.listeners) listener.error();
      })
      .finally(() => { this.active = null; this.pump(); this.discardIfIdle(); });
  }

  private discardIfIdle(): void {
    if (!this.dirty && !this.active && !this.pending && this.listeners.size === 0) this.options.onIdle?.();
  }
}

// One writer across player remounts/drawers for the same owned catalog stream.
const streams = new Map<string, unknown>();
export function sharedYouTubeProgressWriter<Result>(key: string, options: WriterOptions<Result>): YouTubeProgressWriter<Result> {
  let writer = streams.get(key) as YouTubeProgressWriter<Result> | undefined;
  if (!writer) {
    writer = new YouTubeProgressWriter({ ...options, onIdle: () => { if (streams.get(key) === writer) streams.delete(key); } });
    streams.set(key, writer);
  }
  return writer;
}
