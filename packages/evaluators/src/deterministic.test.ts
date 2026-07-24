import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  EvaluationCaseSchema,
  createArtifact,
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
        sourceMaterials: [{
          id: "note",
          label: "Note",
          mediaType: "text/plain",
          content: "Build a small application.",
          origin: { kind: "inline" },
          trust: "untrusted",
        }],
        constraints: [],
        variants: {
          "raw-source": {
            objective: "Write instructions.",
            deliverables: [{ id: "instructions", description: "Instructions", required: true, path: "instructions.md" }],
          },
          "markdown-authored": {
            objective: "Write Markdown instructions.",
            deliverables: [{ id: "instructions", description: "Instructions", required: true, path: "instructions.md" }],
          },
          "seedspec-minimal": {
            objective: "Author the package.",
            deliverables: [{ id: "manifest", description: "Manifest", required: true, path: "seedspec.yaml" }],
          },
          "seedspec-guided": {
            objective: "Author the package.",
            deliverables: [{ id: "manifest", description: "Manifest", required: true, path: "seedspec.yaml" }],
          },
          "seedspec-restructured": {
            objective: "Author the package.",
            deliverables: [{ id: "manifest", description: "Manifest", required: true, path: "seedspec.yaml" }],
          },
        },
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
      comparisonAxes: {
        decisions: [{ id: "scope", stages: ["authorship"], title: "Scope", description: "Choose the package scope.", materiality: "material" }],
        obligations: [{ id: "valid-output", stages: ["authorship"], kind: "success-criterion", description: "Produce a valid output.", importance: "material" }],
      },
    });
    const manifest = createRunManifest({
      schemaVersion: 1,
      case: { id: evaluationCase.id, version: evaluationCase.version, digest },
      target: { stage: "authorship" },
      variant: "seedspec-guided",
      repetition: 0,
      createdAt: "2026-07-21T12:00:00.000Z",
      protocol: { name: "seedspec", version: "0.2.0" },
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
      artifacts: [createArtifact({
        schemaVersion: 1,
        runId: manifest.runId,
        stage: "authorship",
        variant: manifest.variant,
        kind: "authored-package",
        path: "open-questions.yaml",
        mediaType: "application/yaml",
        byteLength: 12,
        digest,
        createdAt: "2026-07-21T12:00:30.000Z",
        provenance: {
          case: manifest.case,
          variant: manifest.variant,
          protocol: manifest.protocol,
          runner: manifest.runner,
          model: manifest.model,
          harness: manifest.harness,
          tools: [],
          evaluators: [],
        },
      })],
    });

    const scorecard = evaluateDeterministically({
      manifest,
      evaluationCase,
      artifacts,
      stage: "authorship",
      createdAt: "2026-07-21T12:01:00.000Z",
    });

    expect(scorecard.checks.find((check) => check.id === "hidden-expectations-isolated")?.outcome).toBe("pass");
    expect(scorecard.checks.find((check) => check.id === "run-completed-with-trace")?.outcome).toBe("fail");
    expect(scorecard.checks.find((check) => check.id === "deliverable-manifest")?.outcome).toBe("fail");
    expect(scorecard.checks.find((check) => check.id === "criterion-valid")?.outcome).toBe("not-applicable");
    expect(scorecard.checks.find((check) => check.id === "authoring-state-excluded")?.outcome).toBe("fail");
    expect(scorecard.assessmentScope).toBe("run-contract-and-integrity");
    expect(scorecard.interpretation).toContain("not an implementation-quality score");
    expect(scorecard.gate).toMatchObject({
      status: "fail",
      failed: 3,
      unevaluated: 2,
    });
    expect(scorecard.gate?.categories.find(({ category }) => category === "run-integrity")).toMatchObject({
      status: "fail",
      passed: 2,
      failed: 1,
    });
  });
});
