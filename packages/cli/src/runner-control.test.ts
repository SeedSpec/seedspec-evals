import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { afterEach, describe, expect, it } from "vitest";

import { createExperimentPlan } from "./plan.js";
import { buildDesktopManifest } from "./runner-brief.js";
import {
  answerDesktopAuthorQuestion,
  assertExternalRunnerDirectory,
  createDesktopControl,
  finalizeDesktopRunner,
  preflightDesktopRunner,
} from "./runner-control.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("desktop runner control boundary", () => {
  it("keeps answers outside the runner kit and detects later contamination", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      variants: ["markdown-authored"],
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 6,
    });
    const executionEnvelope = plan.envelopes[0]!;
    const desktopManifest = buildDesktopManifest(executionEnvelope, "codex");
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), "agent-eval-control-test-"));
    temporaryRoots.push(temporaryRoot);
    const runDirectory = resolve(temporaryRoot, "runner");
    const controlDirectory = resolve(temporaryRoot, "control");
    await mkdir(runDirectory);
    expect(() => assertExternalRunnerDirectory(resolve("runs/unsafe"), resolve("."))).toThrow(
      /cannot be created inside the evaluation repository/,
    );

    const sourceEnvelope = await createDesktopControl(executionEnvelope, desktopManifest, { controlDirectory });
    await Promise.all([
      writeFile(resolve(runDirectory, "source-envelope.json"), `${JSON.stringify(sourceEnvelope, null, 2)}\n`, "utf8"),
      writeFile(resolve(runDirectory, "run-manifest.json"), `${JSON.stringify(desktopManifest, null, 2)}\n`, "utf8"),
      writeFile(resolve(runDirectory, "handoff.md"), "Controlled authoring evaluation.\n", "utf8"),
    ]);

    const protectedAnswer = executionEnvelope.submission.config.simulatedAuthorResponses["due-date-policy"]!;
    expect(JSON.stringify(sourceEnvelope)).not.toContain(protectedAnswer);
    expect(sourceEnvelope.availableAuthorQuestionIds).toContain("due-date-policy");
    await expect(answerDesktopAuthorQuestion(
      resolve(runDirectory, "source-envelope.json"),
      "due-date-policy",
      { controlDirectory },
    )).resolves.toEqual({ answered: true, questionId: "due-date-policy", answer: protectedAnswer });

    const clean = await preflightDesktopRunner(runDirectory, resolve("."), {
      workingDirectory: runDirectory,
      controlDirectory,
    });
    expect(clean.ready).toBe(true);

    await writeFile(resolve(runDirectory, "accidental-leak.txt"), protectedAnswer, "utf8");
    const contaminated = await preflightDesktopRunner(runDirectory, resolve("."), {
      workingDirectory: runDirectory,
      controlDirectory,
    });
    expect(contaminated.ready).toBe(false);
    expect(contaminated.checks).toContainEqual(expect.objectContaining({
      id: "response-isolation",
      passed: false,
    }));

    await rm(resolve(runDirectory, "accidental-leak.txt"));
    await mkdir(resolve(runDirectory, "workspace"));
    await Promise.all([
      writeFile(resolve(runDirectory, "workspace", "instructions.md"), "Implementation instructions.\n", "utf8"),
      writeFile(resolve(runDirectory, "workspace", "report.md"), "Evidence report.\n", "utf8"),
      writeFile(resolve(runDirectory, "workspace", "trace-draft.json"), `${JSON.stringify({
        schemaVersion: 1,
        runId: desktopManifest.runId,
        sourceRunId: executionEnvelope.manifest.runId,
        variant: "markdown-authored",
        runner: desktopManifest.runner,
        model: desktopManifest.model,
        startedAt: "2026-07-22T12:00:00.000Z",
        finishedAt: "2026-07-22T12:00:01.000Z",
        status: "succeeded",
        capture: {
          messages: "partial",
          toolCalls: "full",
          toolResults: "digests",
          timing: "event",
          usage: "unavailable",
          artifacts: "paths-and-digests",
          reasoning: "not-collected",
        },
        events: [],
        limitations: ["Test fixture."],
        redactions: [],
      }, null, 2)}\n`, "utf8"),
    ]);
    const finalized = await finalizeDesktopRunner(runDirectory);
    expect(finalized.normalizedPaths).toEqual(["report.md", "trace-draft.json"]);
    await expect(readFile(resolve(runDirectory, "trace.json"), "utf8")).resolves.toContain(finalized.traceId);
    await expect(readFile(resolve(runDirectory, "workspace", "report.md"), "utf8")).rejects.toThrow();

    await writeFile(resolve(runDirectory, "workspace", "instructions.md"), protectedAnswer, "utf8");
    const completed = await preflightDesktopRunner(runDirectory, resolve("."), {
      workingDirectory: runDirectory,
      controlDirectory,
    });
    expect(completed.ready).toBe(false);
    expect(completed.checks).toContainEqual(expect.objectContaining({
      id: "clean-output",
      passed: false,
    }));
    const responseIsolation = completed.checks.find(({ id }) => id === "response-isolation");
    expect(responseIsolation?.passed).toBe(true);
    expect(responseIsolation?.message).toContain("legitimate authored output");
  });

  it("finalizes the case's declared deliverables without requiring a broker-specific instructions file", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.filter(({ case: evaluationCase }) => evaluationCase.id === "sparse-neighborhood-tool-lending"),
      stage: "authorship",
      variants: ["seedspec-minimal"],
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 6,
    });
    const envelope = plan.envelopes[0]!;
    const manifest = buildDesktopManifest(envelope, "codex");
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), "agent-eval-deliverables-test-"));
    temporaryRoots.push(temporaryRoot);
    const runDirectory = resolve(temporaryRoot, "runner");
    const controlDirectory = resolve(temporaryRoot, "control");
    await mkdir(resolve(runDirectory, "workspace"), { recursive: true });
    const source = await createDesktopControl(envelope, manifest, { controlDirectory });
    for (const deliverable of envelope.submission.config.deliverables.filter(({ required }) => required)) {
      if (deliverable.path === undefined) continue;
      const path = resolve(runDirectory, "workspace", deliverable.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `Fixture for ${deliverable.id}.\n`, "utf8");
    }
    await Promise.all([
      writeFile(resolve(runDirectory, "source-envelope.json"), JSON.stringify(source), "utf8"),
      writeFile(resolve(runDirectory, "run-manifest.json"), JSON.stringify(manifest), "utf8"),
      writeFile(resolve(runDirectory, "report.md"), "Evidence report.\n", "utf8"),
      writeFile(resolve(runDirectory, "trace-draft.json"), JSON.stringify({
        schemaVersion: 1,
        runId: manifest.runId,
        sourceRunId: envelope.manifest.runId,
        variant: manifest.variant,
        runner: manifest.runner,
        model: manifest.model,
        startedAt: "2026-07-22T12:00:00.000Z",
        finishedAt: "2026-07-22T12:00:01.000Z",
        status: "succeeded",
        capture: {
          messages: "partial", toolCalls: "full", toolResults: "digests", timing: "event",
          usage: "unavailable", artifacts: "paths-and-digests", reasoning: "not-collected",
        },
        events: [],
        limitations: ["Test fixture."],
        redactions: [],
      }), "utf8"),
    ]);

    await expect(finalizeDesktopRunner(runDirectory)).resolves.toHaveProperty("traceId");
    await expect(readFile(resolve(runDirectory, "workspace", "instructions.md"), "utf8")).rejects.toThrow();
  });
});
