export function boundedObservedTiming(
  eventAt: string,
  startedAtMs: number,
  finishedAtMs: number,
): { timestamp: string; observedElapsedMs: number } {
  const parsed = Date.parse(eventAt);
  const bounded = Math.min(
    finishedAtMs,
    Math.max(startedAtMs, Number.isFinite(parsed) ? parsed : finishedAtMs),
  );
  return {
    timestamp: new Date(bounded).toISOString(),
    observedElapsedMs: Math.max(0, bounded - startedAtMs),
  };
}
