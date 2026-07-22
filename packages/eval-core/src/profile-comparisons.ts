import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  RunIdSchema,
  SemVerSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import {
  ComparisonAxesSchema,
  EvaluationStageSchema,
  EvaluationVariantSchema,
} from "./cases.js";
import {
  DecisionActorSchema,
  EvaluationProfileSchema,
  ProcessMetricsSchema,
  type EvaluationProfile,
} from "./profiles.js";

const ComparisonProfileReferenceSchema = z.strictObject({
  profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
  runId: RunIdSchema,
  variant: EvaluationVariantSchema,
});

const DecisionObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("present"),
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
    decisionId: IdentifierSchema,
    expectedLatitude: z.enum(["fixed", "preferred", "delegated", "open", "unresolved"]),
    alignment: z.enum(["aligned", "authorized-variation", "deviation", "ambient", "not-observed", "unknown"]),
    disclosure: z.enum(["explicit", "implicit", "silent", "not-applicable", "unknown"]),
    observedChoice: z.string().trim().min(1).max(4_000).optional(),
    selectedBy: z.array(DecisionActorSchema).max(32),
    confidence: z.number().min(0).max(1),
  }),
  z.strictObject({
    status: z.literal("missing"),
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
  }),
]);

const ObligationObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("present"),
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
    obligationId: IdentifierSchema,
    coverage: z.enum(["covered", "partial", "uncovered", "not-applicable", "unknown"]),
    distinguishing: z.enum(["yes", "no", "unknown"]),
    confidence: z.number().min(0).max(1),
  }),
  z.strictObject({
    status: z.literal("missing"),
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
  }),
]);

const ProfileComparisonBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: IsoTimestampSchema,
  case: z.strictObject({ id: IdentifierSchema, version: SemVerSchema, digest: Sha256DigestSchema }),
  stage: EvaluationStageSchema,
  profiles: z.array(ComparisonProfileReferenceSchema).min(2).max(1_000),
  decisionAxes: z.array(z.strictObject({
    caseAxisId: IdentifierSchema,
    title: z.string().trim().min(1).max(512),
    description: z.string().trim().min(1).max(4_000),
    materiality: z.enum(["critical", "material", "minor"]),
    observations: z.array(DecisionObservationSchema).min(2).max(1_000),
  })).max(256),
  obligationAxes: z.array(z.strictObject({
    caseAxisId: IdentifierSchema,
    kind: z.enum(["outcome", "behavior", "invariant", "constraint", "forbidden-state", "boundary", "success-criterion"]),
    description: z.string().trim().min(1).max(4_000),
    importance: z.enum(["critical", "material", "minor"]),
    observations: z.array(ObligationObservationSchema).min(2).max(1_000),
  })).max(512),
  unmatched: z.array(z.strictObject({
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
    decisionIds: z.array(IdentifierSchema).max(10_000),
    obligationIds: z.array(IdentifierSchema).max(10_000),
  })).min(2).max(1_000),
  process: z.array(z.strictObject({
    profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
    runId: RunIdSchema,
    variant: EvaluationVariantSchema,
    metrics: ProcessMetricsSchema.optional(),
  })).min(2).max(1_000),
  notes: z.array(z.string().trim().min(1).max(4_000)).min(1).max(32),
});

const ProfileComparisonDataSchema = ProfileComparisonBodySchema.safeExtend({
  comparisonId: z.string().regex(/^profile_comparison_[a-f0-9]{64}$/),
}).superRefine((comparison, context) => {
  const { comparisonId, ...body } = comparison;
  const parsed = ProfileComparisonBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("profile_comparison", parsed.data as unknown as JsonValue);
  if (comparisonId !== expected) {
    context.addIssue({ code: "custom", message: `comparisonId does not match comparison content; expected ${expected}`, path: ["comparisonId"] });
  }
});

export const ProfileComparisonSchema = ProfileComparisonDataSchema.transform((value) => deepFreeze(value));
export type ProfileComparison = DeepReadonly<z.infer<typeof ProfileComparisonDataSchema>>;

export function createProfileComparison(input: {
  profiles: readonly EvaluationProfile[];
  comparisonAxes: unknown;
  createdAt: string;
}): ProfileComparison {
  if (input.profiles.length < 2) throw new Error("At least two evaluation profiles are required.");
  const profiles = input.profiles.map((profile) => EvaluationProfileSchema.parse(profile));
  const first = profiles[0]!;
  if (first.subject.runId === undefined || first.subject.variant === undefined || first.subject.case === undefined) {
    throw new Error("Profile comparisons require run subjects with variant and case identity.");
  }
  for (const profile of profiles) {
    if (profile.subject.runId === undefined || profile.subject.variant === undefined || profile.subject.case === undefined) {
      throw new Error("Profile comparisons require run subjects with variant and case identity.");
    }
    if (profile.subject.stage !== first.subject.stage
      || profile.subject.case.id !== first.subject.case.id
      || profile.subject.case.version !== first.subject.case.version
      || profile.subject.case.digest !== first.subject.case.digest) {
      throw new Error("Profiles must share the exact evaluation case and stage.");
    }
  }
  const axes = ComparisonAxesSchema.parse(input.comparisonAxes);
  const applicableDecisions = axes.decisions.filter(({ stages }) => stages.includes(first.subject.stage));
  const applicableObligations = axes.obligations.filter(({ stages }) => stages.includes(first.subject.stage));
  const references = profiles.map(profileReference);
  const body = ProfileComparisonBodySchema.parse({
    schemaVersion: 1,
    createdAt: input.createdAt,
    case: first.subject.case,
    stage: first.subject.stage,
    profiles: references,
    decisionAxes: applicableDecisions.map((axis) => ({
      caseAxisId: axis.id,
      title: axis.title,
      description: axis.description,
      materiality: axis.materiality,
      observations: profiles.map((profile) => {
        const reference = profileReference(profile);
        const decision = profile.decisions.find(({ caseAxisId }) => caseAxisId === axis.id);
        return decision === undefined
          ? { status: "missing", ...reference }
          : {
              status: "present",
              ...reference,
              decisionId: decision.id,
              expectedLatitude: decision.expectedLatitude,
              alignment: decision.alignment,
              disclosure: decision.disclosure,
              ...(decision.observedChoice === undefined ? {} : { observedChoice: decision.observedChoice }),
              selectedBy: [...new Set(decision.provenance.selectedBy.map(({ actor }) => actor))],
              confidence: decision.confidence,
            };
      }),
    })),
    obligationAxes: applicableObligations.map((axis) => ({
      caseAxisId: axis.id,
      kind: axis.kind,
      description: axis.description,
      importance: axis.importance,
      observations: profiles.map((profile) => {
        const reference = profileReference(profile);
        const obligation = profile.obligations.find(({ caseAxisId }) => caseAxisId === axis.id);
        return obligation === undefined
          ? { status: "missing", ...reference }
          : {
              status: "present",
              ...reference,
              obligationId: obligation.id,
              coverage: obligation.coverage,
              distinguishing: obligation.distinguishing,
              confidence: obligation.confidence,
            };
      }),
    })),
    unmatched: profiles.map((profile) => ({
      ...profileReference(profile),
      decisionIds: profile.decisions.filter(({ caseAxisId }) => caseAxisId === undefined).map(({ id }) => id),
      obligationIds: profile.obligations.filter(({ caseAxisId }) => caseAxisId === undefined).map(({ id }) => id),
    })),
    process: profiles.map((profile) => ({
      ...profileReference(profile),
      ...(profile.process === undefined ? {} : { metrics: profile.process }),
    })),
    notes: [
      "This comparison is descriptive and uses predeclared case axes as a shared denominator.",
      "Missing, unknown, delegated, and open observations are preserved; no aggregate score or winning variant is inferred.",
      "Subject-specific records without a case axis are listed separately and are not treated as directly comparable.",
    ],
  });
  return ProfileComparisonSchema.parse({
    ...body,
    comparisonId: contentId("profile_comparison", body as unknown as JsonValue),
  });
}

function profileReference(profile: EvaluationProfile): {
  profileId: string;
  runId: string;
  variant: NonNullable<EvaluationProfile["subject"]["variant"]>;
} {
  if (profile.subject.runId === undefined || profile.subject.variant === undefined) throw new Error("Run identity is required.");
  return { profileId: profile.profileId, runId: profile.subject.runId, variant: profile.subject.variant };
}
