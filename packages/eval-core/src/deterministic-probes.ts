import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  SafeRelativePathSchema,
  SemVerSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

export const DeterministicProbeControlSchema = z.strictObject({
  candidateId: IdentifierSchema,
  expectedOutcome: z.enum(["pass", "fail"]),
  rationale: z.string().trim().min(1).max(4_000),
});

export const DeterministicProbeBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  case: z.strictObject({
    id: IdentifierSchema,
    version: SemVerSchema,
    digest: Sha256DigestSchema,
  }),
  qualificationId: z.string().regex(/^qualification_[a-f0-9]{64}$/),
  sourceProbeIds: z.array(IdentifierSchema).min(2).max(256),
  createdAt: IsoTimestampSchema,
  description: z.string().trim().min(1).max(8_000),
  command: z.strictObject({
    argv: z.array(z.string().min(1).max(4_000)).min(1).max(64),
    cwd: SafeRelativePathSchema.optional(),
    timeoutMs: z.number().int().positive().max(10 * 60_000).default(120_000),
  }),
  controls: z.array(DeterministicProbeControlSchema).min(2).max(256),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
}).superRefine((probe, context) => {
  if (new Set(probe.sourceProbeIds).size !== probe.sourceProbeIds.length) {
    context.addIssue({
      code: "custom",
      message: "sourceProbeIds must be unique",
      path: ["sourceProbeIds"],
    });
  }
  const candidateIds = probe.controls.map(({ candidateId }) => candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({
      code: "custom",
      message: "deterministic probe controls must reference unique candidates",
      path: ["controls"],
    });
  }
  if (!probe.controls.some(({ expectedOutcome }) => expectedOutcome === "fail")) {
    context.addIssue({
      code: "custom",
      message: "deterministic probes require a known-bad control expected to fail",
      path: ["controls"],
    });
  }
  if (!probe.controls.some(({ expectedOutcome }) => expectedOutcome === "pass")) {
    context.addIssue({
      code: "custom",
      message: "deterministic probes require a valid-alternative control expected to pass",
      path: ["controls"],
    });
  }
});

const DeterministicProbeDataSchema = DeterministicProbeBodySchema.safeExtend({
  probeId: z.string().regex(/^deterministic_probe_[a-f0-9]{64}$/),
}).superRefine((probe, context) => {
  const { probeId, ...body } = probe;
  const parsed = DeterministicProbeBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("deterministic_probe", parsed.data as unknown as JsonValue);
  if (probeId !== expected) {
    context.addIssue({
      code: "custom",
      message: `probeId does not match probe content; expected ${expected}`,
      path: ["probeId"],
    });
  }
});

export const DeterministicProbeSchema =
  DeterministicProbeDataSchema.transform((value) => deepFreeze(value));
export type DeterministicProbe =
  DeepReadonly<z.infer<typeof DeterministicProbeDataSchema>>;

export function createDeterministicProbe(
  input: z.input<typeof DeterministicProbeBodySchema>,
): DeterministicProbe {
  const body = DeterministicProbeBodySchema.parse(input);
  return DeterministicProbeSchema.parse({
    ...body,
    probeId: contentId("deterministic_probe", body as unknown as JsonValue),
  });
}

export function parseDeterministicProbe(input: unknown): DeterministicProbe {
  return DeterministicProbeSchema.parse(input);
}

export const DeterministicProbeExecutionSchema = z.strictObject({
  candidateId: IdentifierSchema,
  artifactDigest: Sha256DigestSchema,
  expectedOutcome: z.enum(["pass", "fail"]),
  observedOutcome: z.enum(["pass", "fail", "timed-out"]),
  matchesExpectation: z.boolean(),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  sandbox: z.enum(["darwin-sandbox-exec", "unsandboxed"]),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(32_100),
  stderr: z.string().max(32_100),
});

export const DeterministicProbeResultBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  probeId: z.string().regex(/^deterministic_probe_[a-f0-9]{64}$/),
  qualificationId: z.string().regex(/^qualification_[a-f0-9]{64}$/),
  createdAt: IsoTimestampSchema,
  executions: z.array(DeterministicProbeExecutionSchema).min(2).max(256),
  status: z.enum(["passed", "failed", "inconclusive"]),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
}).superRefine((result, context) => {
  const expectedStatus = result.executions.some(({ observedOutcome }) => observedOutcome === "timed-out")
    ? "inconclusive"
    : result.executions.every(({ matchesExpectation }) => matchesExpectation)
      ? "passed"
      : "failed";
  if (result.status !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: `probe result status does not match executions; expected ${expectedStatus}`,
      path: ["status"],
    });
  }
});

const DeterministicProbeResultDataSchema = DeterministicProbeResultBodySchema.safeExtend({
  probeResultId: z.string().regex(/^probe_result_[a-f0-9]{64}$/),
}).superRefine((result, context) => {
  const { probeResultId, ...body } = result;
  const parsed = DeterministicProbeResultBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("probe_result", parsed.data as unknown as JsonValue);
  if (probeResultId !== expected) {
    context.addIssue({
      code: "custom",
      message: `probeResultId does not match result content; expected ${expected}`,
      path: ["probeResultId"],
    });
  }
});

export const DeterministicProbeResultSchema =
  DeterministicProbeResultDataSchema.transform((value) => deepFreeze(value));
export type DeterministicProbeResult =
  DeepReadonly<z.infer<typeof DeterministicProbeResultDataSchema>>;

export function createDeterministicProbeResult(
  input: z.input<typeof DeterministicProbeResultBodySchema>,
): DeterministicProbeResult {
  const body = DeterministicProbeResultBodySchema.parse(input);
  return DeterministicProbeResultSchema.parse({
    ...body,
    probeResultId: contentId("probe_result", body as unknown as JsonValue),
  });
}

export function parseDeterministicProbeResult(input: unknown): DeterministicProbeResult {
  return DeterministicProbeResultSchema.parse(input);
}
