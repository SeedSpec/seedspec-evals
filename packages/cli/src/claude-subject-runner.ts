import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RunManifestSchema,
  createSubjectRun,
  parseTrace,
  type SubjectRun,
} from "@seedspec/eval-core";

import { preflightDesktopRunner } from "./runner-control.js";

const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
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
  if (execution.exitCode === 0 && !execution.timedOut && modelMatched) {
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
    } catch (error) {
      limitations.push(`The Claude Code process exited successfully, but the finalized subject trace was unavailable or invalid: ${errorMessage(error)}`);
    }
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
    status: execution.exitCode === 0 && !execution.timedOut && modelMatched && trace !== undefined ? "succeeded" : "failed",
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

export function parseClaudeCodeEvents(jsonl: string): {
  eventCount: number;
  sessionId?: string;
  model?: string;
  finalMessage: string;
  usage: {
    capture: "provider-reported" | "unavailable";
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheCreationInputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  sanitizedJsonl: string;
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
    });
    sanitizedLines.push(JSON.stringify(sanitized));

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
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    let timedOut = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const durationTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, maxDurationMs);
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(durationTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      reject(error);
    };
    const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        rejectOnce(new Error(`Claude Code subject output exceeded ${String(MAX_CAPTURE_BYTES)} bytes.`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.on("error", rejectOnce);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(durationTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      resolvePromise({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode: code ?? -1,
        timedOut,
      });
    });
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
