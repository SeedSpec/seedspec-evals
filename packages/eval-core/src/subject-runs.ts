import { z } from "zod";

import {
  IsoTimestampSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluatorUsageSchema } from "./evaluator-runs.js";

const CapturedFileSchema = z.strictObject({
  path: SafeRelativePathSchema,
  digest: Sha256DigestSchema,
  byteLength: z.number().int().nonnegative(),
});

export const SubjectRunBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  sourceRunId: RunIdSchema.optional(),
  runner: z.strictObject({
    id: z.literal("codex-cli"),
    version: z.string().trim().min(1).max(256),
  }),
  model: z.string().trim().min(1).max(256),
  modelSelector: z.string().trim().min(1).max(256),
  reasoningEffort: z.string().trim().min(1).max(64),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  status: z.enum(["succeeded", "failed"]),
  exitCode: z.number().int(),
  usage: EvaluatorUsageSchema,
  events: CapturedFileSchema.extend({
    count: z.number().int().nonnegative(),
    threadId: z.string().trim().min(1).max(256).optional(),
  }),
  stderr: CapturedFileSchema,
  finalMessage: CapturedFileSchema,
  trace: CapturedFileSchema.extend({
    traceId: z.string().regex(/^trace_[a-f0-9]{64}$/),
  }).optional(),
  limitations: z.array(z.string().trim().min(1).max(4_000)).max(64),
}).superRefine((run, context) => {
  if (Date.parse(run.finishedAt) < Date.parse(run.startedAt)) {
    context.addIssue({ code: "custom", message: "finishedAt cannot precede startedAt", path: ["finishedAt"] });
  }
  if (run.status === "succeeded" && (run.exitCode !== 0 || run.trace === undefined)) {
    context.addIssue({ code: "custom", message: "a successful subject run requires exit code zero and a finalized trace" });
  }
});

const SubjectRunDataSchema = SubjectRunBodySchema.safeExtend({
  subjectRunId: z.string().regex(/^subject_run_[a-f0-9]{64}$/),
}).superRefine((run, context) => {
  const { subjectRunId, ...body } = run;
  const parsed = SubjectRunBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("subject_run", parsed.data as unknown as JsonValue);
  if (subjectRunId !== expected) {
    context.addIssue({ code: "custom", message: `subjectRunId does not match run content; expected ${expected}`, path: ["subjectRunId"] });
  }
});

export const SubjectRunSchema = SubjectRunDataSchema.transform((value) => deepFreeze(value));
export type SubjectRun = DeepReadonly<z.infer<typeof SubjectRunDataSchema>>;

export function createSubjectRun(input: z.input<typeof SubjectRunBodySchema>): SubjectRun {
  const body = SubjectRunBodySchema.parse(input);
  return SubjectRunSchema.parse({
    ...body,
    subjectRunId: contentId("subject_run", body as unknown as JsonValue),
  });
}

export function parseSubjectRun(input: unknown): SubjectRun {
  return SubjectRunSchema.parse(input);
}
