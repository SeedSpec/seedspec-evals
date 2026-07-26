import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

export const PairedMetricSummarySchema = z.strictObject({
  metric: z.string().trim().min(1).max(128).regex(/^(?:technical|process)\.[a-z0-9-]+$/),
  direction: z.enum(["higher-is-better", "lower-is-better"]),
  n: z.number().int().nonnegative(),
  evidenceTier: z.enum(["screening", "confirmation-eligible"]),
  previousMedian: z.number().finite().optional(),
  candidateMedian: z.number().finite().optional(),
  pairedDeltaMedian: z.number().finite().optional(),
  pairedDeltaQ1: z.number().finite().optional(),
  pairedDeltaQ3: z.number().finite().optional(),
  improved: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  regressed: z.number().int().nonnegative(),
  exactSignTestPValue: z.number().min(0).max(1).optional(),
}).superRefine((metric, context) => {
  if (metric.improved + metric.unchanged + metric.regressed !== metric.n) {
    context.addIssue({
      code: "custom",
      message: "paired metric direction counts must sum to n",
    });
  }
  const expectedTier = metric.n >= 5 ? "confirmation-eligible" : "screening";
  if (metric.evidenceTier !== expectedTier) {
    context.addIssue({
      code: "custom",
      message: `metric evidenceTier does not match n; expected ${expectedTier}`,
      path: ["evidenceTier"],
    });
  }
  const summaries = [
    metric.previousMedian,
    metric.candidateMedian,
    metric.pairedDeltaMedian,
    metric.pairedDeltaQ1,
    metric.pairedDeltaQ3,
  ];
  if (metric.n === 0 && summaries.some((value) => value !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "empty paired metrics cannot report medians or quartiles",
    });
  }
  if (metric.n > 0 && summaries.some((value) => value === undefined)) {
    context.addIssue({
      code: "custom",
      message: "non-empty paired metrics require medians and quartiles",
    });
  }
});

export const PairedRevisionStatisticsBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: IsoTimestampSchema,
  planId: z.string().regex(/^plan_[a-f0-9]{64}$/),
  previousPlanId: z.string().regex(/^plan_[a-f0-9]{64}$/),
  hypothesis: z.string().trim().min(1).max(8_000),
  minimumConfirmationPairs: z.literal(5),
  groups: z.array(z.strictObject({
    caseId: IdentifierSchema,
    guidanceDelivery: z.string().trim().min(1).max(128),
    requestedModel: z.string().trim().min(1).max(256),
    plannedPairs: z.number().int().positive(),
    completePairs: z.number().int().nonnegative(),
    verifiedModelPairs: z.number().int().nonnegative(),
    evidenceTier: z.enum(["screening", "confirmation-eligible"]),
    modelIdentityScope: z.enum(["requested-model-only", "served-model-verified"]),
    pairIds: z.array(z.string().regex(/^pair_[a-f0-9]{64}$/)).min(1).max(10_000),
    missingProfileRunIds: z.array(z.string().regex(/^run_[a-f0-9]{64}$/)).max(20_000),
    metrics: z.array(PairedMetricSummarySchema).max(64),
  })).min(1).max(10_000),
  method: z.strictObject({
    center: z.literal("median"),
    spread: z.literal("Tukey hinges over paired deltas"),
    directionTest: z.literal("two-sided exact sign test excluding ties"),
    multiplicity: z.literal("No automatic multi-metric winner or uncorrected significance claim is produced."),
  }),
  limitations: z.array(z.string().trim().min(1).max(8_000)).min(1).max(128),
}).superRefine((statistics, context) => {
  const allPairIds: string[] = [];
  for (const [index, group] of statistics.groups.entries()) {
    allPairIds.push(...group.pairIds);
    if (group.pairIds.length !== group.plannedPairs) {
      context.addIssue({
        code: "custom",
        message: "pairIds must enumerate every planned pair",
        path: ["groups", index, "pairIds"],
      });
    }
    if (group.completePairs > group.plannedPairs) {
      context.addIssue({
        code: "custom",
        message: "completePairs cannot exceed plannedPairs",
        path: ["groups", index, "completePairs"],
      });
    }
    if (group.verifiedModelPairs > group.completePairs) {
      context.addIssue({
        code: "custom",
        message: "verifiedModelPairs cannot exceed completePairs",
        path: ["groups", index, "verifiedModelPairs"],
      });
    }
    const expectedTier = group.completePairs >= statistics.minimumConfirmationPairs
      ? "confirmation-eligible"
      : "screening";
    if (group.evidenceTier !== expectedTier) {
      context.addIssue({
        code: "custom",
        message: `evidenceTier does not match the replication threshold; expected ${expectedTier}`,
        path: ["groups", index, "evidenceTier"],
      });
    }
    const expectedIdentityScope =
      group.verifiedModelPairs >= statistics.minimumConfirmationPairs
        ? "served-model-verified"
        : "requested-model-only";
    if (group.modelIdentityScope !== expectedIdentityScope) {
      context.addIssue({
        code: "custom",
        message: `modelIdentityScope does not match verified pairs; expected ${expectedIdentityScope}`,
        path: ["groups", index, "modelIdentityScope"],
      });
    }
    for (const [metricIndex, metric] of group.metrics.entries()) {
      if (metric.n > group.completePairs) {
        context.addIssue({
          code: "custom",
          message: "metric n cannot exceed completePairs",
          path: ["groups", index, "metrics", metricIndex, "n"],
        });
      }
    }
  }
  if (new Set(allPairIds).size !== allPairIds.length) {
    context.addIssue({
      code: "custom",
      message: "paired statistics cannot repeat a pair across groups",
      path: ["groups"],
    });
  }
});

const PairedRevisionStatisticsDataSchema = PairedRevisionStatisticsBodySchema.safeExtend({
  statisticsId: z.string().regex(/^paired_statistics_[a-f0-9]{64}$/),
}).superRefine((statistics, context) => {
  const { statisticsId, ...body } = statistics;
  const parsed = PairedRevisionStatisticsBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("paired_statistics", parsed.data as unknown as JsonValue);
  if (statisticsId !== expected) {
    context.addIssue({
      code: "custom",
      message: `statisticsId does not match statistics content; expected ${expected}`,
      path: ["statisticsId"],
    });
  }
});

export const PairedRevisionStatisticsSchema =
  PairedRevisionStatisticsDataSchema.transform((value) => deepFreeze(value));
export type PairedRevisionStatistics =
  DeepReadonly<z.infer<typeof PairedRevisionStatisticsDataSchema>>;

export function createPairedRevisionStatistics(
  input: z.input<typeof PairedRevisionStatisticsBodySchema>,
): PairedRevisionStatistics {
  const body = PairedRevisionStatisticsBodySchema.parse(input);
  return PairedRevisionStatisticsSchema.parse({
    ...body,
    statisticsId: contentId("paired_statistics", body as unknown as JsonValue),
  });
}

export function parsePairedRevisionStatistics(input: unknown): PairedRevisionStatistics {
  return PairedRevisionStatisticsSchema.parse(input);
}
