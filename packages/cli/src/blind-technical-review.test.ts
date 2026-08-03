import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  TECHNICAL_QUALITY_DIMENSIONS,
  createImplementationVerification,
} from "@seedspec/eval-core";
import { afterEach, describe, expect, it } from "vitest";

import { bundleAuthoredInput, materializeAuthoredInput } from "./authored-input.js";
import {
  buildBlindTechnicalReviewBrief,
  finalizeBlindTechnicalReviewFile,
  unblindTechnicalReview,
} from "./blind-technical-review.js";
import { createExperimentPlan } from "./plan.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("treatment-blinded technical review", () => {
  it("withholds treatment identity, finalizes under an opaque subject, and reattaches after review", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "seedspec-blind-review-"));
    temporaryDirectories.push(root);
    const authored = resolve(root, "authored");
    const runDirectory = resolve(root, "run-with-visible-treatment-name");
    const realization = resolve(runDirectory, "workspace", "realization");
    await Promise.all([
      mkdir(authored, { recursive: true }),
      mkdir(realization, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(resolve(authored, "spec.md"), "# Authored intent\n", "utf8"),
      writeFile(resolve(realization, "app.mjs"), "export const ready = true;\n", "utf8"),
      writeFile(resolve(realization, "test.mjs"), "process.exit(0);\n", "utf8"),
    ]);
    const authoredInput = await bundleAuthoredInput(authored);
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "implementation",
      variants: ["seedspec-implementation"],
      models: ["openai/subject-model-that-must-be-hidden"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.3.0",
      createdAt: "2026-07-24T12:00:00.000Z",
      maxSteps: 6,
      authoredInput,
    });
    const manifest = plan.envelopes[0]!.manifest;
    await materializeAuthoredInput(authoredInput, resolve(runDirectory, "input", "authored"));
    const report = {
      schemaVersion: 1 as const,
      verificationCommands: [{ id: "tests", argv: ["node", "test.mjs"] }],
      scenarios: [{
        id: "core",
        outcome: "pass" as const,
        commandIds: ["tests"],
        evidence: ["test.mjs"],
      }],
      limitations: [],
    };
    const verification = createImplementationVerification({
      schemaVersion: 1,
      runId: manifest.runId,
      createdAt: "2026-07-24T12:01:00.000Z",
      reportPath: "workspace/realization/acceptance-report.json",
      reportDigest: `sha256:${"a".repeat(64)}`,
      commands: [{
        id: "tests",
        argv: ["node", "test.mjs"],
        startedAt: "2026-07-24T12:00:30.000Z",
        finishedAt: "2026-07-24T12:00:31.000Z",
        sandbox: "unsandboxed",
        outcome: "pass",
        exitCode: 0,
        stdout: "",
        stderr: "",
      }],
      evidence: [],
      report,
      limitations: ["Fixture verification."],
    });
    await Promise.all([
      writeFile(resolve(runDirectory, "run-manifest.json"), JSON.stringify(manifest), "utf8"),
      writeFile(
        resolve(runDirectory, "implementation-verification.json"),
        JSON.stringify(verification),
        "utf8",
      ),
    ]);

    const built = await buildBlindTechnicalReviewBrief({
      runDirectory,
      runner: "codex",
      judgeModel: "openai/judge-model",
      reasoningEffort: "high",
      caseRoot: resolve("cases"),
      evaluationRepositoryRoot: resolve("."),
      evaluationCliEntry: resolve("packages/cli/dist/index.js"),
      outRoot: resolve(root, "opaque-views"),
    });
    const evidenceSource = await readFile(built.evidencePath, "utf8");
    expect(evidenceSource).not.toContain(manifest.runId);
    expect(evidenceSource).not.toContain("skill-guidance-secret");
    expect(evidenceSource).not.toContain("subject-model-that-must-be-hidden");
    expect(evidenceSource).not.toContain("run-with-visible-treatment-name");
    expect(evidenceSource).toContain("subject/realization/app.mjs");

    const draft = resolve(built.viewPath, "blind-technical-review-draft.json");
    await writeFile(draft, JSON.stringify({
      schemaVersion: 1,
      blindSubjectId: built.blindSubjectId,
      blindEvidenceId: built.blindEvidenceId,
      createdAt: "2026-07-24T12:02:00.000Z",
      evaluator: {
        id: "blind-technical-evaluator",
        version: "0.1.0",
        kind: "agent",
        model: {
          provider: "openai",
          modelId: "openai/judge-model",
          parameters: { additional: { reasoningEffort: "high" } },
        },
      },
      checks: [],
      quality: {
        rubricVersion: "0.1.0",
        dimensions: TECHNICAL_QUALITY_DIMENSIONS.map((dimension) => ({
          dimension,
          status: "not-applicable",
          confidence: 1,
          assessment: "Fixture does not attempt a substantive quality assessment.",
          evidence: [],
          findingIds: [],
        })),
        findings: [],
        readiness: "indeterminate",
        summary: "Fixture-only blind review.",
        limitations: ["No substantive assessment in this unit fixture."],
      },
      summary: "Fixture-only blind review.",
      limitations: ["No substantive assessment in this unit fixture."],
    }), "utf8");
    const finalized = await finalizeBlindTechnicalReviewFile({
      draft,
      evidence: built.evidencePath,
    });
    await writeFile(
      resolve(built.viewPath, "subject", "realization", "app.mjs"),
      "export const ready = false;\n",
      "utf8",
    );
    await expect(finalizeBlindTechnicalReviewFile({
      draft,
      evidence: built.evidencePath,
      out: resolve(built.viewPath, "tampered-review.json"),
    })).rejects.toThrow(/artifact changed after the view was created/);
    const unblinded = await unblindTechnicalReview({
      runDirectory,
      review: finalized.path,
      createdAt: "2026-07-24T12:03:00.000Z",
    });
    const attachment = JSON.parse(await readFile(unblinded.path, "utf8")) as {
      runId: string;
      review: { blindReviewId: string };
    };
    expect(attachment.runId).toBe(manifest.runId);
    expect(attachment.review.blindReviewId).toBe(finalized.review.blindReviewId);
  });
});
