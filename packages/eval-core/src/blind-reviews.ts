import { z } from "zod";

import {
  ArtifactIdSchema,
  IdentifierSchema,
  IsoTimestampSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  addUniqueIdIssues,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { TechnicalExpectationSchema } from "./cases.js";
import { ImplementationAcceptanceReportSchema } from "./implementation-evidence.js";
import {
  ProfileEvaluatorSchema,
  TechnicalCheckSchema,
  TechnicalQualityAssessmentSchema,
  TECHNICAL_QUALITY_RUBRIC_VERSION,
} from "./profiles.js";

const BlindSubjectIdSchema = z.string().regex(/^blind_subject_[a-f0-9]{64}$/);
const BlindEvidenceIdSchema = z.string().regex(/^blind_evidence_[a-f0-9]{64}$/);
const BlindReviewIdSchema = z.string().regex(/^blind_review_[a-f0-9]{64}$/);

const BlindArtifactSchema = z.strictObject({
  artifactId: ArtifactIdSchema,
  path: SafeRelativePathSchema,
  role: z.enum(["authored-input", "realization", "verification-evidence"]),
  mediaType: z.string().trim().min(1).max(256),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  digest: Sha256DigestSchema,
});

const BlindCommandExecutionSchema = z.strictObject({
  id: IdentifierSchema,
  argv: z.array(z.string().min(1).max(4_000)).min(1).max(128),
  cwd: SafeRelativePathSchema.optional(),
  outcome: z.enum(["pass", "fail", "timed-out"]),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(32_000),
  stderr: z.string().max(32_000),
});

export const BlindTechnicalEvidenceBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  blindSubjectId: BlindSubjectIdSchema,
  createdAt: IsoTimestampSchema,
  evaluatorRequest: z.strictObject({
    runner: z.enum(["codex", "claude-code"]),
    model: z.string().trim().min(1).max(256),
    reasoningEffort: z.string().trim().min(1).max(64),
  }),
  technicalExpectations: z.array(TechnicalExpectationSchema).max(256),
  artifacts: z.array(BlindArtifactSchema).min(1).max(20_000),
  verification: z.strictObject({
    reportDigest: Sha256DigestSchema,
    report: ImplementationAcceptanceReportSchema,
    commands: z.array(BlindCommandExecutionSchema).min(1).max(32),
    limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
  }),
  evaluatorGuidance: z.array(z.strictObject({
    id: IdentifierSchema,
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
  })).min(1).max(16),
  instructions: z.array(z.string().trim().min(1).max(4_000)).min(1).max(64),
});

const BlindTechnicalEvidenceDataSchema = BlindTechnicalEvidenceBodySchema.safeExtend({
  blindEvidenceId: BlindEvidenceIdSchema,
}).superRefine((evidence, context) => {
  const { blindEvidenceId, ...body } = evidence;
  const parsed = BlindTechnicalEvidenceBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("blind_evidence", parsed.data as unknown as JsonValue);
  if (blindEvidenceId !== expected) {
    context.addIssue({
      code: "custom",
      message: `blindEvidenceId does not match content; expected ${expected}`,
      path: ["blindEvidenceId"],
    });
  }
});

export const BlindTechnicalEvidenceSchema =
  BlindTechnicalEvidenceDataSchema.transform((value) => deepFreeze(value));

export const BlindTechnicalReviewBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  blindSubjectId: BlindSubjectIdSchema,
  blindEvidenceId: BlindEvidenceIdSchema,
  createdAt: IsoTimestampSchema,
  evaluator: ProfileEvaluatorSchema,
  checks: z.array(TechnicalCheckSchema).max(10_000),
  quality: TechnicalQualityAssessmentSchema,
  summary: z.string().trim().min(1).max(16_000),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(256),
}).superRefine((review, context) => {
  addUniqueIdIssues(review.checks, context, ["checks"]);
  if (review.evaluator.kind !== "agent" || review.evaluator.model === undefined) {
    context.addIssue({
      code: "custom",
      message: "blind technical review requires an agent evaluator with exact model metadata",
      path: ["evaluator"],
    });
  }
  if (review.quality.rubricVersion !== TECHNICAL_QUALITY_RUBRIC_VERSION) {
    context.addIssue({
      code: "custom",
      message: `blind technical review must use rubric ${TECHNICAL_QUALITY_RUBRIC_VERSION}`,
      path: ["quality", "rubricVersion"],
    });
  }
});

const BlindTechnicalReviewDataSchema = BlindTechnicalReviewBodySchema.safeExtend({
  blindReviewId: BlindReviewIdSchema,
}).superRefine((review, context) => {
  const { blindReviewId, ...body } = review;
  const parsed = BlindTechnicalReviewBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("blind_review", parsed.data as unknown as JsonValue);
  if (blindReviewId !== expected) {
    context.addIssue({
      code: "custom",
      message: `blindReviewId does not match content; expected ${expected}`,
      path: ["blindReviewId"],
    });
  }
});

export const BlindTechnicalReviewSchema =
  BlindTechnicalReviewDataSchema.transform((value) => deepFreeze(value));

const AttachedBlindTechnicalReviewBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  createdAt: IsoTimestampSchema,
  blindSubjectId: BlindSubjectIdSchema,
  blindEvidenceId: BlindEvidenceIdSchema,
  review: BlindTechnicalReviewSchema,
});

const AttachedBlindTechnicalReviewDataSchema = AttachedBlindTechnicalReviewBodySchema.safeExtend({
  attachmentId: z.string().regex(/^blind_attachment_[a-f0-9]{64}$/),
}).superRefine((attachment, context) => {
  if (
    attachment.review.blindSubjectId !== attachment.blindSubjectId
    || attachment.review.blindEvidenceId !== attachment.blindEvidenceId
  ) {
    context.addIssue({
      code: "custom",
      message: "attached review does not match its blinded subject and evidence",
      path: ["review"],
    });
  }
  const { attachmentId, ...body } = attachment;
  const parsed = AttachedBlindTechnicalReviewBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("blind_attachment", parsed.data as unknown as JsonValue);
  if (attachmentId !== expected) {
    context.addIssue({
      code: "custom",
      message: `attachmentId does not match content; expected ${expected}`,
      path: ["attachmentId"],
    });
  }
});

export const AttachedBlindTechnicalReviewSchema =
  AttachedBlindTechnicalReviewDataSchema.transform((value) => deepFreeze(value));

export type BlindTechnicalEvidenceBody = z.infer<typeof BlindTechnicalEvidenceBodySchema>;
export type BlindTechnicalEvidence =
  DeepReadonly<z.infer<typeof BlindTechnicalEvidenceDataSchema>>;
export type BlindTechnicalReviewBody = z.infer<typeof BlindTechnicalReviewBodySchema>;
export type BlindTechnicalReview =
  DeepReadonly<z.infer<typeof BlindTechnicalReviewDataSchema>>;
export type AttachedBlindTechnicalReview =
  DeepReadonly<z.infer<typeof AttachedBlindTechnicalReviewDataSchema>>;

export function createBlindTechnicalEvidence(
  input: BlindTechnicalEvidenceBody,
): BlindTechnicalEvidence {
  const body = BlindTechnicalEvidenceBodySchema.parse(input);
  return BlindTechnicalEvidenceSchema.parse({
    ...body,
    blindEvidenceId: contentId("blind_evidence", body as unknown as JsonValue),
  });
}

export function parseBlindTechnicalEvidence(input: unknown): BlindTechnicalEvidence {
  return BlindTechnicalEvidenceSchema.parse(input);
}

export function createBlindTechnicalReview(
  input: BlindTechnicalReviewBody,
): BlindTechnicalReview {
  const body = BlindTechnicalReviewBodySchema.parse(input);
  return BlindTechnicalReviewSchema.parse({
    ...body,
    blindReviewId: contentId("blind_review", body as unknown as JsonValue),
  });
}

export function parseBlindTechnicalReview(input: unknown): BlindTechnicalReview {
  return BlindTechnicalReviewSchema.parse(input);
}

export function attachBlindTechnicalReview(input: {
  readonly runId: string;
  readonly createdAt: string;
  readonly review: BlindTechnicalReview;
}): AttachedBlindTechnicalReview {
  const body = AttachedBlindTechnicalReviewBodySchema.parse({
    schemaVersion: 1,
    runId: input.runId,
    createdAt: input.createdAt,
    blindSubjectId: input.review.blindSubjectId,
    blindEvidenceId: input.review.blindEvidenceId,
    review: input.review,
  });
  return AttachedBlindTechnicalReviewSchema.parse({
    ...body,
    attachmentId: contentId("blind_attachment", body as unknown as JsonValue),
  });
}

export function parseAttachedBlindTechnicalReview(
  input: unknown,
): AttachedBlindTechnicalReview {
  return AttachedBlindTechnicalReviewSchema.parse(input);
}
