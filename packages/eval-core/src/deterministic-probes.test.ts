import { describe, expect, it } from "vitest";

import {
  createDeterministicProbe,
  createDeterministicProbeResult,
} from "./deterministic-probes.js";

const PROBE_BODY = {
  schemaVersion: 1 as const,
  case: {
    id: "identity-boundary",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}` as const,
  },
  qualificationId: `qualification_${"b".repeat(64)}` as const,
  sourceProbeIds: ["known-bad-semantic-review", "valid-alternative-semantic-review"],
  createdAt: "2026-07-24T12:00:00.000Z",
  description: "Reject caller-supplied identity while accepting verified delegated identity.",
  command: {
    argv: ["node", "test/identity-boundary.test.mjs"],
    timeoutMs: 30_000,
  },
  controls: [{
    candidateId: "forgeable-caller",
    expectedOutcome: "fail" as const,
    rationale: "The known-bad implementation trusts caller-supplied identity.",
  }, {
    candidateId: "verified-delegation",
    expectedOutcome: "pass" as const,
    rationale: "The valid alternative verifies delegated identity at the boundary.",
  }],
  limitations: [],
};

describe("deterministic probe promotion", () => {
  it("requires rejection and valid-alternative controls and derives result status", () => {
    const probe = createDeterministicProbe(PROBE_BODY);
    const result = createDeterministicProbeResult({
      schemaVersion: 1,
      probeId: probe.probeId,
      qualificationId: probe.qualificationId,
      createdAt: "2026-07-24T12:01:00.000Z",
      executions: probe.controls.map((control, index) => ({
        candidateId: control.candidateId,
        artifactDigest: `sha256:${String(index + 1).repeat(64)}` as const,
        expectedOutcome: control.expectedOutcome,
        observedOutcome: control.expectedOutcome,
        matchesExpectation: true,
        startedAt: "2026-07-24T12:01:00.000Z",
        finishedAt: "2026-07-24T12:01:01.000Z",
        sandbox: "darwin-sandbox-exec" as const,
        exitCode: control.expectedOutcome === "pass" ? 0 : 1,
        stdout: "",
        stderr: "",
      })),
      status: "passed",
      limitations: ["Exit status is only one behavioral seam."],
    });

    expect(probe.probeId).toMatch(/^deterministic_probe_[a-f0-9]{64}$/);
    expect(result.probeResultId).toMatch(/^probe_result_[a-f0-9]{64}$/);
    expect(result.status).toBe("passed");
  });

  it("rejects one-sided probes that would penalize flexible valid alternatives", () => {
    expect(() => createDeterministicProbe({
      ...PROBE_BODY,
      controls: [PROBE_BODY.controls[0]!],
    })).toThrow();
  });
});
