import { describe, expect, it } from "vitest";

import { ScorecardSchema } from "@seedspec/eval-core";

import { createVariantComparison } from "./comparison.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function scorecard(runCharacter: string, variant: "raw-source" | "seedspec-minimal" | "seedspec-restructured", points: number) {
  return ScorecardSchema.parse({
    schemaVersion: 1,
    id: "authorship-rubric",
    runId: `run_${runCharacter.repeat(64)}`,
    case: { id: "example-case", version: "1.0.0", digest },
    stage: "authorship",
    variant,
    createdAt: "2026-07-21T12:00:00.000Z",
    evaluator: { id: "seedspec-authorship-rubric", kind: "rubric", version: "0.1.0-alpha.3" },
    kind: "rubric",
    judgeModel: { provider: "test", modelId: "test/judge", parameters: {} },
    summary: { earned: points, possible: 4, normalized: points / 4 },
    criteria: [{
      id: "target-definition",
      description: "Desired end state",
      points,
      maxPoints: 4,
      confidence: 0.9,
      justification: "Test evidence.",
      evidence: [],
    }],
    overallAssessment: "Test assessment.",
  });
}

describe("createVariantComparison", () => {
  it("reports per-run deltas from the raw-source mean", () => {
    const report = createVariantComparison({
      scorecards: [
        scorecard("a", "raw-source", 2),
        scorecard("b", "seedspec-minimal", 3),
        scorecard("c", "seedspec-restructured", 4),
      ],
      baselineVariant: "raw-source",
      createdAt: "2026-07-21T12:01:00.000Z",
    });

    expect(report.baseline.meanNormalizedScore).toBe(0.5);
    expect(report.runs.find(({ variant }) => variant === "seedspec-restructured")?.deltaFromBaseline).toBe(0.5);
    expect(report.metrics.map(({ id }) => id)).toEqual(["overall-score", "rubric-target-definition"]);
  });
});
