import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  JsonValueSchema,
  RunIdSchema,
  addUniqueIdIssues,
  deepFreeze,
  type DeepReadonly,
} from "./common.js";
import { AdversarialFindingSchema } from "./adversarial.js";
import { ArtifactEvidenceSchema } from "./artifacts.js";
import { EvaluationStageSchema } from "./cases.js";
import { CaseReferenceSchema } from "./versions.js";

export const CongruencyDimensionOutcomeSchema = z.enum([
  "match",
  "permitted-variation",
  "violation",
  "insufficient-evidence",
]);

export const CongruencyStatusSchema = z.enum([
  "congruent",
  "congruent-with-permitted-variation",
  "incongruent",
  "indeterminate",
]);

export const CongruencyObservationSchema = z.strictObject({
  runId: RunIdSchema,
  summary: z.string().trim().min(1).max(8_000),
  value: JsonValueSchema.optional(),
  evidence: z.array(ArtifactEvidenceSchema).max(128),
});

export const CongruencyDimensionSchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  expectationId: IdentifierSchema.optional(),
  requirement: z.enum(["required", "permitted-variable"]),
  description: z.string().trim().min(1).max(4_000),
  outcome: CongruencyDimensionOutcomeSchema,
  observations: z.array(CongruencyObservationSchema).min(2).max(1_000),
});

const CongruencyReportDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: IdentifierSchema,
    case: CaseReferenceSchema,
    runIds: z.array(RunIdSchema).min(2).max(1_000),
    createdAt: IsoTimestampSchema,
    dimensions: z.array(CongruencyDimensionSchema).min(1).max(10_000),
    status: CongruencyStatusSchema,
    summary: z.string().trim().min(1).max(16_000),
  })
  .superRefine((report, context) => {
    addCongruencyIssues(report, context);
  });

export const CongruencyReportSchema = CongruencyReportDataSchema.transform((value) => deepFreeze(value));

export const ComparisonMetricSchema = z
  .strictObject({
    id: IdentifierSchema,
    label: z.string().trim().min(1).max(512),
    unit: z.string().trim().min(1).max(128),
    preferredDirection: z.enum(["higher", "lower", "neutral"]),
    values: z.array(
      z.strictObject({
        runId: RunIdSchema,
        value: z.number().finite().nullable(),
      }),
    ).min(2).max(1_000),
  });

const RunComparisonReportDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: IdentifierSchema,
    case: CaseReferenceSchema,
    runIds: z.array(RunIdSchema).min(2).max(1_000),
    baselineRunId: RunIdSchema.optional(),
    createdAt: IsoTimestampSchema,
    metrics: z.array(ComparisonMetricSchema).max(10_000),
    congruency: CongruencyReportSchema,
    adversarialFindings: z.array(AdversarialFindingSchema).max(10_000),
  })
  .superRefine((comparison, context) => {
    const runIds = new Set(comparison.runIds);
    if (runIds.size !== comparison.runIds.length) {
      context.addIssue({ code: "custom", message: "runIds must be unique", path: ["runIds"] });
    }
    if (comparison.baselineRunId !== undefined && !runIds.has(comparison.baselineRunId)) {
      context.addIssue({
        code: "custom",
        message: "baselineRunId must identify a compared run",
        path: ["baselineRunId"],
      });
    }
    if (comparison.case.id !== comparison.congruency.case.id ||
      comparison.case.version !== comparison.congruency.case.version ||
      comparison.case.digest !== comparison.congruency.case.digest) {
      context.addIssue({ code: "custom", message: "congruency report is for a different case", path: ["congruency"] });
    }
    if (!sameStringSet(comparison.runIds, comparison.congruency.runIds)) {
      context.addIssue({
        code: "custom",
        message: "congruency runIds must match comparison runIds",
        path: ["congruency", "runIds"],
      });
    }

    addUniqueIdIssues(comparison.metrics, context, ["metrics"]);
    for (const [metricIndex, metric] of comparison.metrics.entries()) {
      const metricRunIds = metric.values.map(({ runId }) => runId);
      if (!sameStringSet(metricRunIds, comparison.runIds)) {
        context.addIssue({
          code: "custom",
          message: "metric must contain exactly one value for every compared run",
          path: ["metrics", metricIndex, "values"],
        });
      }
    }
    for (const [index, finding] of comparison.adversarialFindings.entries()) {
      if (!runIds.has(finding.runId)) {
        context.addIssue({
          code: "custom",
          message: "finding belongs to a run outside this comparison",
          path: ["adversarialFindings", index, "runId"],
        });
      }
    }
  });

export const RunComparisonReportSchema = RunComparisonReportDataSchema.transform((value) => deepFreeze(value));
export const ComparisonReportSchema = RunComparisonReportSchema;

export type CongruencyDimensionOutcome = z.infer<typeof CongruencyDimensionOutcomeSchema>;
export type CongruencyStatus = z.infer<typeof CongruencyStatusSchema>;
export type CongruencyObservation = z.infer<typeof CongruencyObservationSchema>;
export type CongruencyDimension = z.infer<typeof CongruencyDimensionSchema>;
export type CongruencyReport = DeepReadonly<z.infer<typeof CongruencyReportDataSchema>>;
export type ComparisonMetric = z.infer<typeof ComparisonMetricSchema>;
export type RunComparisonReport = DeepReadonly<z.infer<typeof RunComparisonReportDataSchema>>;
export type ComparisonReport = RunComparisonReport;

export function deriveCongruencyStatus(
  dimensions: readonly Pick<CongruencyDimension, "outcome">[],
): CongruencyStatus {
  if (dimensions.some(({ outcome }) => outcome === "violation")) return "incongruent";
  if (dimensions.length === 0 || dimensions.some(({ outcome }) => outcome === "insufficient-evidence")) {
    return "indeterminate";
  }
  if (dimensions.some(({ outcome }) => outcome === "permitted-variation")) {
    return "congruent-with-permitted-variation";
  }
  return "congruent";
}

function addCongruencyIssues(
  report: z.infer<typeof CongruencyReportDataSchema>,
  context: z.core.$RefinementCtx,
): void {
  const runIds = new Set(report.runIds);
  if (runIds.size !== report.runIds.length) {
    context.addIssue({ code: "custom", message: "runIds must be unique", path: ["runIds"] });
  }
  addUniqueIdIssues(report.dimensions, context, ["dimensions"]);
  for (const [index, dimension] of report.dimensions.entries()) {
    const observationIds = dimension.observations.map(({ runId }) => runId);
    if (!sameStringSet(observationIds, report.runIds)) {
      context.addIssue({
        code: "custom",
        message: "dimension must contain exactly one observation for every compared run",
        path: ["dimensions", index, "observations"],
      });
    }
    if (dimension.requirement === "required" && dimension.outcome === "permitted-variation") {
      context.addIssue({
        code: "custom",
        message: "a required dimension cannot classify differences as permitted variation",
        path: ["dimensions", index, "outcome"],
      });
    }
  }
  const expected = deriveCongruencyStatus(report.dimensions);
  if (report.status !== expected) {
    context.addIssue({
      code: "custom",
      message: `status does not match dimension outcomes; expected ${expected}`,
      path: ["status"],
    });
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length &&
    new Set(right).size === right.length && left.every((item) => right.includes(item));
}
