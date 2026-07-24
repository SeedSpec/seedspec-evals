import { describe, expect, it } from "vitest";

import {
  DecisionLedgerSchema,
  EvaluationProfileSchema,
  TECHNICAL_QUALITY_DIMENSIONS,
  TechnicalQualityAssessmentSchema,
  createDecisionLedger,
  createEvaluationProfile,
  summarizeEvaluationProfile,
} from "./profiles.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

function qualityDimensions(level = 3) {
  return TECHNICAL_QUALITY_DIMENSIONS.map((dimension) => ({
    dimension,
    status: "assessed" as const,
    level,
    confidence: 0.8,
    assessment: `${dimension} is supported by the fixture evidence.`,
    evidence: [{ path: "report.md", note: `${dimension} fixture evidence` }],
    findingIds: [] as string[],
  }));
}

function profileBody() {
  return {
    schemaVersion: 1 as const,
    subject: {
      stage: "implementation" as const,
      package: { id: "example.package", version: "1.0.0", digest: DIGEST },
    },
    createdAt: "2026-07-22T12:00:00.000Z",
    evaluator: {
      id: "profile-evaluator",
      version: "0.1.0",
      kind: "agent" as const,
      model: { provider: "openai", modelId: "openai/example", parameters: {} },
    },
    decisions: [{
      id: "runtime-choice",
      domain: "architecture",
      title: "Runtime choice",
      description: "Choose the runtime used by the implementation.",
      materiality: {
        level: "material" as const,
        basis: "author-declared" as const,
        rationale: "The runtime changes deployment and maintenance.",
      },
      expectedLatitude: "preferred" as const,
      alternatives: ["Node.js", "Ruby"],
      observedChoice: "Ruby",
      provenance: {
        proposedBy: [{
          actor: "implementation-profile" as const,
          basis: "The profile prefers Ruby.",
          evidence: [{ path: "implementation/rails.md", note: "Preferred runtime" }],
        }],
        selectedBy: [{
          actor: "implementing-agent" as const,
          basis: "The observable implementation uses Ruby.",
          evidence: [{ path: "Gemfile", note: "Ruby dependency manifest" }],
        }],
        constrainedBy: [],
        implementedBy: [{
          actor: "implementing-agent" as const,
          basis: "The agent produced the implementation.",
          evidence: [{ path: "trace.json", traceSequence: 10, note: "Implementation event" }],
        }],
      },
      disclosure: "explicit" as const,
      alignment: "aligned" as const,
      confidence: 0.9,
      assessment: "The observed choice follows the preferred profile.",
      evidence: [{ path: "Gemfile", note: "Observed runtime" }],
    }],
    obligations: [{
      id: "health-check",
      kind: "behavior" as const,
      description: "Expose a health check.",
      importance: "material" as const,
      source: [{ path: "definition/application.md", note: "Required behavior" }],
      plannedEvidence: [{ path: "acceptance/criteria.md", note: "Verification plan" }],
      observedEvidence: [{ path: "test/health.test.ts", note: "Observed test" }],
      coverage: "covered" as const,
      distinguishing: "yes" as const,
      assessment: "The test distinguishes healthy and failed dependencies.",
      confidence: 0.85,
    }],
    structure: [],
    process: {
      capture: {
        turns: "reported" as const,
        tokens: "provider-reported" as const,
        cache: "provider-reported" as const,
        duration: "reported" as const,
      },
      turns: { total: 4, user: 2, agent: 2, clarification: 1, correction: 0 },
      tokens: { input: 100, cachedInputRead: 80, output: 50, total: 150 },
      toolCalls: 6,
      durationMs: 5_000,
      notes: [],
    },
    technical: {
      checks: [{
        id: "meaningful-code",
        dimension: "meaningfulness" as const,
        method: "structured-review" as const,
        outcome: "pass" as const,
        description: "Production paths contain meaningful behavior.",
        assessment: "No placeholder behavior was found.",
        confidence: 0.8,
        evidence: [{ path: "src/health.ts", note: "Implemented health behavior" }],
      }],
      quality: {
        rubricVersion: "0.1.0" as const,
        dimensions: qualityDimensions(),
        findings: [],
        readiness: "robust" as const,
        summary: "The independent vector is robust across assessed dimensions.",
        limitations: [],
      },
      adaptationChallenges: [],
      summary: "The implementation is technically coherent for the evaluated scope.",
    },
    summary: "The implementation follows the preferred runtime and covers the health obligation.",
    limitations: ["Only one adaptation axis was inspected."],
  };
}

describe("descriptive evaluation profiles", () => {
  it("content-addresses a profile and summarizes dimensions without a quality score", () => {
    const profile = createEvaluationProfile(profileBody());
    const summary = summarizeEvaluationProfile(profile);

    expect(profile.profileId).toMatch(/^profile_[a-f0-9]{64}$/);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(summary.decisions).toMatchObject({ total: 1, material: 1, ambientMaterial: 0 });
    expect(summary.obligations).toMatchObject({ total: 1, covered: 1 });
    expect(summary.technical).toMatchObject({ checks: 1, pass: 1 });
    expect(summary.technical?.quality).toMatchObject({
      readiness: "robust",
      assessed: TECHNICAL_QUALITY_DIMENSIONS.length,
      unknown: 0,
    });
    expect(summary).not.toHaveProperty("score");
  });

  it("caps readiness when independent evidence identifies an open critical finding", () => {
    const dimensions = qualityDimensions();
    const security = dimensions.find(({ dimension }) => dimension === "security")!;
    security.level = 0;
    security.findingIds.push("public-auth-secret");
    const quality = TechnicalQualityAssessmentSchema.parse({
      rubricVersion: "0.1.0",
      dimensions,
      findings: [{
        id: "public-auth-secret",
        dimension: "security",
        severity: "critical",
        status: "open",
        description: "Authentication secrets are public.",
        assessment: "Any user can cross the trust boundary.",
        evidence: [{ path: "src/config.ts", note: "Public credential" }],
      }],
      readiness: "blocked",
      summary: "An open critical security finding blocks readiness.",
      limitations: [],
    });
    expect(quality.readiness).toBe("blocked");
    expect(() => TechnicalQualityAssessmentSchema.parse({
      ...quality,
      readiness: "robust",
    })).toThrow(/expected blocked/);
  });

  it("prevents robust dimensions from coexisting with open or unknown material findings", () => {
    const openDimensions = qualityDimensions();
    openDimensions.find(({ dimension }) => dimension === "reliability")!.findingIds.push("non-atomic-write");
    expect(() => TechnicalQualityAssessmentSchema.parse({
      rubricVersion: "0.1.0",
      dimensions: openDimensions,
      findings: [{
        id: "non-atomic-write",
        dimension: "reliability",
        severity: "material",
        status: "open",
        description: "Persistence can expose a partial write.",
        assessment: "The failure path can corrupt durable state.",
        evidence: [{ path: "src/store.ts", note: "Non-atomic write" }],
      }],
      readiness: "robust",
      summary: "Invalid fixture.",
      limitations: [],
    })).toThrow(/caps its dimension at level 2/);

    const unknownDimensions = qualityDimensions();
    unknownDimensions.find(({ dimension }) => dimension === "security")!.findingIds.push("session-boundary-unknown");
    expect(() => TechnicalQualityAssessmentSchema.parse({
      rubricVersion: "0.1.0",
      dimensions: unknownDimensions,
      findings: [{
        id: "session-boundary-unknown",
        dimension: "security",
        severity: "material",
        status: "unknown",
        description: "Session invalidation could not be established.",
        assessment: "Available evidence does not reveal invalidation behavior.",
        evidence: [{ path: "src/auth.ts", note: "No observable invalidation path" }],
      }],
      readiness: "robust",
      summary: "Invalid fixture.",
      limitations: [],
    })).toThrow(/requires an unknown dimension assessment/);
  });

  it("keeps unknown dimensions unscored and makes readiness indeterminate", () => {
    const dimensions = qualityDimensions().map((dimension) =>
      dimension.dimension === "accessibility"
        ? {
            ...dimension,
            status: "unknown" as const,
            level: undefined,
            evidence: [],
            assessment: "No browser or assistive-technology evidence was captured.",
          }
        : dimension);
    const quality = TechnicalQualityAssessmentSchema.parse({
      rubricVersion: "0.1.0",
      dimensions,
      findings: [],
      readiness: "indeterminate",
      summary: "Accessibility remains unknown.",
      limitations: ["No browser evidence."],
    });
    expect(quality.dimensions.find(({ dimension }) => dimension === "accessibility")?.level).toBeUndefined();
    expect(() => TechnicalQualityAssessmentSchema.parse({
      ...quality,
      readiness: "robust",
    })).toThrow(/expected indeterminate/);
    expect(() => TechnicalQualityAssessmentSchema.parse({
      ...quality,
      dimensions: quality.dimensions.map((dimension) =>
        dimension.dimension === "accessibility" ? { ...dimension, level: 3 } : dimension),
    })).toThrow(/cannot receive an ordinal level/);
  });

  it("content-addresses an observable decision ledger without treating it as adjudication", () => {
    const ledger = createDecisionLedger({
      schemaVersion: 1,
      runId: `run_${"b".repeat(64)}`,
      createdAt: "2026-07-22T12:00:00.000Z",
      entries: [{
        id: "runtime-choice",
        domain: "architecture",
        title: "Runtime choice",
        choice: "Ruby",
        materiality: {
          level: "material",
          basis: "evaluator-assessed",
          rationale: "The runtime changes deployment and maintenance.",
        },
        expectedLatitude: "preferred",
        sources: [{
          actor: "implementation-profile",
          basis: "The selected profile prefers Ruby.",
          evidence: [{ path: "implementation/rails.md", note: "Profile preference" }],
        }],
        alternativesConsidered: ["Node.js"],
        disclosure: "explicit",
        rationale: "The implementation followed the selected profile.",
        evidence: [{ path: "Gemfile", note: "Observed dependency manifest" }],
      }],
      limitations: ["The ledger is an implementing-agent claim requiring independent review."],
    });

    expect(ledger.ledgerId).toMatch(/^ledger_[a-f0-9]{64}$/);
    expect(ledger.entries[0]).not.toHaveProperty("alignment");
    expect(DecisionLedgerSchema.safeParse({ ...ledger, limitations: [] }).success).toBe(false);
  });

  it("rejects tampering and contradictory ambient classification", () => {
    const profile = createEvaluationProfile(profileBody());
    expect(EvaluationProfileSchema.safeParse({ ...profile, summary: "Tampered" }).success).toBe(false);

    const validBody = profileBody();
    const invalid = {
      ...validBody,
      decisions: [{
        ...validBody.decisions[0]!,
        expectedLatitude: "delegated" as const,
        alignment: "ambient" as const,
      }],
    };
    expect(() => createEvaluationProfile(invalid)).toThrow(/deliberately delegated or open/);
  });

  it("rejects invented totals and evidence without a locator", () => {
    const invalidTotals = profileBody();
    invalidTotals.process.turns.total = 5;
    expect(() => createEvaluationProfile(invalidTotals)).toThrow(/turn total/);

    const validBody = profileBody();
    const invalidEvidence = {
      ...validBody,
      decisions: [{
        ...validBody.decisions[0]!,
        evidence: [{ note: "No location" }],
      }],
    };
    expect(() => createEvaluationProfile(invalidEvidence)).toThrow(/identify an artifact, path, or trace event/);
  });
});
