import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

const VerificationCommandSchema = z.strictObject({
  id: IdentifierSchema,
  argv: z.array(z.string().min(1).max(4_000)).min(1).max(128),
  cwd: SafeRelativePathSchema.optional(),
  testPaths: z.array(SafeRelativePathSchema).min(1).max(256).optional(),
});

const LinkedResultSchema = z.strictObject({
  id: z.string().trim().min(1).max(256),
  outcome: z.enum(["pass", "fail", "qualified", "partial", "not-run"]),
  commandIds: z.array(IdentifierSchema).min(1).max(32),
  evidence: z.array(SafeRelativePathSchema).min(1).max(128),
  assessment: z.string().trim().min(1).max(8_000).optional(),
});

export const ImplementationAcceptanceReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  verificationCommands: z.array(VerificationCommandSchema).min(1).max(32),
  scenarios: z.array(LinkedResultSchema).min(1).max(512),
  accessibility: z.strictObject({
    viewportWidth: z.number().int().positive().max(16_384),
    keyboardTasks: z.array(LinkedResultSchema).min(1).max(128),
  }).optional(),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
}).superRefine((report, context) => {
  const commandIds = new Set(report.verificationCommands.map(({ id }) => id));
  if (commandIds.size !== report.verificationCommands.length) {
    context.addIssue({ code: "custom", message: "verification command IDs must be unique", path: ["verificationCommands"] });
  }
  const linked = [...report.scenarios, ...(report.accessibility?.keyboardTasks ?? [])];
  const resultIds = linked.map(({ id }) => id);
  if (new Set(resultIds).size !== resultIds.length) {
    context.addIssue({ code: "custom", message: "scenario and keyboard-task IDs must be unique", path: ["scenarios"] });
  }
  for (const [index, result] of linked.entries()) {
    const unknown = result.commandIds.filter((id) => !commandIds.has(id));
    if (unknown.length > 0) {
      context.addIssue({
        code: "custom",
        message: `unknown verification command IDs: ${unknown.join(", ")}`,
        path: index < report.scenarios.length
          ? ["scenarios", index, "commandIds"]
          : ["accessibility", "keyboardTasks", index - report.scenarios.length, "commandIds"],
      });
    }
  }
});

export type ImplementationAcceptanceReport = z.infer<typeof ImplementationAcceptanceReportSchema>;

const CommandExecutionSchema = z.strictObject({
  id: IdentifierSchema,
  argv: z.array(z.string().min(1).max(4_000)).min(1).max(128),
  cwd: SafeRelativePathSchema.optional(),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  sandbox: z.enum(["darwin-sandbox-exec", "unsandboxed"]),
  outcome: z.enum(["pass", "fail", "timed-out"]),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(32_000),
  stderr: z.string().max(32_000),
});

const EvidenceObservationSchema = z.strictObject({
  path: SafeRelativePathSchema,
  exists: z.boolean(),
  digest: Sha256DigestSchema.optional(),
});

const ReportConformanceSchema = z.strictObject({
  outcome: z.enum(["conformant", "normalized-extra-fields"]),
  diagnostics: z.array(z.strictObject({
    path: z.string().min(1).max(1_000),
    keys: z.array(z.string().min(1).max(256)).min(1).max(128),
  })).max(1_000),
});

export const ImplementationVerificationBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  createdAt: IsoTimestampSchema,
  reportPath: SafeRelativePathSchema,
  reportDigest: Sha256DigestSchema,
  commands: z.array(CommandExecutionSchema).min(1).max(32),
  evidence: z.array(EvidenceObservationSchema).max(10_000),
  report: ImplementationAcceptanceReportSchema,
  reportConformance: ReportConformanceSchema.optional(),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
});

const ImplementationVerificationDataSchema = ImplementationVerificationBodySchema.safeExtend({
  verificationId: z.string().regex(/^verification_[a-f0-9]{64}$/),
}).superRefine((verification, context) => {
  const { verificationId, ...body } = verification;
  const parsed = ImplementationVerificationBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("verification", parsed.data as unknown as JsonValue);
  if (verificationId !== expected) {
    context.addIssue({
      code: "custom",
      message: `verificationId does not match content; expected ${expected}`,
      path: ["verificationId"],
    });
  }
});

export const ImplementationVerificationSchema =
  ImplementationVerificationDataSchema.transform((value) => deepFreeze(value));

export type ImplementationVerificationBody = z.infer<typeof ImplementationVerificationBodySchema>;
export type ImplementationVerification =
  DeepReadonly<z.infer<typeof ImplementationVerificationDataSchema>>;

export function createImplementationVerification(
  input: ImplementationVerificationBody,
): ImplementationVerification {
  const body = ImplementationVerificationBodySchema.parse(input);
  return ImplementationVerificationSchema.parse({
    ...body,
    verificationId: contentId("verification", body as unknown as JsonValue),
  });
}

export function parseImplementationVerification(input: unknown): ImplementationVerification {
  return ImplementationVerificationSchema.parse(input);
}

const CounterfactualExecutionSchema = z.strictObject({
  candidateId: IdentifierSchema,
  commandId: IdentifierSchema,
  argv: z.array(z.string().min(1).max(4_000)).min(1).max(128),
  cwd: SafeRelativePathSchema.optional(),
  testPaths: z.array(SafeRelativePathSchema).min(1).max(256),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  sandbox: z.enum(["darwin-sandbox-exec", "unsandboxed"]),
  rawOutcome: z.enum(["pass", "fail", "timed-out"]),
  distinguishes: z.boolean(),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(32_000),
  stderr: z.string().max(32_000),
});

export const CounterfactualVerificationBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  implementationVerificationId: z.string().regex(/^verification_[a-f0-9]{64}$/),
  createdAt: IsoTimestampSchema,
  candidates: z.array(z.strictObject({
    id: IdentifierSchema,
    path: z.string().trim().min(1).max(4_096),
    digest: Sha256DigestSchema,
  })).min(1).max(64),
  executions: z.array(CounterfactualExecutionSchema).max(2_048),
  summary: z.strictObject({
    distinguishing: z.number().int().nonnegative(),
    nonDistinguishing: z.number().int().nonnegative(),
    unevaluated: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
}).superRefine((verification, context) => {
  const candidateIds = verification.candidates.map(({ id }) => id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({ code: "custom", message: "counterfactual candidate IDs must be unique", path: ["candidates"] });
  }
  const knownCandidates = new Set(candidateIds);
  for (const [index, execution] of verification.executions.entries()) {
    if (!knownCandidates.has(execution.candidateId)) {
      context.addIssue({
        code: "custom",
        message: `execution references unknown candidate ${execution.candidateId}`,
        path: ["executions", index, "candidateId"],
      });
    }
    if (execution.distinguishes !== (execution.rawOutcome === "fail")) {
      context.addIssue({
        code: "custom",
        message: "distinguishes must be true exactly when the candidate command fails",
        path: ["executions", index, "distinguishes"],
      });
    }
  }
  const expected = {
    distinguishing: verification.executions.filter(({ distinguishes }) => distinguishes).length,
    nonDistinguishing: verification.executions.filter(({ rawOutcome }) => rawOutcome === "pass").length,
    unevaluated: verification.executions.filter(({ rawOutcome }) => rawOutcome === "timed-out").length,
  };
  if (
    verification.summary.distinguishing !== expected.distinguishing
    || verification.summary.nonDistinguishing !== expected.nonDistinguishing
    || verification.summary.unevaluated !== expected.unevaluated
  ) {
    context.addIssue({
      code: "custom",
      message: "counterfactual summary does not match executions",
      path: ["summary"],
    });
  }
});

const CounterfactualVerificationDataSchema = CounterfactualVerificationBodySchema.safeExtend({
  counterfactualVerificationId: z.string().regex(/^counterfactual_verification_[a-f0-9]{64}$/),
}).superRefine((verification, context) => {
  const { counterfactualVerificationId, ...body } = verification;
  const parsed = CounterfactualVerificationBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("counterfactual_verification", parsed.data as unknown as JsonValue);
  if (counterfactualVerificationId !== expected) {
    context.addIssue({
      code: "custom",
      message: `counterfactualVerificationId does not match content; expected ${expected}`,
      path: ["counterfactualVerificationId"],
    });
  }
});

export const CounterfactualVerificationSchema =
  CounterfactualVerificationDataSchema.transform((value) => deepFreeze(value));

export type CounterfactualVerificationBody =
  z.infer<typeof CounterfactualVerificationBodySchema>;
export type CounterfactualVerification =
  DeepReadonly<z.infer<typeof CounterfactualVerificationDataSchema>>;

export function createCounterfactualVerification(
  input: CounterfactualVerificationBody,
): CounterfactualVerification {
  const body = CounterfactualVerificationBodySchema.parse(input);
  return CounterfactualVerificationSchema.parse({
    ...body,
    counterfactualVerificationId: contentId(
      "counterfactual_verification",
      body as unknown as JsonValue,
    ),
  });
}

export function parseCounterfactualVerification(input: unknown): CounterfactualVerification {
  return CounterfactualVerificationSchema.parse(input);
}
