import { describe, expect, it } from "vitest";

import { createPairedRevisionStatistics } from "./confirmation-statistics.js";

describe("paired revision confirmation statistics", () => {
  it("content-addresses separate paired metrics and the five-pair eligibility gate", () => {
    const statistics = createPairedRevisionStatistics({
      schemaVersion: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      planId: `plan_${"a".repeat(64)}`,
      previousPlanId: `plan_${"b".repeat(64)}`,
      hypothesis: "A boundary check reduces critical identity defects.",
      minimumConfirmationPairs: 5,
      groups: [{
        caseId: "identity-boundary",
        guidanceDelivery: "skill-guidance",
        requestedModel: "openai/example",
        plannedPairs: 5,
        completePairs: 5,
        verifiedModelPairs: 3,
        evidenceTier: "confirmation-eligible",
        modelIdentityScope: "requested-model-only",
        pairIds: Array.from({ length: 5 }, (_, index) =>
          `pair_${String(index + 1).repeat(64)}`),
        missingProfileRunIds: [],
        metrics: [{
          metric: "technical.security",
          direction: "higher-is-better",
          n: 5,
          evidenceTier: "confirmation-eligible",
          previousMedian: 2,
          candidateMedian: 3,
          pairedDeltaMedian: 1,
          pairedDeltaQ1: 0,
          pairedDeltaQ3: 1,
          improved: 3,
          unchanged: 2,
          regressed: 0,
          exactSignTestPValue: 0.25,
        }],
      }],
      method: {
        center: "median",
        spread: "Tukey hinges over paired deltas",
        directionTest: "two-sided exact sign test excluding ties",
        multiplicity: "No automatic multi-metric winner or uncorrected significance claim is produced.",
      },
      limitations: ["Five pairs permit confirmation analysis but do not prove transfer."],
    });

    expect(statistics.statisticsId).toMatch(/^paired_statistics_[a-f0-9]{64}$/);
    expect(statistics.groups[0]?.modelIdentityScope).toBe("requested-model-only");
    expect(statistics.groups[0]?.metrics).toHaveLength(1);
  });

  it("rejects direction counts that do not equal the paired sample", () => {
    expect(() => createPairedRevisionStatistics({
      schemaVersion: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      planId: `plan_${"a".repeat(64)}`,
      previousPlanId: `plan_${"b".repeat(64)}`,
      hypothesis: "A boundary check reduces critical identity defects.",
      minimumConfirmationPairs: 5,
      groups: [{
        caseId: "identity-boundary",
        guidanceDelivery: "skill-guidance",
        requestedModel: "openai/example",
        plannedPairs: 1,
        completePairs: 1,
        verifiedModelPairs: 0,
        evidenceTier: "screening",
        modelIdentityScope: "requested-model-only",
        pairIds: [`pair_${"c".repeat(64)}`],
        missingProfileRunIds: [],
        metrics: [{
          metric: "technical.security",
          direction: "higher-is-better",
          n: 1,
          evidenceTier: "screening",
          previousMedian: 2,
          candidateMedian: 3,
          pairedDeltaMedian: 1,
          pairedDeltaQ1: 1,
          pairedDeltaQ3: 1,
          improved: 0,
          unchanged: 0,
          regressed: 0,
        }],
      }],
      method: {
        center: "median",
        spread: "Tukey hinges over paired deltas",
        directionTest: "two-sided exact sign test excluding ties",
        multiplicity: "No automatic multi-metric winner or uncorrected significance claim is produced.",
      },
      limitations: ["Fixture."],
    })).toThrow(/sum to n/);
  });
});
