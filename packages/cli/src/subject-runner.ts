import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RunManifestSchema,
  createSubjectRun,
  createTrace,
  parseTrace,
  type SubjectRun,
  type Trace,
  type TraceBody,
} from "@seedspec/eval-core";

import {
  spawnJsonlProcessCaptured,
  type ObservedLineTiming,
} from "./jsonl-capture.js";
import {
  codexModelSelector,
  parseCodexEvaluatorEvents,
  type CodexUsage,
} from "./profile-runner.js";
import { preflightDesktopRunner } from "./runner-control.js";

export async function runCodexSubject(options: {
  runDirectory: string;
  evaluationRepositoryRoot: string;
  codexExecutable: string;
  reasoningEffort: string;
}): Promise<{ run: SubjectRun; path: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  if (manifest.runner.id !== "codex-desktop") {
    throw new Error(`Captured Codex execution requires a codex-desktop runner kit, not ${manifest.runner.id}.`);
  }
  const preflight = await preflightDesktopRunner(runDirectory, options.evaluationRepositoryRoot, {
    workingDirectory: runDirectory,
  });
  if (!preflight.ready) {
    const failures = preflight.checks
      .filter(({ passed }) => !passed)
      .map(({ id, message }) => `${id}: ${message}`);
    throw new Error(`Subject model execution was not started because runner preflight failed: ${failures.join("; ")}`);
  }

  const eventsPath = resolve(runDirectory, "subject-events.jsonl");
  const stderrPath = resolve(runDirectory, "subject-stderr.log");
  const finalMessagePath = resolve(runDirectory, "subject-final.md");
  const runPath = resolve(runDirectory, "subject-run.json");
  const tracePath = resolve(runDirectory, "trace.json");
  const captureTracePath = resolve(runDirectory, "capture-trace.json");
  const version = execFileSync(options.codexExecutable, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
  const modelSelector = codexModelSelector(manifest.model.modelId);
  const startedAt = new Date().toISOString();
  const prompt = [
    "Read handoff.md completely and execute it.",
    "Begin with node runner-control.mjs preflight and continue only if it reports READY.",
    "Complete the evaluated work, required report and observable trace, then finalize the trace exactly as instructed.",
  ].join(" ");
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--color", "never",
    "--sandbox", "workspace-write",
    "--cd", runDirectory,
    "--model", modelSelector,
    "--config", `model_reasoning_effort=${JSON.stringify(options.reasoningEffort)}`,
    "--output-last-message", finalMessagePath,
    prompt,
  ];
  const execution = await spawnCodexProcessCaptured(
    options.codexExecutable,
    args,
    runDirectory,
    manifest.limits.maxDurationMs,
  );
  const finishedAt = new Date().toISOString();
  await Promise.all([
    writeFile(eventsPath, execution.stdout),
    writeFile(stderrPath, execution.stderr),
    ensureFile(finalMessagePath),
  ]);

  const parsedEvents = parseCodexSubjectEvents(execution.stdout.toString("utf8"));
  const limitations = [...parsedEvents.limitations];
  if (execution.timedOut) {
    limitations.push(`Codex was terminated after reaching the ${String(manifest.limits.maxDurationMs)} ms run-duration limit.`);
  }
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
      limitations.push(`The invalid subject trace was preserved as ${invalidTracePath}: ${errorMessage(error)}`);
    }
  }
  const subjectSucceeded = execution.exitCode === 0 && !execution.timedOut && subjectFinalizedTrace;
  const captureTrace = createCodexCaptureTrace({
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
    events: parsedEvents.events,
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
  const finalMessage = await readFile(finalMessagePath);
  const run = createSubjectRun({
    schemaVersion: 2,
    runId: manifest.runId,
    ...(typeof manifest.configuration?.["sourceRunId"] === "string"
      ? { sourceRunId: manifest.configuration["sourceRunId"] }
      : {}),
    runner: { id: "codex-cli", version },
    requestedModel: manifest.model.modelId,
    modelSelector,
    modelIdentityStatus: "unverified",
    reasoningEffort: options.reasoningEffort,
    startedAt,
    finishedAt,
    status: subjectSucceeded ? "succeeded" : "failed",
    exitCode: execution.exitCode,
    usage: parsedEvents.usage,
    events: {
      path: "subject-events.jsonl",
      digest: digest(execution.stdout),
      byteLength: execution.stdout.byteLength,
      count: parsedEvents.eventCount,
      ...(parsedEvents.threadId === undefined ? {} : { threadId: parsedEvents.threadId }),
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

export function parseCodexSubjectEvents(jsonl: string): {
  eventCount: number;
  threadId?: string;
  usage: CodexUsage;
  events: Record<string, unknown>[];
  providerLineNumbers: number[];
  limitations: string[];
} {
  const summary = parseCodexEvaluatorEvents(jsonl);
  const events: Record<string, unknown>[] = [];
  const providerLineNumbers: number[] = [];
  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    try {
      events.push(JSON.parse(line) as Record<string, unknown>);
      providerLineNumbers.push(index + 1);
    } catch {
      // The shared Codex parser already records the invalid line limitation.
    }
  }
  return {
    eventCount: summary.eventCount,
    ...(summary.threadId === undefined ? {} : { threadId: summary.threadId }),
    usage: summary.usage,
    events,
    providerLineNumbers,
    limitations: summary.limitations,
  };
}

export function createCodexCaptureTrace(options: {
  identity: Pick<TraceBody, "runId" | "sourceRunId" | "variant" | "runner" | "model">;
  startedAt: string;
  finishedAt: string;
  status: "succeeded" | "failed" | "timed_out";
  exitCode: number;
  events: readonly Record<string, unknown>[];
  providerLineNumbers: readonly number[];
  lineTimings: readonly ObservedLineTiming[];
  usage: CodexUsage;
  limitations: readonly string[];
}): Trace {
  const timingByLine = new Map(options.lineTimings.map((timing) => [timing.providerLine, timing]));
  const events = createRunnerObservedCodexEvents(
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
      "Event timestamps record when the runner observed each complete Codex JSONL line, not when the provider began or completed internal work.",
      "Events delivered in one stdout chunk can share an observation timestamp.",
      "Tool duration is elapsed monotonic runner time between observed item-started and matching item-completed events.",
      `Runner timing covered ${String(timingCoverage)} of ${String(options.providerLineNumbers.length)} retained provider events.`,
      ...options.limitations,
    ],
    redactions: [],
  });
}

function createRunnerObservedCodexEvents(
  providerEvents: readonly Record<string, unknown>[],
  providerLineNumbers: readonly number[],
  timingByLine: ReadonlyMap<number, ObservedLineTiming>,
  finishedAt: string,
  exitCode: number,
  status: "succeeded" | "failed" | "timed_out",
  usage: CodexUsage,
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
    traceEvents.push({ sequence: traceEvents.length, timestamp, kind, actor, name, data });
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

    if (eventType === "thread.started") {
      append(timestamp, "status", "system", "thread-started", {
        ...timingData,
        ...(typeof providerEvent["thread_id"] === "string" ? { threadId: providerEvent["thread_id"] } : {}),
      });
      continue;
    }
    if (eventType === "turn.started") {
      append(timestamp, "status", "runner", "turn-started", timingData);
      continue;
    }
    if (eventType === "turn.completed") {
      append(timestamp, "status", "runner", "turn-completed", timingData);
      continue;
    }
    if (eventType === "turn.failed") {
      append(timestamp, "error", "runner", "turn-failed", {
        ...timingData,
        ...contentEvidence(providerEvent),
      });
      continue;
    }
    if (
      (eventType === "item.started" || eventType === "item.completed" || eventType === "item.updated")
      && isRecord(providerEvent["item"])
    ) {
      const item = providerEvent["item"];
      const itemId = typeof item["id"] === "string" ? item["id"] : `unknown-${String(eventIndex)}`;
      const itemType = safeEventName(item["type"], "unknown-item");
      if (eventType === "item.started" && isCodexToolItemType(itemType)) {
        toolCalls.set(itemId, {
          name: itemType,
          ...(timing === undefined ? {} : { elapsedMs: timing.elapsedMs }),
        });
        append(timestamp, "tool-call", "assistant", itemType, {
          ...timingData,
          itemId,
        });
        continue;
      }
      if (eventType === "item.started") {
        append(timestamp, "status", "runner", "item-started", {
          ...timingData,
          itemId,
          itemType,
        });
        continue;
      }
      if (eventType === "item.completed" && itemType === "agent_message") {
        append(timestamp, "message", "assistant", "assistant-message", {
          ...timingData,
          itemId,
          ...contentEvidence(item["text"]),
        });
        continue;
      }
      if (eventType === "item.completed" && itemType === "reasoning") {
        append(timestamp, "status", "assistant", "reasoning-not-collected", {
          ...timingData,
          itemId,
        });
        continue;
      }
      if (eventType === "item.completed" && itemType === "error") {
        append(timestamp, "error", "runner", "item-error", {
          ...timingData,
          itemId,
          ...contentEvidence(item),
        });
        continue;
      }
      if (eventType === "item.completed" && isCodexToolItemType(itemType)) {
        const call = toolCalls.get(itemId);
        const durationMs = timing?.elapsedMs !== undefined && call?.elapsedMs !== undefined
          ? Math.max(0, timing.elapsedMs - call.elapsedMs)
          : undefined;
        append(timestamp, "tool-result", "tool", call?.name ?? itemType, {
          ...timingData,
          itemId,
          isError: item["status"] === "failed",
          ...(durationMs === undefined ? {} : {
            durationMs,
            durationBasis: "runner-observed-event-interval",
          }),
          ...contentEvidence(item),
        });
        continue;
      }
      append(timestamp, "status", "runner", eventType === "item.updated" ? "item-updated" : "item-completed", {
        ...timingData,
        itemId,
        itemType,
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
      outputTokens: usage.outputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      totalTokens: usage.totalTokens,
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

export async function spawnCodexProcessCaptured(
  executable: string,
  args: string[],
  cwd: string,
  maxDurationMs: number,
): ReturnType<typeof spawnJsonlProcessCaptured> {
  return spawnJsonlProcessCaptured({
    executable,
    args,
    cwd,
    maxDurationMs,
    outputLabel: "Codex subject",
  });
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

function isCodexToolItemType(value: string): boolean {
  return [
    "collab_tool_call",
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "todo_list",
    "web_search",
  ].includes(value);
}

async function ensureFile(path: string): Promise<void> {
  try {
    await readFile(path);
  } catch {
    await writeFile(path, "", "utf8");
  }
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
