import { describe, expect, it } from "vitest";

import {
  createCodexCaptureTrace,
  parseCodexSubjectEvents,
  spawnCodexProcessCaptured,
} from "./subject-runner.js";

describe("captured Codex subject events", () => {
  it("retains provider event identity, line numbers, and cache-aware usage", () => {
    const parsed = parseCodexSubjectEvents([
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 80,
          output_tokens: 20,
          reasoning_output_tokens: 5,
        },
      }),
      "",
    ].join("\n"));

    expect(parsed.eventCount).toBe(3);
    expect(parsed.threadId).toBe("thread-123");
    expect(parsed.providerLineNumbers).toEqual([1, 2, 3]);
    expect(parsed.usage).toEqual({
      capture: "provider-reported",
      inputTokens: 100,
      cachedInputTokens: 80,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      totalTokens: 120,
    });
  });

  it("creates a canonical capture trace with runner-observed item duration", () => {
    const trace = createCodexCaptureTrace({
      identity: {
        runId: `run_${"a".repeat(64)}`,
        sourceRunId: `run_${"b".repeat(64)}`,
        variant: "seedspec-implementation",
        runner: { id: "codex-desktop", kind: "agent", version: "0.2.0" },
        model: { provider: "openai", modelId: "openai/gpt-5.6-sol", parameters: {} },
      },
      startedAt: "2026-07-24T12:00:00.000Z",
      finishedAt: "2026-07-24T12:30:00.000Z",
      status: "succeeded",
      exitCode: 0,
      events: [
        { type: "thread.started", thread_id: "thread-123" },
        { type: "turn.started" },
        {
          type: "item.started",
          item: { id: "item-1", type: "command_execution", command: "npm test", status: "in_progress" },
        },
        {
          type: "item.completed",
          item: {
            id: "item-1",
            type: "command_execution",
            command: "npm test",
            aggregated_output: "all tests passed",
            exit_code: 0,
            status: "completed",
          },
        },
        {
          type: "item.completed",
          item: { id: "item-2", type: "agent_message", text: "Completed successfully." },
        },
        { type: "turn.completed" },
      ],
      providerLineNumbers: [1, 2, 3, 4, 5, 6],
      lineTimings: [
        { providerLine: 1, observedAt: "2026-07-24T12:00:00.100Z", elapsedMs: 100 },
        { providerLine: 2, observedAt: "2026-07-24T12:00:00.200Z", elapsedMs: 200 },
        { providerLine: 3, observedAt: "2026-07-24T12:00:01.000Z", elapsedMs: 1_000 },
        { providerLine: 4, observedAt: "2026-07-24T12:00:03.500Z", elapsedMs: 3_500 },
        { providerLine: 5, observedAt: "2026-07-24T12:00:04.000Z", elapsedMs: 4_000 },
        { providerLine: 6, observedAt: "2026-07-24T12:00:04.100Z", elapsedMs: 4_100 },
      ],
      usage: {
        capture: "provider-reported",
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 20,
        reasoningOutputTokens: 5,
        totalTokens: 120,
      },
      limitations: [],
    });

    expect(trace.capture.timing).toBe("event");
    expect(trace.capture.toolCalls).toBe("names-only");
    expect(trace.events).toHaveLength(8);
    expect(trace.events[2]).toMatchObject({
      timestamp: "2026-07-24T12:00:01.000Z",
      kind: "tool-call",
      name: "command_execution",
      data: { itemId: "item-1", observedElapsedMs: 1_000 },
    });
    expect(trace.events[3]).toMatchObject({
      timestamp: "2026-07-24T12:00:03.500Z",
      kind: "tool-result",
      name: "command_execution",
      data: {
        itemId: "item-1",
        observedElapsedMs: 3_500,
        durationMs: 2_500,
        durationBasis: "runner-observed-event-interval",
      },
    });
    expect(trace.events[4]).toMatchObject({
      kind: "message",
      name: "assistant-message",
    });
    expect(trace.events[7]?.name).toBe("subject-succeeded");
  });

  it("enforces the immutable duration limit while retaining line timing", async () => {
    const result = await spawnCodexProcessCaptured(
      process.execPath,
      [
        "-e",
        [
          "process.stdout.write(JSON.stringify({type:'turn.started'}) + '\\n');",
          "setInterval(() => undefined, 1_000);",
        ].join(""),
      ],
      process.cwd(),
      50,
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.lineTimings).toHaveLength(1);
    expect(result.lineTimings[0]?.providerLine).toBe(1);
  });
});
