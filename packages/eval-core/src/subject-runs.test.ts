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
        cacheCreationInputTokens: 10,
        outputTokens: 20,
        reasoningOutputTokens: 5,
        totalTokens: 120,
        costUsd: 0.0123,
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
      captureTrace: {
        path: "capture-trace.json",
        traceId: `trace_${"2".repeat(64)}`,
        digest: `sha256:${"3".repeat(64)}`,
        byteLength: 750,
      },
      limitations: [],
    });

    expect(parseSubjectRun(run).subjectRunId).toMatch(/^subject_run_[a-f0-9]{64}$/);
    expect(run.usage.cachedInputTokens).toBe(80);
    expect(run.usage.cacheCreationInputTokens).toBe(10);
    expect(run.usage.costUsd).toBe(0.0123);
    expect(run.captureTrace?.path).toBe("capture-trace.json");
  });

  it("accepts captured Claude Code subject evidence", () => {
    const run = createSubjectRun({
      schemaVersion: 1,
      runId: `run_${"a".repeat(64)}`,
      runner: { id: "claude-code-cli", version: "2.0.64 (Claude Code)" },
      model: "anthropic/claude-sonnet-5",
      modelSelector: "claude-sonnet-5",
      reasoningEffort: "default",
      startedAt: "2026-07-22T12:00:00.000Z",
      finishedAt: "2026-07-22T12:01:00.000Z",
      status: "failed",
      exitCode: 1,
      usage: {
        capture: "provider-reported",
        inputTokens: 2,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 3_366,
        outputTokens: 4,
        totalTokens: 3_372,
        costUsd: 0.0126885,
      },
      events: {
        path: "subject-events.jsonl",
        digest: `sha256:${"c".repeat(64)}`,
        byteLength: 1_000,
        count: 3,
        threadId: "90f643e3-f734-4961-b4ec-79452d1a8a35",
      },
      stderr: {
        path: "subject-stderr.log",
        digest: `sha256:${"d".repeat(64)}`,
        byteLength: 0,
      },
      finalMessage: {
        path: "subject-final.md",
        digest: `sha256:${"e".repeat(64)}`,
        byteLength: 2,
      },
      limitations: ["The example intentionally has no finalized trace."],
    });

    expect(parseSubjectRun(run).runner.id).toBe("claude-code-cli");
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
