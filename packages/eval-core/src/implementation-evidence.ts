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
});

const LinkedResultSchema = z.strictObject({
  id: z.string().trim().min(1).max(256),
  outcome: z.enum(["pass", "fail"]),
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

export const ImplementationVerificationBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  createdAt: IsoTimestampSchema,
  reportPath: SafeRelativePathSchema,
  reportDigest: Sha256DigestSchema,
  commands: z.array(CommandExecutionSchema).min(1).max(32),
  evidence: z.array(EvidenceObservationSchema).max(10_000),
  report: ImplementationAcceptanceReportSchema,
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
