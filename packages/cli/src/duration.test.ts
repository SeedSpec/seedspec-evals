import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_DURATION_MS, parseDurationMs } from "./duration.js";

describe("parseDurationMs", () => {
  it("parses explicit millisecond, second, minute, and hour units", () => {
    expect(parseDurationMs("250ms")).toBe(250);
    expect(parseDurationMs("30s")).toBe(30_000);
    expect(parseDurationMs("15m")).toBe(15 * 60 * 1000);
    expect(parseDurationMs("30m")).toBe(DEFAULT_MAX_DURATION_MS);
    expect(parseDurationMs("1h")).toBe(3_600_000);
  });

  it("rejects missing units, zero, fractions, and unsafe durations", () => {
    expect(() => parseDurationMs("900000")).toThrow(/positive duration/);
    expect(() => parseDurationMs("0m")).toThrow(/positive duration/);
    expect(() => parseDurationMs("1.5m")).toThrow(/positive duration/);
    expect(() => parseDurationMs("999999999999999999999h")).toThrow(/too large/);
  });
});
