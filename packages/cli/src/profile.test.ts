import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRunProfileBrief,
  finalizeDecisionLedgerFile,
  finalizeEvaluationProfileFile,
  formatEvaluationProfile,
  validateEvaluationProfileFile,
  validateDecisionLedgerFile,
} from "./profile.js";

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
    await writeFile(resolve(directory, "run-manifest.json"), JSON.stringify({
      runId: `run_${"b".repeat(64)}`,
      target: { stage: "implementation" },
    }), "utf8");

    const result = await buildRunProfileBrief({
      runDirectory: directory,
      runner: "codex",
      judgeModel: "openai/example",
      evaluationRepositoryRoot: "/evaluation-repository",
      evaluationCliEntry: "/evaluation-repository/packages/cli/dist/index.js",
    });

    expect(result.brief).toContain("evaluate-seedspec-profile/SKILL.md");
    expect(result.brief).toContain("review-seedspec-technical-quality/SKILL.md");
    expect(result.brief).toContain("Do not emit a normalized score");
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
});
