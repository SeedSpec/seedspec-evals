import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createEvaluatorRun,
  parseProfileEvidenceEnvelope,
  type EvaluatorRun,
} from "@seedspec/eval-core";

import { finalizeEvaluationProfileFile, validateEvaluationProfileFile } from "./profile.js";

const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

export async function runCodexProfileEvaluator(options: {
  runDirectory: string;
  codexExecutable: string;
}): Promise<{ run: EvaluatorRun; path: string }> {
  const runDirectory = resolve(options.runDirectory);
  const handoffPath = resolve(runDirectory, "profile-evaluation-handoff.md");
  const evidencePath = resolve(runDirectory, "profile-evidence.json");
  const eventsPath = resolve(runDirectory, "profile-evaluator-events.jsonl");
  const stderrPath = resolve(runDirectory, "profile-evaluator-stderr.log");
  const finalMessagePath = resolve(runDirectory, "profile-evaluator-final.md");
  const runPath = resolve(runDirectory, "evaluator-run.json");
  const draftPath = resolve(runDirectory, "evaluation-profile-draft.json");
  const profilePath = resolve(runDirectory, "evaluation-profile.json");
  const evidence = parseProfileEvidenceEnvelope(JSON.parse(await readFile(evidencePath, "utf8")) as unknown);
  if (evidence.evaluatorRequest.runner !== "codex") {
    throw new Error(`Captured Codex evaluation requires an evidence envelope prepared for codex, not ${evidence.evaluatorRequest.runner}.`);
  }
  await readFile(handoffPath, "utf8");
  const version = execFileSync(options.codexExecutable, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
  const startedAt = new Date().toISOString();
  const prompt = [
    `Read ${handoffPath} completely and execute that evaluation handoff.`,
    "Treat the content-addressed profile evidence envelope as the complete control-plane index.",
    "Do not inspect unrelated repository files or TypeScript schemas, and do not edit the evaluated subject.",
    `A successful run must finalize ${profilePath} using the evidence-bound finalizer command in the handoff.`,
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
    "--model", codexModelSelector(evidence.evaluatorRequest.model),
    "--config", `model_reasoning_effort=${JSON.stringify(evidence.evaluatorRequest.reasoningEffort)}`,
    "--output-last-message", finalMessagePath,
    prompt,
  ];
  const execution = await spawnCaptured(options.codexExecutable, args, runDirectory);
  const finishedAt = new Date().toISOString();
  await Promise.all([
    writeFile(eventsPath, execution.stdout),
    writeFile(stderrPath, execution.stderr),
    ensureFile(finalMessagePath),
  ]);
  const parsed = parseCodexEvaluatorEvents(execution.stdout.toString("utf8"));
  let profileId: string | undefined;
  const limitations = [...parsed.limitations];
  if (execution.exitCode === 0) {
    try {
      // Re-run the deterministic boundary locally even if the evaluator already finalized it.
      const finalized = await finalizeEvaluationProfileFile({ draft: draftPath, out: profilePath, evidence: evidencePath });
      profileId = (await validateEvaluationProfileFile(finalized.path)).profileId;
    } catch (error) {
      limitations.push(`The Codex process exited successfully, but evidence-bound profile finalization failed: ${errorMessage(error)}`);
    }
  }
  const finalMessage = await readFile(finalMessagePath);
  const run = createEvaluatorRun({
    schemaVersion: 1,
    evidenceId: evidence.evidenceId,
    ...(profileId === undefined ? {} : { profileId }),
    runner: { id: "codex-cli", version },
    model: evidence.evaluatorRequest.model,
    reasoningEffort: evidence.evaluatorRequest.reasoningEffort,
    startedAt,
    finishedAt,
    status: execution.exitCode === 0 && profileId !== undefined ? "succeeded" : "failed",
    exitCode: execution.exitCode,
    usage: parsed.usage,
    events: {
      path: "profile-evaluator-events.jsonl",
      digest: digest(execution.stdout),
      byteLength: execution.stdout.byteLength,
      count: parsed.eventCount,
      ...(parsed.threadId === undefined ? {} : { threadId: parsed.threadId }),
    },
    stderr: {
      path: "profile-evaluator-stderr.log",
      digest: digest(execution.stderr),
      byteLength: execution.stderr.byteLength,
    },
    finalMessage: {
      path: "profile-evaluator-final.md",
      digest: digest(finalMessage),
      byteLength: finalMessage.byteLength,
    },
    limitations,
  });
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { run, path: runPath };
}

export function codexModelSelector(model: string): string {
  // Evaluation manifests use AI Gateway model slugs so the provider remains
  // explicit. The Codex CLI's OpenAI/ChatGPT adapter accepts the model portion
  // of that slug instead.
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

export function parseCodexEvaluatorEvents(jsonl: string): {
  eventCount: number;
  threadId?: string;
  usage: {
    capture: "provider-reported" | "unavailable";
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
    totalTokens?: number;
  };
  limitations: string[];
} {
  let eventCount = 0;
  let threadId: string | undefined;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens = 0;
  let usageEvents = 0;
  const limitations: string[] = [];
  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      limitations.push(`Codex JSONL line ${String(index + 1)} was not valid JSON and was excluded from usage accounting.`);
      continue;
    }
    eventCount += 1;
    if (event["type"] === "thread.started" && typeof event["thread_id"] === "string") threadId = event["thread_id"];
    if (event["type"] !== "turn.completed" || !isRecord(event["usage"])) continue;
    const usage = event["usage"];
    const input = integer(usage["input_tokens"]);
    const cached = integer(usage["cached_input_tokens"]);
    const output = integer(usage["output_tokens"]);
    const reasoning = integer(usage["reasoning_output_tokens"]) ?? 0;
    if (input === undefined || cached === undefined || output === undefined) {
      limitations.push(`Codex turn.completed event on line ${String(index + 1)} omitted a required usage count.`);
      continue;
    }
    usageEvents += 1;
    inputTokens += input;
    cachedInputTokens += cached;
    outputTokens += output;
    reasoningOutputTokens += reasoning;
  }
  if (usageEvents === 0) {
    limitations.push("Codex emitted no complete turn.completed usage event; evaluator token usage is unavailable.");
    return { eventCount, ...(threadId === undefined ? {} : { threadId }), usage: { capture: "unavailable" }, limitations };
  }
  return {
    eventCount,
    ...(threadId === undefined ? {} : { threadId }),
    usage: {
      capture: "provider-reported",
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    limitations,
  };
}

async function spawnCaptured(executable: string, args: string[], cwd: string): Promise<{
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const capture = (chunks: Buffer[], kind: "stdout" | "stderr") => (chunk: Buffer) => {
      if (kind === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      if (stdoutBytes + stderrBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        reject(new Error(`Codex evaluator output exceeded ${String(MAX_CAPTURE_BYTES)} bytes.`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    child.stdout.on("data", capture(stdout, "stdout"));
    child.stderr.on("data", capture(stderr, "stderr"));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
      exitCode: code ?? -1,
    }));
  });
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

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
