export interface ActiveStudyElapsedInput {
  startedAt: string;
  nowMs: number;
  closedBreakSeconds?: number;
  openBreakStartedAt?: string | null;
}

export function activeStudyElapsedMinutes({
  startedAt,
  nowMs,
  closedBreakSeconds = 0,
  openBreakStartedAt = null,
}: ActiveStudyElapsedInput): number {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;

  const wallSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);
  const safeClosedBreakSeconds = Number.isFinite(closedBreakSeconds)
    ? Math.max(0, closedBreakSeconds)
    : 0;

  let openBreakSeconds = 0;
  if (openBreakStartedAt) {
    const parsedOpenBreakMs = Date.parse(openBreakStartedAt);
    if (Number.isFinite(parsedOpenBreakMs)) {
      const openBreakMs = Math.max(startedAtMs, parsedOpenBreakMs);
      openBreakSeconds = Math.max(0, (nowMs - openBreakMs) / 1000);
    }
  }

  const effectiveSeconds = Math.max(
    0,
    wallSeconds - safeClosedBreakSeconds - openBreakSeconds,
  );

  return Math.floor(effectiveSeconds / 60);
}