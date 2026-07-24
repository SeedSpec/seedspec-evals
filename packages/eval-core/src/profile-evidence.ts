import { z } from "zod";

import {
  IdentifierSchema,
  ArtifactIdSchema,
  IsoTimestampSchema,
  JsonObjectSchema,
  JsonValueSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import {
  AdaptationChallengeDefinitionSchema,
  ComparisonAxesSchema,
  TechnicalExpectationSchema,
} from "./cases.js";
import { EvaluationProfileSubjectSchema } from "./profiles.js";
import { ContractGateSummarySchema } from "./scores.js";

export const ProfileEvidenceArtifactSchema = z.strictObject({
  artifactId: ArtifactIdSchema,
  path: SafeRelativePathSchema,
  kind: IdentifierSchema,
  mediaType: z.string().trim().min(1).max(256),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  digest: Sha256DigestSchema,
});

export const ProfileEvidenceEnvelopeBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  profileSchemaVersion: z.literal(1),
  createdAt: IsoTimestampSchema,
  subject: EvaluationProfileSubjectSchema,
  evaluatorRequest: z.strictObject({
    runner: z.enum(["codex", "claude-code", "cloudflare-think"]),
    model: z.string().trim().min(1).max(256),
    reasoningEffort: z.string().trim().min(1).max(64),
  }),
  comparisonAxes: ComparisonAxesSchema,
  technicalExpectations: z.array(TechnicalExpectationSchema).max(256),
  adaptationChallenges: z.array(AdaptationChallengeDefinitionSchema).max(128),
  evaluatorGuidance: z.array(z.strictObject({
    id: IdentifierSchema,
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
  })).max(32).default([]),
  source: z.strictObject({
    path: SafeRelativePathSchema,
    untrustedMaterial: z.string().min(1).max(384 * 1024),
    availableAuthorQuestionIds: z.array(IdentifierSchema).max(128),
  }),
  artifacts: z.array(ProfileEvidenceArtifactSchema).min(1).max(10_000),
  trace: z.strictObject({
    path: SafeRelativePathSchema,
    startedAt: IsoTimestampSchema,
    finishedAt: IsoTimestampSchema,
    status: z.string().trim().min(1).max(64),
    capture: JsonObjectSchema,
    relevantEvents: z.array(JsonValueSchema).max(256),
    limitations: z.array(z.string().trim().min(1).max(8_000)).max(256),
  }),
  subjectRun: z.strictObject({
    path: SafeRelativePathSchema,
    subjectRunId: z.string().regex(/^subject_run_[a-f0-9]{64}$/),
    startedAt: IsoTimestampSchema,
    finishedAt: IsoTimestampSchema,
    status: z.enum(["succeeded", "failed"]),
    usage: JsonObjectSchema,
    eventCount: z.number().int().nonnegative(),
    turnCount: z.number().int().nonnegative().optional(),
    threadId: z.string().trim().min(1).max(256).optional(),
    captureTracePath: SafeRelativePathSchema.optional(),
    captureTraceId: z.string().regex(/^trace_[a-f0-9]{64}$/).optional(),
    limitations: z.array(z.string().trim().min(1).max(8_000)).max(256),
  }).superRefine((subjectRun, context) => {
    if ((subjectRun.captureTracePath === undefined) !== (subjectRun.captureTraceId === undefined)) {
      context.addIssue({
        code: "custom",
        message: "captureTracePath and captureTraceId must be supplied together",
        path: ["captureTracePath"],
      });
    }
  }).optional(),
  contractGate: z.strictObject({
    path: SafeRelativePathSchema,
    summary: ContractGateSummarySchema,
    checks: z.array(JsonValueSchema).max(1_000),
    interpretation: z.literal(
      "This gate reports run integrity, required artifacts, and declared outcome checks. It is not an implementation-quality score.",
    ),
  }).optional(),
  // Accepted for compatibility with evidence envelopes produced before the
  // contract/integrity gate stopped exposing its legacy weighted total.
  deterministic: z.strictObject({
    path: SafeRelativePathSchema,
    summary: JsonObjectSchema,
    checks: z.array(JsonValueSchema).max(1_000),
  }).optional(),
  reportPath: SafeRelativePathSchema,
  decisionLedgerPath: SafeRelativePathSchema.optional(),
  instructions: z.array(z.string().trim().min(1).max(4_000)).min(1).max(64),
}).superRefine((envelope, context) => {
  if (envelope.contractGate === undefined && envelope.deterministic === undefined) {
    context.addIssue({
      code: "custom",
      message: "profile evidence requires contract-gate or legacy deterministic evidence",
      path: ["contractGate"],
    });
  }
});

const ProfileEvidenceEnvelopeDataSchema = ProfileEvidenceEnvelopeBodySchema.safeExtend({
  evidenceId: z.string().regex(/^evidence_[a-f0-9]{64}$/),
}).superRefine((envelope, context) => {
  const { evidenceId, ...body } = envelope;
  const parsed = ProfileEvidenceEnvelopeBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("evidence", parsed.data as unknown as JsonValue);
  if (evidenceId !== expected) context.addIssue({ code: "custom", message: `evidenceId does not match envelope content; expected ${expected}`, path: ["evidenceId"] });
});

export const ProfileEvidenceEnvelopeSchema = ProfileEvidenceEnvelopeDataSchema.transform((value) => deepFreeze(value));

export type ProfileEvidenceEnvelopeBody = z.infer<typeof ProfileEvidenceEnvelopeBodySchema>;
export type ProfileEvidenceEnvelopeBodyInput = z.input<typeof ProfileEvidenceEnvelopeBodySchema>;
export type ProfileEvidenceEnvelope = DeepReadonly<z.infer<typeof ProfileEvidenceEnvelopeDataSchema>>;

export function createProfileEvidenceEnvelope(input: ProfileEvidenceEnvelopeBodyInput): ProfileEvidenceEnvelope {
  const body = ProfileEvidenceEnvelopeBodySchema.parse(input);
  return ProfileEvidenceEnvelopeSchema.parse({
    ...body,
    evidenceId: contentId("evidence", body as unknown as JsonValue),
  });
}

export function parseProfileEvidenceEnvelope(input: unknown): ProfileEvidenceEnvelope {
  return ProfileEvidenceEnvelopeSchema.parse(input);
}
