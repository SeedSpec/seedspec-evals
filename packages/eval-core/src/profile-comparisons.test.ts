import { describe, expect, it } from "vitest";

import { createProfileComparison } from "./profile-comparisons.js";
import { createEvaluationProfile } from "./profiles.js";

const CASE_DIGEST = `sha256:${"a".repeat(64)}` as const;

function profile(variant: "raw-source" | "markdown-authored", runCharacter: string, coverage: "covered" | "partial") {
  return createEvaluationProfile({
    schemaVersion: 1,
    subject: {
      stage: "authorship",
      runId: `run_${runCharacter.repeat(64)}`,
      variant,
      case: { id: "comparison-case", version: "1.0.0", digest: CASE_DIGEST },
    },
    createdAt: "2026-07-22T12:00:00.000Z",
    evaluator: { id: "profile-evaluator", version: "0.1.0", kind: "agent" },
    decisions: [{
      id: "runtime-choice",
      caseAxisId: "runtime-axis",
      domain: "architecture",
      title: "Runtime choice",
      description: "Choose a runtime.",
      materiality: { level: "material", basis: "evaluator-assessed", rationale: "It changes deployment." },
      expectedLatitude: variant === "raw-source" ? "open" : "preferred",
      alternatives: [],
      provenance: { proposedBy: [], selectedBy: [], constrainedBy: [], implementedBy: [] },
      disclosure: variant === "raw-source" ? "implicit" : "explicit",
      alignment: "not-observed",
      confidence: 0.8,
      assessment: "Authorship-stage choice.",
      evidence: [{ path: "instructions.md", note: "Runtime language" }],
    }, {
      id: "variant-specific-choice",
      domain: "presentation",
      title: "Variant-specific choice",
      description: "A subject-specific observation outside the common denominator.",
      materiality: { level: "minor", basis: "evaluator-assessed", rationale: "It changes presentation only." },
      expectedLatitude: "open",
      alternatives: [],
      provenance: { proposedBy: [], selectedBy: [], constrainedBy: [], implementedBy: [] },
      disclosure: "explicit",
      alignment: "not-observed",
      confidence: 0.7,
      assessment: "Not a shared comparison axis.",
      evidence: [{ path: "instructions.md", note: "Presentation choice" }],
    }],
    obligations: [{
      id: "health-check",
      caseAxisId: "health-axis",
      kind: "behavior",
      description: "Expose a health check.",
      importance: "material",
      source: [{ path: "instructions.md", note: "Required behavior" }],
      plannedEvidence: [],
      observedEvidence: [],
      coverage,
      distinguishing: coverage === "covered" ? "yes" : "no",
      assessment: "Coverage varies by profile.",
      confidence: 0.85,
    }],
    structure: [],
    summary: "Fixture profile.",
    limitations: [],
  });
}

describe("profile comparisons", () => {
  it("uses predeclared axes and preserves subject-specific records without scoring", () => {
    const comparison = createProfileComparison({
      profiles: [profile("raw-source", "b", "partial"), profile("markdown-authored", "c", "covered")],
      comparisonAxes: {
        decisions: [{
          id: "runtime-axis",
          stages: ["authorship"],
          title: "Runtime authority",
          description: "How runtime selection is governed.",
          materiality: "material",
        }],
        obligations: [{
          id: "health-axis",
          stages: ["authorship"],
          kind: "behavior",
          description: "Health-check behavior is specified.",
          importance: "material",
        }],
      },
      createdAt: "2026-07-22T13:00:00.000Z",
    });

    expect(comparison.comparisonId).toMatch(/^profile_comparison_[a-f0-9]{64}$/);
    expect(comparison.decisionAxes[0]?.observations).toHaveLength(2);
    expect(comparison.obligationAxes[0]?.observations.map((observation) =>
      observation.status === "present" ? observation.coverage : "missing")).toEqual(["partial", "covered"]);
    expect(comparison.unmatched.every(({ decisionIds }) => decisionIds.includes("variant-specific-choice"))).toBe(true);
    expect(comparison).not.toHaveProperty("score");
    expect(comparison).not.toHaveProperty("winner");
  });
});
