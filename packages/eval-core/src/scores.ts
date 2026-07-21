import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  RunIdSchema,
  addUniqueIdIssues,
  deepFreeze,
  type DeepReadonly,
} from "./common.js";
import { ArtifactEvidenceSchema } from "./artifacts.js";
import { EvaluationStageSchema } from "./cases.js";
import {
  CaseReferenceSchema,
  EvaluatorMetadataSchema,
  ModelMetadataSchema,
} from "./versions.js";

export const ScoreSummarySchema = z.strictObject({
  earned: z.number().finite().nonnegative(),
  possible: z.number().finite().nonnegative(),
  normalized: z.number().min(0).max(1).nullable(),
});

export const DeterministicCheckResultSchema = z.strictObject({
  id: IdentifierSchema,
  description: z.string().trim().min(1).max(4_000),
  outcome: z.enum(["pass", "fail", "not-applicable"]),
  weight: z.number().finite().positive().max(1_000_000),
  message: z.string().trim().min(1).max(8_000).optional(),
  evidence: z.array(ArtifactEvidenceSchema).max(128),
});

export const RubricCriterionResultSchema = z
  .strictObject({
    id: IdentifierSchema,
    description: z.string().trim().min(1).max(4_000),
    points: z.number().finite().nonnegative(),
    maxPoints: z.number().finite().positive().max(1_000_000),
    confidence: z.number().min(0).max(1),
    justification: z.string().trim().min(1).max(16_000),
    evidence: z.array(ArtifactEvidenceSchema).max(128),
  })
  .superRefine((criterion, context) => {
    if (criterion.points > criterion.maxPoints) {
      context.addIssue({ code: "custom", message: "points cannot exceed maxPoints", path: ["points"] });
    }
  });

const ScorecardCommon = {
  schemaVersion: z.literal(1),
  id: IdentifierSchema,
  runId: RunIdSchema,
  case: CaseReferenceSchema,
  stage: EvaluationStageSchema,
  createdAt: IsoTimestampSchema,
  evaluator: EvaluatorMetadataSchema,
  summary: ScoreSummarySchema,
} as const;

const DeterministicScorecardSchema = z.strictObject({
  ...ScorecardCommon,
  kind: z.literal("deterministic"),
  checks: z.array(DeterministicCheckResultSchema).min(1).max(10_000),
});

const RubricScorecardSchema = z.strictObject({
  ...ScorecardCommon,
  kind: z.literal("rubric"),
  judgeModel: ModelMetadataSchema,
  criteria: z.array(RubricCriterionResultSchema).min(1).max(10_000),
  overallAssessment: z.string().trim().min(1).max(32_000),
});

const ScorecardDataSchema = z
  .discriminatedUnion("kind", [DeterministicScorecardSchema, RubricScorecardSchema])
  .superRefine((scorecard, context) => {
    if (scorecard.evaluator.kind !== scorecard.kind) {
      context.addIssue({
        code: "custom",
        message: `evaluator kind must be ${scorecard.kind}`,
        path: ["evaluator", "kind"],
      });
    }

    const items = scorecard.kind === "deterministic" ? scorecard.checks : scorecard.criteria;
    addUniqueIdIssues(items, context, [scorecard.kind === "deterministic" ? "checks" : "criteria"]);

    const expected = scorecard.kind === "deterministic"
      ? calculateDeterministicSummary(scorecard.checks)
      : calculateRubricSummary(scorecard.criteria);
    if (!summariesEqual(scorecard.summary, expected)) {
      context.addIssue({
        code: "custom",
        message: `summary does not match results; expected ${JSON.stringify(expected)}`,
        path: ["summary"],
      });
    }
  });

export const ScorecardSchema = ScorecardDataSchema.transform((value) => deepFreeze(value));
export const EvaluationScoreSchema = ScorecardSchema;

export type ScoreSummary = z.infer<typeof ScoreSummarySchema>;
export type DeterministicCheckResult = z.infer<typeof DeterministicCheckResultSchema>;
export type RubricCriterionResult = z.infer<typeof RubricCriterionResultSchema>;
export type Scorecard = DeepReadonly<z.infer<typeof ScorecardDataSchema>>;
export type EvaluationScore = Scorecard;
export type DeterministicScorecard = Extract<Scorecard, { readonly kind: "deterministic" }>;
export type RubricScorecard = Extract<Scorecard, { readonly kind: "rubric" }>;

export function calculateDeterministicSummary(
  checks: readonly DeterministicCheckResult[],
): ScoreSummary {
  let earned = 0;
  let possible = 0;
  for (const check of checks) {
    if (check.outcome === "not-applicable") continue;
    possible += check.weight;
    if (check.outcome === "pass") earned += check.weight;
  }
  return { earned, possible, normalized: possible === 0 ? null : earned / possible };
}

export function calculateRubricSummary(criteria: readonly RubricCriterionResult[]): ScoreSummary {
  const earned = criteria.reduce((total, criterion) => total + criterion.points, 0);
  const possible = criteria.reduce((total, criterion) => total + criterion.maxPoints, 0);
  return { earned, possible, normalized: earned / possible };
}

function summariesEqual(left: ScoreSummary, right: ScoreSummary): boolean {
  return numbersEqual(left.earned, right.earned) &&
    numbersEqual(left.possible, right.possible) &&
    (left.normalized === right.normalized ||
      (left.normalized !== null && right.normalized !== null && numbersEqual(left.normalized, right.normalized)));
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;
}
