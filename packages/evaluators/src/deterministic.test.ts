import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  EvaluationCaseSchema,
  createRunManifest,
  sha256Hex,
} from "@seedspec/eval-core";

import { evaluateDeterministically } from "./deterministic.js";

const digest = `sha256:${"a".repeat(64)}` as const;

describe("evaluateDeterministically", () => {
  it("keeps unknown case-specific checks explicit and non-scoring", () => {
    const evaluationCase = EvaluationCaseSchema.parse({
      schemaVersion: 1,
      id: "example-case",
      version: "1.0.0",
      title: "Example",
      authorship: {
        mode: "sparse-application",
        objective: "Author the package.",
        sourceMaterials: [{
          id: "note",
          label: "Note",
          mediaType: "text/plain",
          content: "Build a small application.",
          origin: { kind: "inline" },
          trust: "untrusted",
        }],
        constraints: [],
        deliverables: [{ id: "manifest", description: "Manifest", required: true, path: "seedspec.yaml" }],
      },
      successCriteria: [{
        id: "valid",
        stage: "authorship",
        description: "The package validates.",
        measure: { kind: "deterministic", check: "seedspec.package.valid" },
      }],
      hiddenExpectations: [{
        id: "do-not-leak",
        stage: "authorship",
        description: "Hidden",
        severity: "major",
        evaluation: { kind: "deterministic", check: "hidden.check" },
        disclosure: "hidden",
      }],
      permittedVariability: [],
      simulatedToolResponses: [],
    });
    const manifest = createRunManifest({
      schemaVersion: 1,
      case: { id: evaluationCase.id, version: evaluationCase.version, digest },
      target: { stage: "authorship" },
      repetition: 0,
      createdAt: "2026-07-21T12:00:00.000Z",
      protocol: { name: "seedspec", version: "0.1.0-alpha.4" },
      runner: { id: "unit-test", kind: "local", version: "1.0.0" },
      model: { provider: "test", modelId: "none", parameters: {} },
      harness: { name: "unit-test", version: "1.0.0" },
      tools: [],
      evaluators: [],
      limits: { maxTurns: 1, maxDurationMs: 1000, maxInputBytes: 1000, maxOutputBytes: 1000 },
      instructionsDigest: `sha256:${sha256Hex("instructions")}`,
    });
    const artifacts = ArtifactManifestSchema.parse({
      schemaVersion: 1,
      runId: manifest.runId,
      artifacts: [],
    });

    const scorecard = evaluateDeterministically({
      manifest,
      evaluationCase,
      artifacts,
      stage: "authorship",
      createdAt: "2026-07-21T12:01:00.000Z",
    });

    expect(scorecard.checks.find((check) => check.id === "hidden-expectations-isolated")?.outcome).toBe("pass");
    expect(scorecard.checks.find((check) => check.id === "deliverable-manifest")?.outcome).toBe("fail");
    expect(scorecard.checks.find((check) => check.id === "criterion-valid")?.outcome).toBe("not-applicable");
  });
});
