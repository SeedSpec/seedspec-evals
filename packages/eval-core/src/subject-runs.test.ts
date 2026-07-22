import { describe, expect, it } from "vitest";

import { createSubjectRun, parseSubjectRun } from "./subject-runs.js";

describe("captured subject runs", () => {
  it("binds provider usage and a finalized trace into a content-addressed record", () => {
    const run = createSubjectRun({
      schemaVersion: 1,
      runId: `run_${"a".repeat(64)}`,
      sourceRunId: `run_${"b".repeat(64)}`,
      runner: { id: "codex-cli", version: "codex-cli 1.2.3" },
      model: "openai/gpt-5.6-sol",
      modelSelector: "gpt-5.6-sol",
      reasoningEffort: "high",
      startedAt: "2026-07-22T12:00:00.000Z",
      finishedAt: "2026-07-22T12:01:00.000Z",
      status: "succeeded",
      exitCode: 0,
      usage: {
        capture: "provider-reported",
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 20,
        reasoningOutputTokens: 5,
        totalTokens: 120,
      },
      events: {
        path: "subject-events.jsonl",
        digest: `sha256:${"c".repeat(64)}`,
        byteLength: 1000,
        count: 12,
        threadId: "thread-123",
      },
      stderr: {
        path: "subject-stderr.log",
        digest: `sha256:${"d".repeat(64)}`,
        byteLength: 0,
      },
      finalMessage: {
        path: "subject-final.md",
        digest: `sha256:${"e".repeat(64)}`,
        byteLength: 50,
      },
      trace: {
        path: "trace.json",
        traceId: `trace_${"f".repeat(64)}`,
        digest: `sha256:${"1".repeat(64)}`,
        byteLength: 500,
      },
      limitations: [],
    });

    expect(parseSubjectRun(run).subjectRunId).toMatch(/^subject_run_[a-f0-9]{64}$/);
    expect(run.usage.cachedInputTokens).toBe(80);
  });

  it("rejects a successful record without a finalized trace", () => {
    expect(() => createSubjectRun({
      schemaVersion: 1,
      runId: `run_${"a".repeat(64)}`,
      runner: { id: "codex-cli", version: "codex-cli 1.2.3" },
      model: "openai/gpt-5.6-sol",
      modelSelector: "gpt-5.6-sol",
      reasoningEffort: "high",
      startedAt: "2026-07-22T12:00:00.000Z",
      finishedAt: "2026-07-22T12:01:00.000Z",
      status: "succeeded",
      exitCode: 0,
      usage: { capture: "unavailable" },
      events: { path: "subject-events.jsonl", digest: `sha256:${"c".repeat(64)}`, byteLength: 0, count: 0 },
      stderr: { path: "subject-stderr.log", digest: `sha256:${"d".repeat(64)}`, byteLength: 0 },
      finalMessage: { path: "subject-final.md", digest: `sha256:${"e".repeat(64)}`, byteLength: 0 },
      limitations: [],
    })).toThrow(/finalized trace/);
  });
});
