import { describe, expect, it } from "vitest";

import { parseCodexEvaluatorEvents } from "./profile-runner.js";

describe("captured Codex profile evaluator events", () => {
  it("retains thread identity and provider-reported usage", () => {
    const parsed = parseCodexEvaluatorEvents([
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, reasoning_output_tokens: 5 },
      }),
      "",
    ].join("\n"));

    expect(parsed.threadId).toBe("thread-123");
    expect(parsed.eventCount).toBe(3);
    expect(parsed.usage).toEqual({
      capture: "provider-reported",
      inputTokens: 100,
      cachedInputTokens: 80,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      totalTokens: 120,
    });
  });

  it("marks usage unavailable instead of estimating malformed events", () => {
    const parsed = parseCodexEvaluatorEvents('{"type":"turn.completed","usage":{"input_tokens":10}}\nnot-json\n');
    expect(parsed.usage).toEqual({ capture: "unavailable" });
    expect(parsed.limitations).toHaveLength(3);
  });
});
