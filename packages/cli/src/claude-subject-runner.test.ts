import { describe, expect, it } from "vitest";

import {
  claudeModelSelector,
  createClaudeCaptureTrace,
  parseClaudeCodeEvents,
  spawnClaudeProcessCaptured,
} from "./claude-subject-runner.js";

describe("Claude Code subject model selection", () => {
  it("translates an Anthropic gateway slug to the Claude Code selector", () => {
    expect(claudeModelSelector("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("rejects a model from another provider", () => {
    expect(() => claudeModelSelector("openai/gpt-5.6-sol")).toThrow(/Anthropic model slug/);
  });
});

describe("captured Claude Code subject events", () => {
  it("retains identity, final output, cache-aware usage, and exact cost", () => {
    const parsed = parseClaudeCodeEvents([
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "session-123",
        model: "claude-sonnet-5",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "private analysis", signature: "secret" },
            { type: "text", text: "Observable answer" },
          ],
        },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "Completed successfully.",
        session_id: "session-123",
        total_cost_usd: 0.0126885,
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 3_366,
          cache_read_input_tokens: 10,
          output_tokens: 4,
        },
      }),
      "",
    ].join("\n"));

    expect(parsed.eventCount).toBe(3);
    expect(parsed.sessionId).toBe("session-123");
    expect(parsed.model).toBe("claude-sonnet-5");
    expect(parsed.finalMessage).toBe("Completed successfully.");
    expect(parsed.usage).toEqual({
      capture: "provider-reported",
      inputTokens: 2,
      cachedInputTokens: 10,
      cacheCreationInputTokens: 3_366,
      outputTokens: 4,
      totalTokens: 3_382,
      costUsd: 0.0126885,
    });
    expect(parsed.sanitizedJsonl).toContain("reasoning-redacted");
    expect(parsed.sanitizedJsonl).not.toContain("private analysis");
    expect(parsed.sanitizedJsonl).not.toContain("secret");
    expect(parsed.providerLineNumbers).toEqual([1, 2, 3]);
    expect(parsed.limitations).toEqual([
      "Removed 1 non-observable reasoning block(s) from captured Claude Code events.",
    ]);
  });

  it("marks usage unavailable instead of estimating malformed events", () => {
    const parsed = parseClaudeCodeEvents([
      JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5" }),
      JSON.stringify({ type: "result", usage: { input_tokens: 10 } }),
      "not-json",
      "",
    ].join("\n"));

    expect(parsed.usage).toEqual({ capture: "unavailable" });
    expect(parsed.limitations).toHaveLength(2);
  });
});

describe("captured Claude Code process limits", () => {
  it("terminates a subject that exceeds its immutable duration limit", async () => {
    const result = await spawnClaudeProcessCaptured(
      process.execPath,
      ["-e", "setInterval(() => undefined, 1_000)"],
      process.cwd(),
      50,
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it("timestamps complete provider lines as the runner observes them", async () => {
    const result = await spawnClaudeProcessCaptured(
      process.execPath,
      [
        "-e",
        [
          "process.stdout.write(JSON.stringify({type:'system'}) + '\\n');",
          "setTimeout(() => process.stdout.write(JSON.stringify({type:'result'}) + '\\n'), 25);",
        ].join(""),
      ],
      process.cwd(),
      1_000,
    );

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.lineTimings).toHaveLength(2);
    expect(result.lineTimings[0]?.providerLine).toBe(1);
    expect(result.lineTimings[1]?.providerLine).toBe(2);
    expect(result.lineTimings[1]?.elapsedMs).toBeGreaterThanOrEqual(result.lineTimings[0]?.elapsedMs ?? 0);
    expect(Date.parse(result.lineTimings[0]?.observedAt ?? "")).not.toBeNaN();
  });

  it("creates a canonical capture trace with runner-observed tool duration", () => {
    const trace = createClaudeCaptureTrace({
      identity: {
        runId: `run_${"a".repeat(64)}`,
        sourceRunId: `run_${"b".repeat(64)}`,
        variant: "seedspec-implementation",
        runner: { id: "claude-code", kind: "agent", version: "0.1.0" },
        model: { provider: "anthropic", modelId: "anthropic/claude-sonnet-5", parameters: {} },
      },
      startedAt: "2026-07-24T12:00:00.000Z",
      finishedAt: "2026-07-24T12:30:00.000Z",
      status: "timed_out",
      exitCode: -1,
      events: [
        { type: "system", subtype: "init", model: "claude-sonnet-5" },
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: { command: "npm test" } }],
          },
        },
        {
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "tool-1", content: "all tests passed" }],
          },
        },
      ],
      providerLineNumbers: [1, 2, 3],
      lineTimings: [
        { providerLine: 1, observedAt: "2026-07-24T12:00:00.100Z", elapsedMs: 100 },
        { providerLine: 2, observedAt: "2026-07-24T12:00:01.000Z", elapsedMs: 1_000 },
        { providerLine: 3, observedAt: "2026-07-24T12:00:03.500Z", elapsedMs: 3_500 },
      ],
      usage: { capture: "unavailable" },
      limitations: ["Provider usage was unavailable."],
    });

    expect(trace.status).toBe("timed_out");
    expect(trace.capture.messages).toBe("digests");
    expect(trace.capture.toolCalls).toBe("names-only");
    expect(trace.capture.toolResults).toBe("digests");
    expect(trace.capture.timing).toBe("event");
    expect(trace.capture.usage).toBe("unavailable");
    expect(trace.events).toHaveLength(4);
    expect(trace.events[1]).toMatchObject({
      timestamp: "2026-07-24T12:00:01.000Z",
      kind: "tool-call",
      name: "Bash",
      data: { toolUseId: "tool-1", observedElapsedMs: 1_000 },
    });
    expect(trace.events[2]).toMatchObject({
      timestamp: "2026-07-24T12:00:03.500Z",
      kind: "tool-result",
      name: "Bash",
      data: { toolUseId: "tool-1", observedElapsedMs: 3_500, durationMs: 2_500 },
    });
    expect(trace.events[3]?.name).toBe("subject-timed-out");
    expect(trace.events[3]?.data).toEqual({
      exitCode: -1,
      capturedProviderEventCount: 3,
      providerEventsPath: "subject-events.jsonl",
    });
    expect(trace.limitations).toContain(
      "Event timestamps record when the runner observed each complete Claude JSONL line, not when the provider began or completed internal work.",
    );
  });
});
