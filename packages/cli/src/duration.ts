import { InvalidArgumentError } from "commander";

export const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000;

const UNIT_MULTIPLIERS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
} as const;

export function parseDurationMs(value: string): number {
  const match = /^([1-9]\d*)(ms|s|m|h)$/.exec(value.trim().toLowerCase());
  if (match === null) {
    throw new InvalidArgumentError("must be a positive duration such as 30s, 15m, or 1h");
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MULTIPLIERS;
  const durationMs = amount * UNIT_MULTIPLIERS[unit];
  if (!Number.isSafeInteger(durationMs)) {
    throw new InvalidArgumentError("duration is too large");
  }
  return durationMs;
}
