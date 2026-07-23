import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { createProfileEvidenceEnvelope, createTrace, sha256Hex } from "@seedspec/eval-core";

import {
  buildRunProfileBrief,
  finalizeDecisionLedgerFile,
  finalizeEvaluationProfileFile,
  formatEvaluationProfile,
  validateEvaluationProfileFile,
  validateDecisionLedgerFile,
} from "./profile.js";
import { createExperimentPlan } from "./plan.js";
import { evaluateRunDirectoryDeterministically } from "./evaluate.js";
import { verifyImplementationRun } from "./implementation-verification.js";
import { bundleAuthoredInput, materializeAuthoredInput } from "./authored-input.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "seedspec-profile-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("evaluation profile CLI helpers", () => {
  it("finalizes, validates, and formats a profile body", async () => {
    const directory = await temporaryDirectory();
    const draft = resolve(directory, "evaluation-profile-draft.json");
    await writeFile(draft, JSON.stringify({
      schemaVersion: 1,
      subject: {
        stage: "authorship",
        package: { digest: `sha256:${"a".repeat(64)}` },
      },
      createdAt: "2026-07-22T12:00:00.000Z",
      evaluator: { id: "profile-evaluator", version: "0.1.0", kind: "deterministic" },
      decisions: [],
      obligations: [],
      structure: [],
      summary: "The sparse package exposes no classifiable decisions yet.",
      limitations: ["No implementation trace exists."],
    }), "utf8");

    const finalized = await finalizeEvaluationProfileFile({ draft });
    const parsed = await validateEvaluationProfileFile(finalized.path);

    expect(parsed.profileId).toBe(finalized.profile.profileId);
    expect(formatEvaluationProfile(parsed)).toContain("This profile is descriptive");
    expect(JSON.parse(await readFile(finalized.path, "utf8"))).toHaveProperty("profileId");
  });

  it("creates a run handoff that requires both profile skills for implementation", async () => {
    const directory = await temporaryDirectory();
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "authorship",
      variants: ["raw-source"],
      models: ["openai/example"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.4",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 6,
    });
    const envelope = plan.envelopes[0]!;
    await import("node:fs/promises").then(({ mkdir }) => mkdir(resolve(directory, "workspace"), { recursive: true }));
    await Promise.all([
      writeFile(resolve(directory, "run-manifest.json"), JSON.stringify(envelope.manifest), "utf8"),
      writeFile(resolve(directory, "source-envelope.json"), JSON.stringify({
        untrustedMaterial: envelope.submission.config.untrustedMaterial,
        availableAuthorQuestionIds: [],
      }), "utf8"),
      writeFile(resolve(directory, "workspace/instructions.md"), "# Tool lending\n", "utf8"),
      writeFile(resolve(directory, "report.md"), "Run completed.\n", "utf8"),
      writeFile(resolve(directory, "trace.json"), JSON.stringify(createTrace({
        schemaVersion: 1,
        runId: envelope.manifest.runId,
        variant: envelope.manifest.variant,
        runner: envelope.manifest.runner,
        model: {
          provider: envelope.manifest.model.provider,
          modelId: envelope.manifest.model.modelId,
          parameters: {},
        },
        startedAt: "2026-07-22T12:00:00.000Z",
        finishedAt: "2026-07-22T12:00:00.000Z",
        status: "succeeded",
        capture: {
          messages: "unavailable",
          toolCalls: "unavailable",
          toolResults: "unavailable",
          timing: "run-only",
          usage: "unavailable",
          artifacts: "paths-and-digests",
          reasoning: "not-collected",
        },
        events: [],
        limitations: ["Fixture trace."],
        redactions: [],
      })), "utf8"),
    ]);
    await evaluateRunDirectoryDeterministically({
      runDirectory: directory,
      caseRoot: resolve("cases"),
      seedSpecCli: resolve("../seedspec/packages/cli/bin/seedspec.js"),
      createdAt: "2026-07-22T12:00:00.000Z",
    });

    const result = await buildRunProfileBrief({
      runDirectory: directory,
      runner: "codex",
      judgeModel: "openai/example",
      reasoningEffort: "high",
      evaluationRepositoryRoot: resolve("."),
      evaluationCliEntry: resolve("packages/cli/dist/index.js"),
      caseRoot: resolve("cases"),
      seedSpecCli: resolve("../seedspec/packages/cli/bin/seedspec.js"),
    });

    expect(result.brief).toContain("evaluate-seedspec-profile/SKILL.md");
    expect(result.brief).not.toContain("review-seedspec-technical-quality/SKILL.md");
    expect(result.brief).toContain("--evidence");
    expect(result.brief).toContain("reasoning effort `high`");
    expect(result.brief).toContain("Do not emit a normalized score");
    expect(JSON.parse(await readFile(result.evidencePath, "utf8"))).toHaveProperty("evidenceId", result.evidenceId);
  });

  it("finalizes and validates an observable decision ledger", async () => {
    const directory = await temporaryDirectory();
    const draft = resolve(directory, "decision-ledger-draft.json");
    await writeFile(draft, JSON.stringify({
      schemaVersion: 1,
      runId: `run_${"c".repeat(64)}`,
      createdAt: "2026-07-22T12:00:00.000Z",
      entries: [],
      limitations: ["No consequential decisions were recorded in this fixture."],
    }), "utf8");

    const finalized = await finalizeDecisionLedgerFile({ draft });
    const parsed = await validateDecisionLedgerFile(finalized.path);
    expect(parsed.ledgerId).toBe(finalized.ledger.ledgerId);
    expect(parsed.entries).toHaveLength(0);
  });

  it("profiles an implementation against the transported authored package rather than its output workspace", async () => {
    const root = await temporaryDirectory();
    const authoredDirectory = resolve(root, "authored");
    const runDirectory = resolve(root, "implementation-run");
    await Promise.all([
      mkdir(resolve(authoredDirectory, "definition"), { recursive: true }),
      mkdir(resolve(runDirectory, "workspace", "realization"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(resolve(authoredDirectory, "seedspec.yaml"), "seedspec: 0.1\n", "utf8"),
      writeFile(resolve(authoredDirectory, "definition", "application.md"), "# Authored intent\n", "utf8"),
    ]);
    const authoredInput = await bundleAuthoredInput(authoredDirectory);
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "implementation",
      variants: ["seedspec-implementation"],
      models: ["openai/example"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.4",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 6,
      authoredInput,
    });
    const envelope = plan.envelopes[0]!;
    await materializeAuthoredInput(authoredInput, resolve(runDirectory, "input", "authored"));
    await Promise.all([
      writeFile(resolve(runDirectory, "run-manifest.json"), JSON.stringify(envelope.manifest), "utf8"),
      writeFile(resolve(runDirectory, "source-envelope.json"), JSON.stringify({
        untrustedMaterial: envelope.submission.config.untrustedMaterial,
        availableAuthorQuestionIds: [],
      }), "utf8"),
      writeFile(resolve(runDirectory, "workspace", "realization", "app.txt"), "Working realization.\n", "utf8"),
      writeFile(resolve(runDirectory, "workspace", "realization", "verification.test.js"), "process.exit(0);\n", "utf8"),
      writeFile(resolve(runDirectory, "workspace", "realization", "acceptance-report.json"), JSON.stringify({
        schemaVersion: 1,
        verificationCommands: [{ id: "test", argv: ["node", "verification.test.js"] }],
        scenarios: Array.from({ length: 8 }, (_, index) => ({
          id: index === 0 ? "concurrent-reservation" : `scenario-${String(index + 1)}`,
          outcome: "pass",
          commandIds: ["test"],
          evidence: ["verification.test.js"],
          ...(index === 0 ? { criterion: "An undeclared subject annotation." } : {}),
        })),
        accessibility: {
          viewportWidth: 360,
          keyboardTasks: Array.from({ length: 4 }, (_, index) => ({
            id: `keyboard-task-${String(index + 1)}`,
            outcome: "pass",
            commandIds: ["test"],
            evidence: ["verification.test.js"],
          })),
        },
        limitations: [],
      }), "utf8"),
      writeFile(resolve(runDirectory, "report.md"), "Implementation evidence.\n", "utf8"),
      writeFile(resolve(runDirectory, "trace.json"), JSON.stringify(createTrace({
        schemaVersion: 1,
        runId: envelope.manifest.runId,
        variant: envelope.manifest.variant,
        runner: envelope.manifest.runner,
        model: { provider: "openai", modelId: "openai/example", parameters: {} },
        startedAt: "2026-07-22T12:00:00.000Z",
        finishedAt: "2026-07-22T12:00:01.000Z",
        status: "succeeded",
        capture: {
          messages: "partial", toolCalls: "names-only", toolResults: "digests", timing: "run-only",
          usage: "unavailable", artifacts: "paths-and-digests", reasoning: "not-collected",
        },
        events: [], limitations: ["Fixture trace."], redactions: [],
      })), "utf8"),
    ]);
    const verificationResult = await verifyImplementationRun({
      runDirectory,
      createdAt: "2026-07-22T12:00:01.500Z",
      allowUnsandboxed: process.platform !== "darwin",
    });
    const originalReport = await readFile(
      resolve(runDirectory, "workspace", "realization", "acceptance-report.json"),
      "utf8",
    );
    expect(verificationResult.verification.reportDigest).toBe(`sha256:${sha256Hex(originalReport)}`);
    expect(verificationResult.verification.reportConformance).toEqual({
      outcome: "normalized-extra-fields",
      diagnostics: [{ path: "$.scenarios[0]", keys: ["criterion"] }],
    });
    expect(verificationResult.verification.report.scenarios[0]).not.toHaveProperty("criterion");
    await evaluateRunDirectoryDeterministically({
      runDirectory,
      caseRoot: resolve("cases"),
      seedSpecCli: resolve("unused-seedspec-cli.js"),
      createdAt: "2026-07-22T12:00:02.000Z",
    });
    const fakeSeedSpecCli = resolve(root, "fake-seedspec-cli.mjs");
    await writeFile(fakeSeedSpecCli, `process.stdout.write(JSON.stringify({ id: "fixture.package", version: "1.0.0", kind: "application", digest: "sha256:${"a".repeat(64)}" }));\n`, "utf8");

    const result = await buildRunProfileBrief({
      runDirectory,
      runner: "codex",
      judgeModel: "openai/example-judge",
      reasoningEffort: "high",
      evaluationRepositoryRoot: resolve("."),
      evaluationCliEntry: resolve("packages/cli/dist/index.js"),
      caseRoot: resolve("cases"),
      seedSpecCli: fakeSeedSpecCli,
    });
    const evidence = JSON.parse(await readFile(result.evidencePath, "utf8")) as {
      subject: { package?: { path?: string } };
      artifacts: Array<{ path: string }>;
    };
    expect(evidence.subject.package?.path).toBe(resolve(runDirectory, "input", "authored"));
    expect(evidence.artifacts.map(({ path }) => path)).toContain("input/authored/seedspec.yaml");
    expect(evidence.artifacts.map(({ path }) => path)).toContain("workspace/realization/app.txt");
    expect(evidence).toHaveProperty("evaluatorGuidance");
    expect(result.brief).toContain(resolve(runDirectory, "evaluator-guidance/review-seedspec-technical-quality/SKILL.md"));
  });

  it("binds a run profile to the exact subject, evaluator request, and comparison axes", async () => {
    const directory = await temporaryDirectory();
    const digest = `sha256:${"d".repeat(64)}` as const;
    const subject = {
      stage: "authorship" as const,
      runId: `run_${"e".repeat(64)}`,
      variant: "raw-source" as const,
      case: { id: "axis-case", version: "1.0.0", digest },
    };
    const evidence = createProfileEvidenceEnvelope({
      schemaVersion: 1,
      profileSchemaVersion: 1,
      createdAt: "2026-07-22T12:00:00.000Z",
      subject,
      evaluatorRequest: { runner: "codex", model: "openai/example", reasoningEffort: "high" },
      comparisonAxes: {
        decisions: [{ id: "authority-axis", stages: ["authorship"], title: "Authority", description: "Who selects the authority.", materiality: "material" }],
        obligations: [{ id: "behavior-axis", stages: ["authorship"], kind: "behavior", description: "Required behavior.", importance: "critical" }],
      },
      technicalExpectations: [],
      adaptationChallenges: [],
      source: { path: "source-envelope.json", untrustedMaterial: "{}", availableAuthorQuestionIds: [] },
      artifacts: [{ artifactId: `artifact_${"f".repeat(64)}`, path: "instructions.md", kind: "authored-instructions", mediaType: "text/markdown", byteLength: 1, digest }],
      trace: {
        path: "trace.json",
        startedAt: "2026-07-22T12:00:00.000Z",
        finishedAt: "2026-07-22T12:00:01.000Z",
        status: "succeeded",
        capture: {},
        relevantEvents: [],
        limitations: [],
      },
      deterministic: { path: "deterministic-scorecard.json", summary: {}, checks: [] },
      reportPath: "report.md",
      instructions: ["Cover every comparison axis exactly once."],
    });
    const body = {
      schemaVersion: 1 as const,
      subject,
      createdAt: "2026-07-22T12:00:02.000Z",
      evaluator: {
        id: "profile-evaluator",
        version: "0.1.0",
        kind: "agent" as const,
        model: {
          provider: "openai",
          modelId: "openai/example",
          parameters: { additional: { reasoningEffort: "high" } },
        },
      },
      decisions: [{
        id: "authority",
        caseAxisId: "authority-axis",
        domain: "authorization",
        title: "Authority",
        description: "Who selects the authority.",
        materiality: { level: "material" as const, basis: "evaluator-assessed" as const, rationale: "It changes access." },
        expectedLatitude: "unresolved" as const,
        alternatives: [],
        provenance: { proposedBy: [], selectedBy: [], constrainedBy: [], implementedBy: [] },
        disclosure: "explicit" as const,
        alignment: "not-observed" as const,
        confidence: 0.9,
        assessment: "Unresolved.",
        evidence: [{ path: "instructions.md", note: "Authority statement" }],
      }],
      obligations: [{
        id: "behavior",
        caseAxisId: "behavior-axis",
        kind: "behavior" as const,
        description: "Required behavior.",
        importance: "critical" as const,
        source: [{ path: "instructions.md", note: "Behavior statement" }],
        plannedEvidence: [],
        observedEvidence: [],
        coverage: "partial" as const,
        distinguishing: "no" as const,
        assessment: "No negative case.",
        confidence: 0.8,
      }],
      structure: [],
      summary: "Evidence-bound fixture.",
      limitations: [],
    };
    const evidencePath = resolve(directory, "profile-evidence.json");
    const draftPath = resolve(directory, "evaluation-profile-draft.json");
    await Promise.all([
      writeFile(evidencePath, JSON.stringify(evidence), "utf8"),
      writeFile(draftPath, JSON.stringify(body), "utf8"),
    ]);

    await expect(finalizeEvaluationProfileFile({ draft: draftPath, evidence: evidencePath })).resolves.toHaveProperty("profile.profileId");
    await writeFile(draftPath, JSON.stringify({ ...body, obligations: [] }), "utf8");
    await expect(finalizeEvaluationProfileFile({ draft: draftPath, evidence: evidencePath })).rejects.toThrow(/missing obligation case axes/);
  });
});
