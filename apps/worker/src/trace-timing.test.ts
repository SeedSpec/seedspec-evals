import { describe, expect, it } from "vitest";

import { boundedObservedTiming } from "./trace-timing.js";

describe("Think trace timing", () => {
  it("binds a durable event timestamp to elapsed run time", () => {
    expect(boundedObservedTiming(
      "2026-07-24T12:00:03.500Z",
      Date.parse("2026-07-24T12:00:01.000Z"),
      Date.parse("2026-07-24T12:00:10.000Z"),
    )).toEqual({
      timestamp: "2026-07-24T12:00:03.500Z",
      observedElapsedMs: 2_500,
    });
  });

  it("bounds invalid and out-of-run timestamps to the durable run interval", () => {
    const startedAtMs = Date.parse("2026-07-24T12:00:01.000Z");
    const finishedAtMs = Date.parse("2026-07-24T12:00:10.000Z");

    expect(boundedObservedTiming("invalid", startedAtMs, finishedAtMs)).toEqual({
      timestamp: "2026-07-24T12:00:10.000Z",
      observedElapsedMs: 9_000,
    });
    expect(boundedObservedTiming("2026-07-24T11:59:00.000Z", startedAtMs, finishedAtMs)).toEqual({
      timestamp: "2026-07-24T12:00:01.000Z",
      observedElapsedMs: 0,
    });
  });
});
