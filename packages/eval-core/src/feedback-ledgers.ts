import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

export const EvalFeedbackLayerSchema = z.enum([
  "skill-activation",
  "skill-protocol",
  "skill-reference-loading",
  "harness",
  "evaluation-case",
  "deterministic-evaluator",
  "semantic-evaluator",
  "model-capability",
]);

export const EvalFeedbackEvidenceSchema = z.strictObject({
  kind: z.enum([
    "run",
    "profile",
    "comparison",
    "qualification",
    "blind-review",
    "probe-result",
    "note",
  ]),
  artifactId: z.string().trim().min(1).max(256).optional(),
  path: SafeRelativePathSchema.optional(),
  digest: Sha256DigestSchema.optional(),
  claim: z.string().trim().min(1).max(4_000),
}).superRefine((evidence, context) => {
  if (evidence.kind !== "note" && evidence.artifactId === undefined && evidence.path === undefined) {
    context.addIssue({
      code: "custom",
      message: "non-note feedback evidence must identify an artifact or path",
    });
  }
});

export const EvalFeedbackVerificationSchema = z.strictObject({
  method: z.enum([
    "deterministic-probe",
    "paired-experiment",
    "semantic-review",
    "manual-inspection",
  ]),
  status: z.enum(["planned", "passed", "failed", "inconclusive"]),
  artifactIds: z.array(z.string().trim().min(1).max(256)).max(128),
  assessment: z.string().trim().min(1).max(4_000),
});

export const EvalFeedbackEntrySchema = z.strictObject({
  id: IdentifierSchema,
  disposition: z.enum(["change", "verify", "consider"]),
  summary: z.string().trim().min(1).max(4_000),
  failureMechanism: z.string().trim().min(1).max(8_000).optional(),
  owningLayer: EvalFeedbackLayerSchema,
  proposedAction: z.string().trim().min(1).max(8_000).optional(),
  negativeControls: z.array(z.string().trim().min(1).max(4_000)).max(64).default([]),
  evidence: z.array(EvalFeedbackEvidenceSchema).max(256),
  status: z.enum(["open", "accepted", "rejected", "implemented", "verified"]),
  verification: EvalFeedbackVerificationSchema.optional(),
}).superRefine((entry, context) => {
  if (entry.disposition === "change") {
    if (entry.failureMechanism === undefined) {
      context.addIssue({
        code: "custom",
        message: "a change entry requires an observed failure mechanism",
        path: ["failureMechanism"],
      });
    }
    if (entry.proposedAction === undefined) {
      context.addIssue({
        code: "custom",
        message: "a change entry requires a proposed action",
        path: ["proposedAction"],
      });
    }
    if (entry.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        message: "a change entry requires evidence",
        path: ["evidence"],
      });
    }
  }
  if (entry.owningLayer === "deterministic-evaluator"
    && entry.disposition === "change"
    && entry.negativeControls.length === 0) {
    context.addIssue({
      code: "custom",
      message: "deterministic-evaluator changes require a valid-alternative negative control",
      path: ["negativeControls"],
    });
  }
  if (entry.status === "verified"
    && (entry.verification === undefined || entry.verification.status !== "passed")) {
    context.addIssue({
      code: "custom",
      message: "verified feedback requires a passing verification record",
      path: ["verification"],
    });
  }
  if (entry.status === "implemented"
    && entry.disposition !== "change") {
    context.addIssue({
      code: "custom",
      message: "only change entries can have implemented status",
      path: ["status"],
    });
  }
});

export const EvalFeedbackLedgerBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: IsoTimestampSchema,
  scope: z.strictObject({
    kind: z.enum(["skill", "case", "evaluator", "framework"]),
    id: IdentifierSchema,
    digest: Sha256DigestSchema.optional(),
  }),
  entries: z.array(EvalFeedbackEntrySchema).min(1).max(10_000),
  summary: z.string().trim().min(1).max(16_000),
}).superRefine((ledger, context) => {
  const ids = ledger.entries.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "feedback entry IDs must be unique",
      path: ["entries"],
    });
  }
});

const EvalFeedbackLedgerDataSchema = EvalFeedbackLedgerBodySchema.safeExtend({
  feedbackLedgerId: z.string().regex(/^feedback_ledger_[a-f0-9]{64}$/),
}).superRefine((ledger, context) => {
  const { feedbackLedgerId, ...body } = ledger;
  const parsed = EvalFeedbackLedgerBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("feedback_ledger", parsed.data as unknown as JsonValue);
  if (feedbackLedgerId !== expected) {
    context.addIssue({
      code: "custom",
      message: `feedbackLedgerId does not match ledger content; expected ${expected}`,
      path: ["feedbackLedgerId"],
    });
  }
});

export const EvalFeedbackLedgerSchema = EvalFeedbackLedgerDataSchema.transform((value) =>
  deepFreeze(value));
export type EvalFeedbackLedger =
  DeepReadonly<z.infer<typeof EvalFeedbackLedgerDataSchema>>;

export function createEvalFeedbackLedger(
  input: z.input<typeof EvalFeedbackLedgerBodySchema>,
): EvalFeedbackLedger {
  const body = EvalFeedbackLedgerBodySchema.parse(input);
  return EvalFeedbackLedgerSchema.parse({
    ...body,
    feedbackLedgerId: contentId("feedback_ledger", body as unknown as JsonValue),
  });
}

export function parseEvalFeedbackLedger(input: unknown): EvalFeedbackLedger {
  return EvalFeedbackLedgerSchema.parse(input);
}
