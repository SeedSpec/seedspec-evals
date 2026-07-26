import { describe, expect, it } from "vitest";

import {
  createEvalFeedbackLedger,
  parseEvalFeedbackLedger,
} from "./feedback-ledgers.js";

describe("eval feedback ledgers", () => {
  it("content-addresses actionable feedback with its evidence and verification", () => {
    const ledger = createEvalFeedbackLedger({
      schemaVersion: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      scope: {
        kind: "skill",
        id: "implement-stateful-workflows",
        digest: `sha256:${"a".repeat(64)}`,
      },
      entries: [{
        id: "identity-boundary-probe",
        disposition: "change",
        summary: "Add a deterministic probe for identity-boundary enforcement.",
        failureMechanism: "Semantic review repeatedly found forgeable caller identity.",
        owningLayer: "deterministic-evaluator",
        proposedAction: "Promote the qualified boundary scenario into an executable probe.",
        negativeControls: ["A valid delegated caller remains accepted."],
        evidence: [{
          kind: "profile",
          artifactId: `profile_${"b".repeat(64)}`,
          claim: "The critical finding recurred across confirmed runs.",
        }],
        status: "verified",
        verification: {
          method: "deterministic-probe",
          status: "passed",
          artifactIds: [`probe_result_${"c".repeat(64)}`],
          assessment: "The probe rejects the known-bad artifact and accepts the valid alternative.",
        },
      }],
      summary: "One evaluator improvement was verified.",
    });

    expect(ledger.feedbackLedgerId).toMatch(/^feedback_ledger_[a-f0-9]{64}$/);
    expect(parseEvalFeedbackLedger(ledger).entries[0]?.status).toBe("verified");
  });

  it("rejects deterministic changes without a flexibility-preserving negative control", () => {
    expect(() => createEvalFeedbackLedger({
      schemaVersion: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      scope: { kind: "evaluator", id: "contract-gate" },
      entries: [{
        id: "overfit-check",
        disposition: "change",
        summary: "Add a narrow deterministic check.",
        failureMechanism: "A known-bad artifact passed.",
        owningLayer: "deterministic-evaluator",
        proposedAction: "Reject one source spelling.",
        evidence: [{ kind: "note", claim: "Observed during screening." }],
        status: "open",
      }],
      summary: "Draft feedback.",
    })).toThrow(/negative control/);
  });
});
