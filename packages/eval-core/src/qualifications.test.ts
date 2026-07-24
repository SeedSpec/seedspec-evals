import { describe, expect, it } from "vitest";

import { CaseQualificationBodySchema, createCaseQualification } from "./qualifications.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

function qualificationBody() {
  return {
    schemaVersion: 1 as const,
    case: { id: "example-case", version: "1.0.0", digest: DIGEST },
    createdAt: "2026-07-24T12:00:00.000Z",
    status: "qualified" as const,
    candidates: [
      {
        id: "known-bad",
        classification: "known-bad" as const,
        description: "A superficially complete implementation with a broken authority boundary.",
        artifact: { path: "qualification/known-bad", digest: DIGEST },
        expected: {
          acceptability: "reject" as const,
          rationale: "The evaluator must reject the broken boundary.",
          dimensions: [{
            dimension: "security" as const,
            expectation: "must-detect-concern" as const,
            rationale: "Callers can impersonate another actor.",
          }],
        },
      },
      {
        id: "valid-alternative",
        classification: "valid-alternative" as const,
        description: "A valid noncanonical implementation.",
        artifact: { path: "qualification/valid-alternative", digest: DIGEST },
        expected: {
          acceptability: "accept" as const,
          rationale: "Implementation structure is deliberately different but behavior is valid.",
          dimensions: [{
            dimension: "maintainability" as const,
            expectation: "must-not-penalize" as const,
            rationale: "The rubric cannot require the reference module layout.",
          }],
        },
      },
    ],
    probes: [
      {
        id: "false-positive-attempt",
        candidateId: "known-bad",
        kind: "false-positive" as const,
        technique: "Supply shallow passing tests while leaving the authority boundary forgeable.",
        expectedDisposition: "reject" as const,
        observedDisposition: "reject" as const,
        assessment: "The independent review found the authority defect.",
        evidence: [{ path: "qualification/hack-report.md", digest: DIGEST, note: "Finding and rationale." }],
      },
      {
        id: "false-negative-attempt",
        candidateId: "valid-alternative",
        kind: "false-negative" as const,
        technique: "Use a different module layout and error vocabulary.",
        expectedDisposition: "accept" as const,
        observedDisposition: "accept" as const,
        assessment: "The evaluator accepted behaviorally equivalent structure.",
        evidence: [{ path: "qualification/hack-report.md", digest: DIGEST, note: "Alternative audit." }],
      },
    ],
    review: {
      reviewer: "evaluation-maintainer",
      reviewedAt: "2026-07-24T12:10:00.000Z",
      summary: "The evaluator distinguishes the known-bad and valid-alternative candidates.",
      limitations: [],
    },
  };
}

describe("case qualifications", () => {
  it("content-addresses a completed false-positive and false-negative calibration", () => {
    const qualification = createCaseQualification(qualificationBody());
    expect(qualification.qualificationId).toMatch(/^qualification_[a-f0-9]{64}$/);
    expect(qualification.status).toBe("qualified");
  });

  it("refuses to call an unrun or misclassified probe qualified", () => {
    const unrun = CaseQualificationBodySchema.parse(qualificationBody());
    unrun.probes[0]!.observedDisposition = "not-run";
    expect(CaseQualificationBodySchema.safeParse(unrun).success).toBe(false);

    const misclassified = CaseQualificationBodySchema.parse(qualificationBody());
    misclassified.probes[1]!.observedDisposition = "reject";
    expect(CaseQualificationBodySchema.safeParse(misclassified).success).toBe(false);
  });

  it("binds counterfactual classes to dispositions and qualified evidence digests", () => {
    const inverted = qualificationBody();
    inverted.candidates[0]!.expected.acceptability = "accept";
    expect(CaseQualificationBodySchema.safeParse(inverted).success).toBe(false);

    const unbound = qualificationBody();
    const evidenceWithoutDigest = unbound.probes[0]!.evidence.map(
      ({ path, note }) => ({ path, note }),
    );
    expect(CaseQualificationBodySchema.safeParse({
      ...unbound,
      probes: [
        { ...unbound.probes[0]!, evidence: evidenceWithoutDigest },
        ...unbound.probes.slice(1),
      ],
    }).success).toBe(false);
  });
});
