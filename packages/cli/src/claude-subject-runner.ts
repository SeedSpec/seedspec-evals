import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RunManifestSchema,
  createTrace,
  createSubjectRun,
  parseTrace,
  type Trace,
  type TraceBody,
  type SubjectRun,
} from "@seedspec/eval-core";

import {
  spawnJsonlProcessCaptured,
  type ObservedLineTiming,
} from "./jsonl-capture.js";
import { preflightDesktopRunner } from "./runner-control.js";

const CLAUDE_TOOLS = "Bash,Read,Write,Edit,Glob,Grep";

type ClaudeUsage =
  | { capture: "unavailable" }
  | {
      capture: "provider-reported";
      inputTokens: number;
      cachedInputTokens: number;
      cacheCreationInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd?: number;
    };

export type ClaudeLineTiming = ObservedLineTiming;

export async function runClaudeSubject(options: {
  runDirectory: string;
  evaluationRepositoryRoot: string;
  claudeExecutable: string;
}): Promise<{ run: SubjectRun; path: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  if (manifest.runner.id !== "claude-code") {
    throw new Error(`Captured Claude Code execution requires a claude-code runner kit, not ${manifest.runner.id}.`);
  }
  const preflight = await preflightDesktopRunner(runDirectory, options.evaluationRepositoryRoot, {
    workingDirectory: runDirectory,
  });
  if (!preflight.ready) {
    const failures = preflight.checks.filter(({ passed }) => !passed).map(({ id, message }) => `${id}: ${message}`);
    throw new Error(`Subject model execution was not started because runner preflight failed: ${failures.join("; ")}`);
  }

  const eventsPath = resolve(runDirectory, "subject-events.jsonl");
  const stderrPath = resolve(runDirectory, "subject-stderr.log");
  const finalMessagePath = resolve(runDirectory, "subject-final.md");
  const runPath = resolve(runDirectory, "subject-run.json");
  const tracePath = resolve(runDirectory, "trace.json");
  const captureTracePath = resolve(runDirectory, "capture-trace.json");
  const version = execFileSync(options.claudeExecutable, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
  const modelSelector = claudeModelSelector(manifest.model.modelId);
  const startedAt = new Date().toISOString();
  const prompt = [
    "Read handoff.md completely and execute it.",
    "Begin with node runner-control.mjs preflight and continue only if it reports READY.",
    "Complete the evaluated work, required report and observable trace, then finalize the trace exactly as instructed.",
  ].join(" ");
  const args = [
    "--print",
    prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--model", modelSelector,
    "--tools", CLAUDE_TOOLS,
    "--allowedTools", CLAUDE_TOOLS,
    "--permission-mode", "dontAsk",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--mcp-config", "{\"mcpServers\":{}}",
    "--no-session-persistence",
    "--disable-slash-commands",
  ];
  const execution = await spawnClaudeProcessCaptured(
    options.claudeExecutable,
    args,
    runDirectory,
    manifest.limits.maxDurationMs,
  );
  const finishedAt = new Date().toISOString();
  const parsedEvents = parseClaudeCodeEvents(execution.stdout.toString("utf8"));
  const events = Buffer.from(parsedEvents.sanitizedJsonl, "utf8");
  const finalMessage = Buffer.from(parsedEvents.finalMessage, "utf8");
  const limitations = [...parsedEvents.limitations];
  if (execution.timedOut) {
    limitations.push(`Claude Code was terminated after reaching the ${String(manifest.limits.maxDurationMs)} ms run-duration limit.`);
  }
  const modelMatched = parsedEvents.model === modelSelector;
  if (!modelMatched) {
    limitations.push(
      parsedEvents.model === undefined
        ? `Claude Code did not expose the serving model; requested selector ${modelSelector} could not be verified.`
        : `Claude Code reported serving model ${parsedEvents.model}, which does not match requested selector ${modelSelector}.`,
    );
  }
  await Promise.all([
    writeFile(eventsPath, events),
    writeFile(stderrPath, execution.stderr),
    writeFile(finalMessagePath, finalMessage),
  ]);

  let trace:
    | { traceId: string; path: string; digest: `sha256:${string}`; byteLength: number }
    | undefined;
  let subjectFinalizedTrace = false;
  try {
    const traceBytes = await readFile(tracePath);
    const parsedTrace = parseTrace(JSON.parse(traceBytes.toString("utf8")) as unknown);
    if (parsedTrace.runId !== manifest.runId) throw new Error("Finalized trace does not match the subject run ID.");
    trace = {
      traceId: parsedTrace.traceId,
      path: "trace.json",
      digest: digest(traceBytes),
      byteLength: traceBytes.byteLength,
    };
    subjectFinalizedTrace = true;
  } catch (error) {
    if (await fileExists(tracePath)) {
      const invalidTraceBytes = await readFile(tracePath);
      const invalidTracePath = `subject-trace.invalid-${digest(invalidTraceBytes).slice("sha256:".length, 19)}.json`;
      await rename(tracePath, resolve(runDirectory, invalidTracePath));
      limitations.push(
        `The invalid subject trace was preserved as ${invalidTracePath}: ${errorMessage(error)}`,
      );
    }
  }
  const subjectSucceeded =
    execution.exitCode === 0 && !execution.timedOut && modelMatched && subjectFinalizedTrace;
  const captureTrace = createClaudeCaptureTrace({
    identity: {
      runId: manifest.runId,
      ...(typeof manifest.configuration?.["sourceRunId"] === "string"
        ? { sourceRunId: manifest.configuration["sourceRunId"] }
        : {}),
      variant: manifest.variant,
      runner: manifest.runner,
      model: {
        provider: manifest.model.provider,
        modelId: manifest.model.modelId,
        parameters: JSON.parse(JSON.stringify(manifest.model.parameters)) as TraceBody["model"]["parameters"],
      },
    },
    startedAt,
    finishedAt,
    status: subjectSucceeded ? "succeeded" : execution.timedOut ? "timed_out" : "failed",
    exitCode: execution.exitCode,
    events: parsedEvents.sanitizedEvents,
    providerLineNumbers: parsedEvents.providerLineNumbers,
    lineTimings: execution.lineTimings,
    usage: parsedEvents.usage,
    limitations,
  });
  const captureTraceBytes = Buffer.from(`${JSON.stringify(captureTrace, null, 2)}\n`, "utf8");
  await writeFile(captureTracePath, captureTraceBytes, { flag: "wx" });
  const captureTraceReference = {
    traceId: captureTrace.traceId,
    path: "capture-trace.json",
    digest: digest(captureTraceBytes),
    byteLength: captureTraceBytes.byteLength,
  };
  if (!subjectFinalizedTrace) {
    await writeFile(tracePath, captureTraceBytes, { flag: "wx" });
    trace = {
      ...captureTraceReference,
      path: "trace.json",
    };
    limitations.push(
      "The subject did not finalize a trace; trace.json contains the canonical runner-observed capture trace and the run remains failed.",
    );
  }
  const run = createSubjectRun({
    schemaVersion: 1,
    runId: manifest.runId,
    ...(typeof manifest.configuration?.["sourceRunId"] === "string"
      ? { sourceRunId: manifest.configuration["sourceRunId"] }
      : {}),
    runner: { id: "claude-code-cli", version },
    model: manifest.model.modelId,
    modelSelector,
    reasoningEffort: "high",
    startedAt,
    finishedAt,
    status: subjectSucceeded ? "succeeded" : "failed",
    exitCode: execution.exitCode,
    usage: parsedEvents.usage,
    events: {
      path: "subject-events.jsonl",
      digest: digest(events),
      byteLength: events.byteLength,
      count: parsedEvents.eventCount,
      ...(parsedEvents.sessionId === undefined ? {} : { threadId: parsedEvents.sessionId }),
    },
    stderr: {
      path: "subject-stderr.log",
      digest: digest(execution.stderr),
      byteLength: execution.stderr.byteLength,
    },
    finalMessage: {
      path: "subject-final.md",
      digest: digest(finalMessage),
      byteLength: finalMessage.byteLength,
    },
    ...(trace === undefined ? {} : { trace }),
    captureTrace: captureTraceReference,
    limitations,
  });
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { run, path: runPath };
}

export function claudeModelSelector(model: string): string {
  if (!model.startsWith("anthropic/")) {
    throw new Error(`Claude Code requires an Anthropic model slug, received ${model}.`);
  }
  return model.slice("anthropic/".length);
}

export function createClaudeCaptureTrace(options: {
  identity: Pick<TraceBody, "runId" | "sourceRunId" | "variant" | "runner" | "model">;
  startedAt: string;
  finishedAt: string;
  status: "succeeded" | "failed" | "timed_out";
  exitCode: number;
  events: readonly Record<string, unknown>[];
  providerLineNumbers: readonly number[];
  lineTimings: readonly ClaudeLineTiming[];
  usage: ClaudeUsage;
  limitations: readonly string[];
}): Trace {
  const timingByLine = new Map(options.lineTimings.map((timing) => [timing.providerLine, timing]));
  const events = createRunnerObservedTraceEvents(
    options.events,
    options.providerLineNumbers,
    timingByLine,
    options.finishedAt,
    options.exitCode,
    options.status,
    options.usage,
  );
  const timingCoverage = options.providerLineNumbers.filter((line) => timingByLine.has(line)).length;
  return createTrace({
    schemaVersion: 1,
    ...options.identity,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
    status: options.status,
    capture: {
      messages: "digests",
      toolCalls: "names-only",
      toolResults: "digests",
      timing: "event",
      usage: options.usage.capture === "provider-reported" ? "provider-summary" : "unavailable",
      artifacts: "unavailable",
      reasoning: "not-collected",
    },
    events,
    limitations: [
      "Event timestamps record when the runner observed each complete Claude JSONL line, not when the provider began or completed internal work.",
      "Events delivered in one stdout chunk can share an observation timestamp.",
      "Tool duration is elapsed monotonic runner time between observed tool-call and matching tool-result events.",
      `Runner timing covered ${String(timingCoverage)} of ${String(options.providerLineNumbers.length)} retained provider events.`,
      ...options.limitations,
    ],
    redactions: [],
  });
}

function createRunnerObservedTraceEvents(
  providerEvents: readonly Record<string, unknown>[],
  providerLineNumbers: readonly number[],
  timingByLine: ReadonlyMap<number, ClaudeLineTiming>,
  finishedAt: string,
  exitCode: number,
  status: "succeeded" | "failed" | "timed_out",
  usage: ClaudeUsage,
): TraceBody["events"] {
  const traceEvents: TraceBody["events"] = [];
  const toolCalls = new Map<string, { name: string; elapsedMs?: number }>();
  const append = (
    timestamp: string,
    kind: TraceBody["events"][number]["kind"],
    actor: TraceBody["events"][number]["actor"],
    name: string,
    data: TraceBody["events"][number]["data"],
  ): void => {
    traceEvents.push({
      sequence: traceEvents.length,
      timestamp,
      kind,
      actor,
      name,
      data,
    });
  };

  for (const [eventIndex, providerEvent] of providerEvents.entries()) {
    const providerLine = providerLineNumbers[eventIndex] ?? eventIndex + 1;
    const timing = timingByLine.get(providerLine);
    const timestamp = timing?.observedAt ?? finishedAt;
    const timingData = {
      providerEventSequence: eventIndex,
      providerLine,
      ...(timing === undefined ? {} : { observedElapsedMs: timing.elapsedMs }),
    };
    const eventType = typeof providerEvent["type"] === "string" ? providerEvent["type"] : "unknown";

    if (eventType === "system") {
      append(timestamp, "status", "system", safeEventName(providerEvent["subtype"], "provider-system"), {
        ...timingData,
        ...(typeof providerEvent["model"] === "string" ? { model: providerEvent["model"] } : {}),
      });
      continue;
    }

    if (eventType === "assistant" && isRecord(providerEvent["message"])) {
      const content = providerEvent["message"]["content"];
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block["type"] === "text" && typeof block["text"] === "string") {
          append(timestamp, "message", "assistant", "assistant-message", {
            ...timingData,
            ...contentEvidence(block["text"]),
          });
        }
        if (block["type"] === "tool_use") {
          const toolUseId = typeof block["id"] === "string" ? block["id"] : `unknown-${String(eventIndex)}`;
          const name = safeEventName(block["name"], "unknown-tool");
          toolCalls.set(toolUseId, {
            name,
            ...(timing === undefined ? {} : { elapsedMs: timing.elapsedMs }),
          });
          append(timestamp, "tool-call", "assistant", name, {
            ...timingData,
            toolUseId,
          });
        }
      }
      continue;
    }

    if (eventType === "user" && isRecord(providerEvent["message"])) {
      const content = providerEvent["message"]["content"];
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block["type"] === "tool_result") {
          const toolUseId = typeof block["tool_use_id"] === "string"
            ? block["tool_use_id"]
            : `unknown-${String(eventIndex)}`;
          const call = toolCalls.get(toolUseId);
          const durationMs = timing?.elapsedMs !== undefined && call?.elapsedMs !== undefined
            ? Math.max(0, timing.elapsedMs - call.elapsedMs)
            : undefined;
          append(timestamp, "tool-result", "tool", call?.name ?? "unknown-tool", {
            ...timingData,
            toolUseId,
            isError: block["is_error"] === true,
            ...(durationMs === undefined ? {} : {
              durationMs,
              durationBasis: "runner-observed-event-interval",
            }),
            ...contentEvidence(block["content"]),
          });
        }
        if (block["type"] === "text" && typeof block["text"] === "string") {
          append(timestamp, "message", "user", "user-message", {
            ...timingData,
            ...contentEvidence(block["text"]),
          });
        }
      }
      continue;
    }

    if (eventType === "result") {
      append(timestamp, "status", "runner", "provider-result", {
        ...timingData,
        ...(typeof providerEvent["subtype"] === "string" ? { subtype: providerEvent["subtype"] } : {}),
        ...(nonnegativeNumber(providerEvent["duration_ms"]) === undefined
          ? {}
          : { providerDurationMs: nonnegativeNumber(providerEvent["duration_ms"])! }),
        ...(nonnegativeNumber(providerEvent["duration_api_ms"]) === undefined
          ? {}
          : { providerApiDurationMs: nonnegativeNumber(providerEvent["duration_api_ms"])! }),
        ...(integer(providerEvent["num_turns"]) === undefined
          ? {}
          : { providerTurns: integer(providerEvent["num_turns"])! }),
      });
      continue;
    }

    append(timestamp, "status", "runner", "provider-event", {
      ...timingData,
      providerEventType: eventType,
    });
  }

  if (usage.capture === "provider-reported") {
    append(finishedAt, "usage", "runner", "provider-usage", {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      ...(usage.costUsd === undefined ? {} : { costUsd: usage.costUsd }),
    });
  }
  append(
    finishedAt,
    "status",
    "runner",
    status === "succeeded" ? "subject-succeeded" : status === "timed_out" ? "subject-timed-out" : "subject-failed",
    {
      exitCode,
      capturedProviderEventCount: providerEvents.length,
      providerEventsPath: "subject-events.jsonl",
    },
  );
  return traceEvents;
}

function contentEvidence(content: unknown): {
  contentDigest: `sha256:${string}`;
  byteLength: number;
} {
  const serialized = typeof content === "string" ? content : JSON.stringify(content ?? null);
  const bytes = Buffer.from(serialized, "utf8");
  return {
    contentDigest: digest(bytes),
    byteLength: bytes.byteLength,
  };
}

function safeEventName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 256)
    : fallback;
}

export function parseClaudeCodeEvents(jsonl: string): {
  eventCount: number;
  sessionId?: string;
  model?: string;
  finalMessage: string;
  usage: ClaudeUsage;
  sanitizedJsonl: string;
  sanitizedEvents: Record<string, unknown>[];
  providerLineNumbers: number[];
  limitations: string[];
} {
  let eventCount = 0;
  let sessionId: string | undefined;
  let model: string | undefined;
  let finalMessage = "";
  let usage: ClaudeUsage = unavailableUsage();
  let usageCaptured = false;
  let reasoningRedactions = 0;
  const limitations: string[] = [];
  const sanitizedLines: string[] = [];
  const sanitizedEvents: Record<string, unknown>[] = [];
  const providerLineNumbers: number[] = [];

  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      limitations.push(`Claude Code JSONL line ${String(index + 1)} was not valid JSON and was excluded from evidence.`);
      continue;
    }
    eventCount += 1;
    const sanitized = redactReasoning(event, () => {
      reasoningRedactions += 1;
    }) as Record<string, unknown>;
    sanitizedLines.push(JSON.stringify(sanitized));
    sanitizedEvents.push(sanitized);
    providerLineNumbers.push(index + 1);

    if (event["type"] === "system" && event["subtype"] === "init") {
      if (typeof event["session_id"] === "string") sessionId = event["session_id"];
      if (typeof event["model"] === "string") model = event["model"];
    }
    if (event["type"] !== "result") continue;
    if (typeof event["session_id"] === "string") sessionId = event["session_id"];
    if (typeof event["result"] === "string") finalMessage = event["result"];
    const parsedUsage = parseResultUsage(event);
    if (parsedUsage !== undefined) {
      usage = parsedUsage;
      usageCaptured = true;
    }
  }

  if (!usageCaptured) {
    limitations.push("Claude Code emitted no complete result usage event; subject token usage is unavailable.");
  }
  if (reasoningRedactions > 0) {
    limitations.push(`Removed ${String(reasoningRedactions)} non-observable reasoning block(s) from captured Claude Code events.`);
  }
  return {
    eventCount,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(model === undefined ? {} : { model }),
    finalMessage,
    usage,
    sanitizedJsonl: sanitizedLines.length === 0 ? "" : `${sanitizedLines.join("\n")}\n`,
    sanitizedEvents,
    providerLineNumbers,
    limitations,
  };
}

function parseResultUsage(event: Record<string, unknown>): Exclude<ClaudeUsage, { capture: "unavailable" }> | undefined {
  if (!isRecord(event["usage"])) return undefined;
  const inputTokens = integer(event["usage"]["input_tokens"]);
  const cachedInputTokens = integer(event["usage"]["cache_read_input_tokens"]);
  const cacheCreationInputTokens = integer(event["usage"]["cache_creation_input_tokens"]);
  const outputTokens = integer(event["usage"]["output_tokens"]);
  if (
    inputTokens === undefined
    || cachedInputTokens === undefined
    || cacheCreationInputTokens === undefined
    || outputTokens === undefined
  ) return undefined;
  const costUsd = nonnegativeNumber(event["total_cost_usd"]);
  return {
    capture: "provider-reported",
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    totalTokens: inputTokens + cachedInputTokens + cacheCreationInputTokens + outputTokens,
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

function redactReasoning(value: unknown, onRedaction: () => void): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactReasoning(entry, onRedaction));
  }
  if (!isRecord(value)) return value;
  if (value["type"] === "thinking" || value["type"] === "redacted_thinking") {
    onRedaction();
    return { type: "reasoning-redacted" };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactReasoning(entry, onRedaction)]),
  );
}

function unavailableUsage(): { capture: "unavailable" } {
  return { capture: "unavailable" };
}

export async function spawnClaudeProcessCaptured(
  executable: string,
  args: string[],
  cwd: string,
  maxDurationMs: number,
): Promise<{
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  timedOut: boolean;
  lineTimings: ClaudeLineTiming[];
}> {
  return spawnJsonlProcessCaptured({
    executable,
    args,
    cwd,
    maxDurationMs,
    outputLabel: "Claude Code subject",
  });
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
