import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { afterEach, describe, expect, it } from "vitest";

import { createExperimentPlan } from "./plan.js";
import { buildDesktopManifest } from "./runner-brief.js";
import {
  answerDesktopAuthorQuestion,
  assertExternalRunnerDirectory,
  createDesktopControl,
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
      variants: ["source-only"],
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
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
  });
});
