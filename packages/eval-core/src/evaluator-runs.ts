import { z } from "zod";

import {
  IsoTimestampSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

export const EvaluatorUsageSchema = z.strictObject({
  capture: z.enum(["provider-reported", "unavailable"]),
  inputTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  reasoningOutputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
}).superRefine((usage, context) => {
  if (usage.capture === "provider-reported"
    && [usage.inputTokens, usage.cachedInputTokens, usage.outputTokens].some((value) => value === undefined)) {
    context.addIssue({ code: "custom", message: "provider-reported usage requires input, cached input, and output counts" });
  }
  if (usage.capture === "unavailable"
    && [usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.reasoningOutputTokens, usage.totalTokens]
      .some((value) => value !== undefined)) {
    context.addIssue({ code: "custom", message: "unavailable usage cannot contain token counts" });
  }
});

export const EvaluatorRunBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  evidenceId: z.string().regex(/^evidence_[a-f0-9]{64}$/),
  profileId: z.string().regex(/^profile_[a-f0-9]{64}$/).optional(),
  runner: z.strictObject({
    id: z.literal("codex-cli"),
    version: z.string().trim().min(1).max(256),
  }),
  model: z.string().trim().min(1).max(256),
  reasoningEffort: z.string().trim().min(1).max(64),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  status: z.enum(["succeeded", "failed"]),
  exitCode: z.number().int(),
  usage: EvaluatorUsageSchema,
  events: z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
    byteLength: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
    threadId: z.string().trim().min(1).max(256).optional(),
  }),
  stderr: z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
    byteLength: z.number().int().nonnegative(),
  }),
  finalMessage: z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
    byteLength: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string().trim().min(1).max(4_000)).max(64),
}).superRefine((run, context) => {
  if (Date.parse(run.finishedAt) < Date.parse(run.startedAt)) {
    context.addIssue({ code: "custom", message: "finishedAt cannot precede startedAt", path: ["finishedAt"] });
  }
  if (run.status === "succeeded" && (run.exitCode !== 0 || run.profileId === undefined)) {
    context.addIssue({ code: "custom", message: "a successful evaluator run requires exit code zero and a finalized profile" });
  }
});

const EvaluatorRunDataSchema = EvaluatorRunBodySchema.safeExtend({
  evaluatorRunId: z.string().regex(/^evaluator_run_[a-f0-9]{64}$/),
}).superRefine((run, context) => {
  const { evaluatorRunId, ...body } = run;
  const parsed = EvaluatorRunBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("evaluator_run", parsed.data as unknown as JsonValue);
  if (evaluatorRunId !== expected) {
    context.addIssue({ code: "custom", message: `evaluatorRunId does not match run content; expected ${expected}`, path: ["evaluatorRunId"] });
  }
});

export const EvaluatorRunSchema = EvaluatorRunDataSchema.transform((value) => deepFreeze(value));
export type EvaluatorRun = DeepReadonly<z.infer<typeof EvaluatorRunDataSchema>>;

export function createEvaluatorRun(input: z.input<typeof EvaluatorRunBodySchema>): EvaluatorRun {
  const body = EvaluatorRunBodySchema.parse(input);
  return EvaluatorRunSchema.parse({
    ...body,
    evaluatorRunId: contentId("evaluator_run", body as unknown as JsonValue),
  });
}

export function parseEvaluatorRun(input: unknown): EvaluatorRun {
  return EvaluatorRunSchema.parse(input);
}
