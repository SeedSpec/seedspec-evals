import { z } from "zod";

import {
  ArtifactIdSchema,
  IdentifierSchema,
  IsoTimestampSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  SemVerSchema,
  Sha256DigestSchema,
  TechnicalDimensionSchema,
  addUniqueIdIssues,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluationStageSchema, EvaluationVariantSchema, variantBelongsToStage } from "./cases.js";
import { ModelMetadataSchema } from "./versions.js";

export const EvaluationEvidenceLocatorSchema = z.strictObject({
  artifactId: ArtifactIdSchema.optional(),
  path: SafeRelativePathSchema.optional(),
  digest: Sha256DigestSchema.optional(),
  jsonPointer: z.string().regex(/^(?:\/(?:[^~/]|~0|~1)*)*$/).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  traceSequence: z.number().int().nonnegative().optional(),
  note: z.string().trim().min(1).max(4_000),
}).superRefine((evidence, context) => {
  if (evidence.artifactId === undefined && evidence.path === undefined && evidence.traceSequence === undefined) {
    context.addIssue({ code: "custom", message: "evidence must identify an artifact, path, or trace event" });
  }
  if (evidence.lineEnd !== undefined && evidence.lineStart === undefined) {
    context.addIssue({ code: "custom", message: "lineEnd requires lineStart", path: ["lineEnd"] });
  }
  if (evidence.lineStart !== undefined && evidence.lineEnd !== undefined && evidence.lineEnd < evidence.lineStart) {
    context.addIssue({ code: "custom", message: "lineEnd cannot precede lineStart", path: ["lineEnd"] });
  }
});

export const DecisionActorSchema = z.enum([
  "package-author",
  "end-user",
  "authoring-agent",
  "implementation-profile",
  "reference-artifact",
  "existing-system",
  "environment",
  "implementing-agent",
  "evaluation-case",
  "evaluator",
  "mixed",
  "unknown",
]);

export const DecisionAttributionSchema = z.strictObject({
  actor: DecisionActorSchema,
  label: z.string().trim().min(1).max(256).optional(),
  basis: z.string().trim().min(1).max(4_000),
  evidence: z.array(EvaluationEvidenceLocatorSchema).min(1).max(32),
});

export const DecisionMaterialitySchema = z.strictObject({
  level: z.enum(["critical", "material", "minor"]),
  basis: z.enum(["protocol-default", "author-declared", "evaluator-assessed", "mixed"]),
  rationale: z.string().trim().min(1).max(4_000),
});

export const DecisionRecordSchema = z.strictObject({
  id: IdentifierSchema,
  caseAxisId: IdentifierSchema.optional(),
  domain: IdentifierSchema,
  title: z.string().trim().min(1).max(512),
  description: z.string().trim().min(1).max(8_000),
  materiality: DecisionMaterialitySchema,
  expectedLatitude: z.enum(["fixed", "preferred", "delegated", "open", "unresolved"]),
  alternatives: z.array(z.string().trim().min(1).max(2_000)).max(32),
  observedChoice: z.string().trim().min(1).max(4_000).optional(),
  provenance: z.strictObject({
    proposedBy: z.array(DecisionAttributionSchema).max(16),
    selectedBy: z.array(DecisionAttributionSchema).max(16),
    constrainedBy: z.array(DecisionAttributionSchema).max(32),
    implementedBy: z.array(DecisionAttributionSchema).max(16),
  }),
  disclosure: z.enum(["explicit", "implicit", "silent", "not-applicable", "unknown"]),
  alignment: z.enum([
    "aligned",
    "authorized-variation",
    "deviation",
    "ambient",
    "not-observed",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  assessment: z.string().trim().min(1).max(8_000),
  evidence: z.array(EvaluationEvidenceLocatorSchema).min(1).max(128),
}).superRefine((decision, context) => {
  if (["aligned", "authorized-variation", "deviation", "ambient"].includes(decision.alignment)
    && decision.observedChoice === undefined) {
    context.addIssue({ code: "custom", message: "observed alignment requires observedChoice", path: ["observedChoice"] });
  }
  if (decision.alignment === "ambient") {
    if (!decision.provenance.selectedBy.some(({ actor }) =>
      actor === "authoring-agent" || actor === "implementing-agent")) {
      context.addIssue({
        code: "custom",
        message: "ambient decisions must identify the authoring or implementing agent as a selecting party",
        path: ["provenance", "selectedBy"],
      });
    }
    if (["delegated", "open"].includes(decision.expectedLatitude)) {
      context.addIssue({
        code: "custom",
        message: "a deliberately delegated or open decision is not ambient",
        path: ["expectedLatitude"],
      });
    }
  }
});

export const ObligationEvidenceRecordSchema = z.strictObject({
  id: IdentifierSchema,
  caseAxisId: IdentifierSchema.optional(),
  kind: z.enum([
    "outcome",
    "behavior",
    "invariant",
    "constraint",
    "forbidden-state",
    "boundary",
    "success-criterion",
  ]),
  description: z.string().trim().min(1).max(8_000),
  importance: z.enum(["critical", "material", "minor"]),
  source: z.array(EvaluationEvidenceLocatorSchema).min(1).max(32),
  plannedEvidence: z.array(EvaluationEvidenceLocatorSchema).max(64),
  observedEvidence: z.array(EvaluationEvidenceLocatorSchema).max(64),
  coverage: z.enum(["covered", "partial", "uncovered", "not-applicable", "unknown"]),
  distinguishing: z.enum(["yes", "no", "unknown"]),
  assessment: z.string().trim().min(1).max(8_000),
  confidence: z.number().min(0).max(1),
});

export const StructureFindingSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.enum([
    "duplicated-authority",
    "misplaced-concern",
    "conflicting-authority",
    "monolithic-overload",
    "unnecessary-fragmentation",
    "missing-route",
    "clear-ownership",
  ]),
  severity: z.enum(["information", "review", "material"]),
  description: z.string().trim().min(1).max(8_000),
  canonicalOwner: SafeRelativePathSchema.optional(),
  recommendation: z.string().trim().min(1).max(8_000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvaluationEvidenceLocatorSchema).min(1).max(128),
});

const OptionalCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional();

export const ProcessMetricsSchema = z.strictObject({
  capture: z.strictObject({
    turns: z.enum(["reported", "reconstructed", "unavailable"]),
    tokens: z.enum(["provider-reported", "estimated", "unavailable"]),
    cache: z.enum(["provider-reported", "estimated", "unavailable"]),
    duration: z.enum(["reported", "reconstructed", "unavailable"]),
  }),
  turns: z.strictObject({
    total: OptionalCountSchema,
    user: OptionalCountSchema,
    agent: OptionalCountSchema,
    clarification: OptionalCountSchema,
    correction: OptionalCountSchema,
  }),
  tokens: z.strictObject({
    input: OptionalCountSchema,
    cachedInputRead: OptionalCountSchema,
    cachedInputWrite: OptionalCountSchema,
    output: OptionalCountSchema,
    total: OptionalCountSchema,
  }),
  toolCalls: OptionalCountSchema,
  durationMs: OptionalCountSchema,
  notes: z.array(z.string().trim().min(1).max(4_000)).max(64),
}).superRefine((metrics, context) => {
  const knownTurnParts = [metrics.turns.user, metrics.turns.agent].filter((value): value is number => value !== undefined);
  if (metrics.turns.total !== undefined && knownTurnParts.length === 2
    && metrics.turns.total !== knownTurnParts.reduce((sum, value) => sum + value, 0)) {
    context.addIssue({ code: "custom", message: "turn total must equal user plus agent turns", path: ["turns", "total"] });
  }
  const knownTokenParts = [metrics.tokens.input, metrics.tokens.output].filter((value): value is number => value !== undefined);
  if (metrics.tokens.total !== undefined && knownTokenParts.length === 2
    && metrics.tokens.total !== knownTokenParts.reduce((sum, value) => sum + value, 0)) {
    context.addIssue({ code: "custom", message: "token total must equal input plus output tokens", path: ["tokens", "total"] });
  }
});

export const TechnicalCheckSchema = z.strictObject({
  id: IdentifierSchema,
  dimension: TechnicalDimensionSchema,
  method: z.enum(["deterministic", "structured-review", "adaptation-challenge"]),
  outcome: z.enum(["pass", "fail", "concern", "not-applicable", "unknown"]),
  description: z.string().trim().min(1).max(8_000),
  assessment: z.string().trim().min(1).max(8_000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvaluationEvidenceLocatorSchema).max(128),
});

export const AdaptationChallengeSchema = z.strictObject({
  id: IdentifierSchema,
  description: z.string().trim().min(1).max(8_000),
  authorization: z.enum(["declared-by-case", "author-supplied", "operator-approved"]),
  outcome: z.enum(["pass", "fail", "concern", "not-run"]),
  filesChanged: OptionalCountSchema,
  regressionCount: OptionalCountSchema,
  turns: OptionalCountSchema,
  tokens: OptionalCountSchema,
  assessment: z.string().trim().min(1).max(8_000),
  evidence: z.array(EvaluationEvidenceLocatorSchema).max(128),
});

export const TechnicalEvaluationSchema = z.strictObject({
  checks: z.array(TechnicalCheckSchema).max(10_000),
  adaptationChallenges: z.array(AdaptationChallengeSchema).max(1_000),
  summary: z.string().trim().min(1).max(16_000),
});

export const EvaluationProfileSubjectSchema = z.strictObject({
  stage: EvaluationStageSchema,
  runId: RunIdSchema.optional(),
  variant: EvaluationVariantSchema.optional(),
  treatment: IdentifierSchema.optional(),
  case: z.strictObject({
    id: IdentifierSchema,
    version: SemVerSchema,
    digest: Sha256DigestSchema,
  }).optional(),
  kind: IdentifierSchema.optional(),
  package: z.strictObject({
    id: IdentifierSchema.optional(),
    version: SemVerSchema.optional(),
    digest: Sha256DigestSchema,
    path: z.string().trim().min(1).max(4_096).optional(),
  }).optional(),
}).superRefine((subject, context) => {
  if (subject.runId === undefined && subject.package === undefined) {
    context.addIssue({ code: "custom", message: "subject must identify a run or package" });
  }
  if (subject.variant !== undefined && !variantBelongsToStage(subject.variant, subject.stage)) {
    context.addIssue({ code: "custom", message: "variant does not belong to subject stage", path: ["variant"] });
  }
  if (subject.runId !== undefined && subject.case === undefined) {
    context.addIssue({ code: "custom", message: "run subjects must identify their evaluation case", path: ["case"] });
  }
});

export const ProfileEvaluatorSchema = z.strictObject({
  id: IdentifierSchema,
  version: SemVerSchema,
  kind: z.enum(["agent", "deterministic", "hybrid"]),
  model: ModelMetadataSchema.optional(),
});

export const EvaluationProfileBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  subject: EvaluationProfileSubjectSchema,
  createdAt: IsoTimestampSchema,
  evaluator: ProfileEvaluatorSchema,
  decisions: z.array(DecisionRecordSchema).max(10_000),
  obligations: z.array(ObligationEvidenceRecordSchema).max(10_000),
  structure: z.array(StructureFindingSchema).max(10_000),
  process: ProcessMetricsSchema.optional(),
  technical: TechnicalEvaluationSchema.optional(),
  summary: z.string().trim().min(1).max(32_000),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(256),
}).superRefine((profile, context) => {
  addUniqueIdIssues(profile.decisions, context, ["decisions"]);
  addUniqueIdIssues(profile.obligations, context, ["obligations"]);
  addUniqueOptionalIdIssues(profile.decisions, "caseAxisId", context, ["decisions"]);
  addUniqueOptionalIdIssues(profile.obligations, "caseAxisId", context, ["obligations"]);
  addUniqueIdIssues(profile.structure, context, ["structure"]);
  if (profile.technical !== undefined) {
    addUniqueIdIssues(profile.technical.checks, context, ["technical", "checks"]);
    addUniqueIdIssues(profile.technical.adaptationChallenges, context, ["technical", "adaptationChallenges"]);
  }
});

function addUniqueOptionalIdIssues(
  values: readonly Record<string, unknown>[],
  key: string,
  context: z.core.$RefinementCtx,
  path: PropertyKey[],
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    const id = value[key];
    if (typeof id !== "string") continue;
    if (seen.has(id)) context.addIssue({ code: "custom", message: `${key} must be unique when present`, path: [...path, index, key] });
    seen.add(id);
  }
}

const EvaluationProfileDataSchema = EvaluationProfileBodySchema.safeExtend({
  profileId: z.string().regex(/^profile_[a-f0-9]{64}$/),
}).superRefine((profile, context) => {
  const { profileId, ...body } = profile;
  const parsedBody = EvaluationProfileBodySchema.safeParse(body);
  if (!parsedBody.success) return;
  const expected = contentId("profile", parsedBody.data as unknown as JsonValue);
  if (profileId !== expected) {
    context.addIssue({ code: "custom", message: `profileId does not match profile content; expected ${expected}`, path: ["profileId"] });
  }
});

export const EvaluationProfileSchema = EvaluationProfileDataSchema.transform((value) => deepFreeze(value));

export const DecisionLedgerEntrySchema = z.strictObject({
  id: IdentifierSchema,
  domain: IdentifierSchema,
  title: z.string().trim().min(1).max(512),
  choice: z.string().trim().min(1).max(4_000),
  materiality: DecisionMaterialitySchema,
  expectedLatitude: z.enum(["fixed", "preferred", "delegated", "open", "unresolved", "unknown"]),
  sources: z.array(DecisionAttributionSchema).max(32),
  alternativesConsidered: z.array(z.string().trim().min(1).max(2_000)).max(32),
  disclosure: z.enum(["explicit", "implicit", "unknown"]),
  rationale: z.string().trim().min(1).max(8_000),
  evidence: z.array(EvaluationEvidenceLocatorSchema).min(1).max(128),
});

export const DecisionLedgerBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  createdAt: IsoTimestampSchema,
  entries: z.array(DecisionLedgerEntrySchema).max(10_000),
  limitations: z.array(z.string().trim().min(1).max(8_000)).max(256),
}).superRefine((ledger, context) => {
  addUniqueIdIssues(ledger.entries, context, ["entries"]);
});

const DecisionLedgerDataSchema = DecisionLedgerBodySchema.safeExtend({
  ledgerId: z.string().regex(/^ledger_[a-f0-9]{64}$/),
}).superRefine((ledger, context) => {
  const { ledgerId, ...body } = ledger;
  const parsedBody = DecisionLedgerBodySchema.safeParse(body);
  if (!parsedBody.success) return;
  const expected = contentId("ledger", parsedBody.data as unknown as JsonValue);
  if (ledgerId !== expected) {
    context.addIssue({ code: "custom", message: `ledgerId does not match ledger content; expected ${expected}`, path: ["ledgerId"] });
  }
});

export const DecisionLedgerSchema = DecisionLedgerDataSchema.transform((value) => deepFreeze(value));

export type EvaluationEvidenceLocator = z.infer<typeof EvaluationEvidenceLocatorSchema>;
export type DecisionActor = z.infer<typeof DecisionActorSchema>;
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
export type ObligationEvidenceRecord = z.infer<typeof ObligationEvidenceRecordSchema>;
export type StructureFinding = z.infer<typeof StructureFindingSchema>;
export type ProcessMetrics = z.infer<typeof ProcessMetricsSchema>;
export type TechnicalCheck = z.infer<typeof TechnicalCheckSchema>;
export type AdaptationChallenge = z.infer<typeof AdaptationChallengeSchema>;
export type TechnicalEvaluation = z.infer<typeof TechnicalEvaluationSchema>;
export type EvaluationProfileBody = z.infer<typeof EvaluationProfileBodySchema>;
export type EvaluationProfile = DeepReadonly<z.infer<typeof EvaluationProfileDataSchema>>;
export type DecisionLedgerEntry = z.infer<typeof DecisionLedgerEntrySchema>;
export type DecisionLedgerBody = z.infer<typeof DecisionLedgerBodySchema>;
export type DecisionLedger = DeepReadonly<z.infer<typeof DecisionLedgerDataSchema>>;

export interface EvaluationProfileSummary {
  readonly decisions: {
    readonly total: number;
    readonly critical: number;
    readonly material: number;
    readonly minor: number;
    readonly ambientMaterial: number;
    readonly delegatedOrOpen: number;
    readonly unresolved: number;
    readonly lowConfidence: number;
  };
  readonly obligations: {
    readonly total: number;
    readonly covered: number;
    readonly partial: number;
    readonly uncovered: number;
    readonly unknown: number;
    readonly distinguishingNoOrUnknown: number;
  };
  readonly structure: {
    readonly total: number;
    readonly material: number;
  };
  readonly technical?: {
    readonly checks: number;
    readonly pass: number;
    readonly fail: number;
    readonly concern: number;
    readonly unknown: number;
    readonly adaptationChallenges: number;
  };
}

export function computeEvaluationProfileId(input: EvaluationProfileBody): `profile_${string}` {
  const body = EvaluationProfileBodySchema.parse(input);
  return contentId("profile", body as unknown as JsonValue);
}

export function createEvaluationProfile(input: EvaluationProfileBody): EvaluationProfile {
  const body = EvaluationProfileBodySchema.parse(input);
  return EvaluationProfileSchema.parse({ ...body, profileId: computeEvaluationProfileId(body) });
}

export function parseEvaluationProfile(input: unknown): EvaluationProfile {
  return EvaluationProfileSchema.parse(input);
}

export function computeDecisionLedgerId(input: DecisionLedgerBody): `ledger_${string}` {
  const body = DecisionLedgerBodySchema.parse(input);
  return contentId("ledger", body as unknown as JsonValue);
}

export function createDecisionLedger(input: DecisionLedgerBody): DecisionLedger {
  const body = DecisionLedgerBodySchema.parse(input);
  return DecisionLedgerSchema.parse({ ...body, ledgerId: computeDecisionLedgerId(body) });
}

export function parseDecisionLedger(input: unknown): DecisionLedger {
  return DecisionLedgerSchema.parse(input);
}

export function summarizeEvaluationProfile(profile: EvaluationProfile): EvaluationProfileSummary {
  const decisionCount = (predicate: (decision: EvaluationProfile["decisions"][number]) => boolean): number =>
    profile.decisions.filter(predicate).length;
  const obligationCount = (coverage: ObligationEvidenceRecord["coverage"]): number =>
    profile.obligations.filter((obligation) => obligation.coverage === coverage).length;
  const technical = profile.technical === undefined ? undefined : {
    checks: profile.technical.checks.length,
    pass: profile.technical.checks.filter(({ outcome }) => outcome === "pass").length,
    fail: profile.technical.checks.filter(({ outcome }) => outcome === "fail").length,
    concern: profile.technical.checks.filter(({ outcome }) => outcome === "concern").length,
    unknown: profile.technical.checks.filter(({ outcome }) => outcome === "unknown").length,
    adaptationChallenges: profile.technical.adaptationChallenges.length,
  };
  return {
    decisions: {
      total: profile.decisions.length,
      critical: decisionCount(({ materiality }) => materiality.level === "critical"),
      material: decisionCount(({ materiality }) => materiality.level === "material"),
      minor: decisionCount(({ materiality }) => materiality.level === "minor"),
      ambientMaterial: decisionCount((decision) =>
        decision.alignment === "ambient" && decision.materiality.level !== "minor"),
      delegatedOrOpen: decisionCount(({ expectedLatitude }) => ["delegated", "open"].includes(expectedLatitude)),
      unresolved: decisionCount(({ expectedLatitude }) => expectedLatitude === "unresolved"),
      lowConfidence: decisionCount(({ confidence }) => confidence < 0.67),
    },
    obligations: {
      total: profile.obligations.length,
      covered: obligationCount("covered"),
      partial: obligationCount("partial"),
      uncovered: obligationCount("uncovered"),
      unknown: obligationCount("unknown"),
      distinguishingNoOrUnknown: profile.obligations.filter(({ distinguishing }) => distinguishing !== "yes").length,
    },
    structure: {
      total: profile.structure.length,
      material: profile.structure.filter(({ severity }) => severity === "material").length,
    },
    ...(technical === undefined ? {} : { technical }),
  };
}
