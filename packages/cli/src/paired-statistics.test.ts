import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createEvaluationProfile, createSubjectRun } from "@seedspec/eval-core";

import { loadProfilesByRunId } from "./paired-statistics.js";

const temporaryDirectories: string[] = [];
const CASE_DIGEST = `sha256:${"a".repeat(64)}` as const;
const FILE_DIGEST = `sha256:${"b".repeat(64)}` as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "seedspec-paired-statistics-"));
  temporaryDirectories.push(directory);
  return directory;
}

function profile(runId: string) {
  return createEvaluationProfile({
    schemaVersion: 1,
    subject: {
      stage: "implementation",
      runId,
      variant: "seedspec-implementation",
      treatment: "skill-guidance",
      model: {
        requested: { provider: "openai", modelId: "openai/example", parameters: {} },
        selector: "example",
        status: "unverified",
      },
      case: {
        id: "paired-case",
        version: "1.0.0",
        digest: CASE_DIGEST,
      },
    },
    createdAt: "2026-07-25T12:00:00.000Z",
    evaluator: {
      id: "profile-evaluator",
      version: "0.2.0",
      kind: "deterministic",
    },
    decisions: [],
    obligations: [],
    structure: [],
    summary: "Paired-statistics fixture profile.",
    limitations: [],
  });
}

function subjectRun(runId: string, sourceRunId: string) {
  return createSubjectRun({
    schemaVersion: 2,
    runId,
    sourceRunId,
    runner: { id: "codex-cli", version: "codex-cli test" },
    requestedModel: "openai/example",
    modelSelector: "example",
    modelIdentityStatus: "unverified",
    reasoningEffort: "high",
    startedAt: "2026-07-25T12:00:00.000Z",
    finishedAt: "2026-07-25T12:01:00.000Z",
    status: "succeeded",
    exitCode: 0,
    usage: { capture: "unavailable" },
    events: {
      path: "subject-events.jsonl",
      digest: FILE_DIGEST,
      byteLength: 0,
      count: 0,
    },
    stderr: {
      path: "subject-stderr.log",
      digest: FILE_DIGEST,
      byteLength: 0,
    },
    finalMessage: {
      path: "subject-final.md",
      digest: FILE_DIGEST,
      byteLength: 0,
    },
    trace: {
      path: "trace.json",
      digest: FILE_DIGEST,
      byteLength: 0,
      traceId: `trace_${"c".repeat(64)}`,
    },
    limitations: [],
  });
}

describe("paired statistics profile bindings", () => {
  it("indexes a profile by both realized and source run IDs from its subject receipt", async () => {
    const directory = await temporaryDirectory();
    const realizedRunId = `run_${"d".repeat(64)}`;
    const sourceRunId = `run_${"e".repeat(64)}`;
    const evaluationProfile = profile(realizedRunId);
    await Promise.all([
      writeFile(
        resolve(directory, "evaluation-profile.json"),
        `${JSON.stringify(evaluationProfile, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        resolve(directory, "subject-run.json"),
        `${JSON.stringify(subjectRun(realizedRunId, sourceRunId), null, 2)}\n`,
        "utf8",
      ),
    ]);

    const profiles = await loadProfilesByRunId([
      resolve(directory, "evaluation-profile.json"),
    ]);

    expect(profiles.get(realizedRunId)?.profileId).toBe(evaluationProfile.profileId);
    expect(profiles.get(sourceRunId)?.profileId).toBe(evaluationProfile.profileId);
  });

  it("rejects a sibling subject receipt for a different realized run", async () => {
    const directory = await temporaryDirectory();
    const profileRunId = `run_${"f".repeat(64)}`;
    const receiptRunId = `run_${"1".repeat(64)}`;
    await Promise.all([
      writeFile(
        resolve(directory, "evaluation-profile.json"),
        `${JSON.stringify(profile(profileRunId), null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        resolve(directory, "subject-run.json"),
        `${JSON.stringify(subjectRun(receiptRunId, `run_${"2".repeat(64)}`), null, 2)}\n`,
        "utf8",
      ),
    ]);

    await expect(loadProfilesByRunId([
      resolve(directory, "evaluation-profile.json"),
    ])).rejects.toThrow(/subject receipt identifies/);
  });
});
