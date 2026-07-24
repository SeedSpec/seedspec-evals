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
import { EvaluationStageSchema, EvaluationVariantSchema, variantBelongsToStage } from "./cases.js";
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
  category: z.enum(["run-integrity", "artifact-contract", "outcome-contract"]).optional(),
  description: z.string().trim().min(1).max(4_000),
  outcome: z.enum(["pass", "fail", "not-applicable"]),
  // Retained for schema-v1 scorecard compatibility. Contract gates are interpreted
  // from check outcomes and categories, never as an implementation-quality score.
  weight: z.number().finite().positive().max(1_000_000),
  message: z.string().trim().min(1).max(8_000).optional(),
  evidence: z.array(ArtifactEvidenceSchema).max(128),
}).transform((check) => ({
  ...check,
  category: check.category ?? inferContractCheckCategory(check.id),
}));

export const ContractGateCategorySummarySchema = z.strictObject({
  category: z.enum(["run-integrity", "artifact-contract", "outcome-contract"]),
  status: z.enum(["pass", "fail", "incomplete"]),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unevaluated: z.number().int().nonnegative(),
});

export const ContractGateSummarySchema = z.strictObject({
  status: z.enum(["pass", "fail", "incomplete"]),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unevaluated: z.number().int().nonnegative(),
  categories: z.array(ContractGateCategorySummarySchema).length(3),
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
  variant: EvaluationVariantSchema,
  createdAt: IsoTimestampSchema,
  evaluator: EvaluatorMetadataSchema,
  summary: ScoreSummarySchema,
} as const;

const DeterministicScorecardSchema = z.strictObject({
  ...ScorecardCommon,
  kind: z.literal("deterministic"),
  assessmentScope: z.literal("run-contract-and-integrity").default("run-contract-and-integrity"),
  interpretation: z.literal(
    "This gate reports run integrity, required artifacts, and declared outcome checks. It is not an implementation-quality score.",
  ).default(
    "This gate reports run integrity, required artifacts, and declared outcome checks. It is not an implementation-quality score.",
  ),
  gate: ContractGateSummarySchema.optional(),
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
    if (!variantBelongsToStage(scorecard.variant, scorecard.stage)) {
      context.addIssue({ code: "custom", message: "variant does not belong to stage", path: ["variant"] });
    }
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
    if (scorecard.kind === "deterministic" && scorecard.gate !== undefined) {
      const expectedGate = calculateContractGateSummary(scorecard.checks);
      if (JSON.stringify(scorecard.gate) !== JSON.stringify(expectedGate)) {
        context.addIssue({
          code: "custom",
          message: `gate does not match check outcomes; expected ${JSON.stringify(expectedGate)}`,
          path: ["gate"],
        });
      }
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
export type ContractGateSummary = z.infer<typeof ContractGateSummarySchema>;

const CONTRACT_GATE_CATEGORIES = [
  "run-integrity",
  "artifact-contract",
  "outcome-contract",
] as const;

export function inferContractCheckCategory(
  checkId: string,
): "run-integrity" | "artifact-contract" | "outcome-contract" {
  if (["case-manifest-consistency", "hidden-expectations-isolated"].includes(checkId)) {
    return "run-integrity";
  }
  if (checkId === "authoring-state-excluded" || checkId.startsWith("deliverable-")) {
    return "artifact-contract";
  }
  return "outcome-contract";
}

export function calculateContractGateSummary(
  checks: readonly Readonly<Pick<DeterministicCheckResult, "category" | "outcome">>[],
): ContractGateSummary {
  const categories = CONTRACT_GATE_CATEGORIES.map((category) => {
    const members = checks.filter((check) => check.category === category);
    const passed = members.filter(({ outcome }) => outcome === "pass").length;
    const failed = members.filter(({ outcome }) => outcome === "fail").length;
    const unevaluated = members.filter(({ outcome }) => outcome === "not-applicable").length;
    return {
      category,
      status: gateStatus(failed, unevaluated),
      passed,
      failed,
      unevaluated,
    };
  });
  const passed = checks.filter(({ outcome }) => outcome === "pass").length;
  const failed = checks.filter(({ outcome }) => outcome === "fail").length;
  const unevaluated = checks.filter(({ outcome }) => outcome === "not-applicable").length;
  return {
    status: gateStatus(failed, unevaluated),
    passed,
    failed,
    unevaluated,
    categories,
  };
}

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

function gateStatus(failed: number, unevaluated: number): "pass" | "fail" | "incomplete" {
  if (failed > 0) return "fail";
  if (unevaluated > 0) return "incomplete";
  return "pass";
}
