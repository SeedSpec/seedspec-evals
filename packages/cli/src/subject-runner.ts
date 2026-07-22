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

import { codexModelSelector, parseCodexEvaluatorEvents } from "./profile-runner.js";
import { preflightDesktopRunner } from "./runner-control.js";

const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

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
  const execution = await spawnCaptured(options.codexExecutable, args, runDirectory);
  const finishedAt = new Date().toISOString();
  await Promise.all([
    writeFile(eventsPath, execution.stdout),
    writeFile(stderrPath, execution.stderr),
    ensureFile(finalMessagePath),
  ]);

  const parsedEvents = parseCodexEvaluatorEvents(execution.stdout.toString("utf8"));
  const limitations = [...parsedEvents.limitations];
  let trace:
    | { traceId: string; path: string; digest: `sha256:${string}`; byteLength: number }
    | undefined;
  if (execution.exitCode === 0) {
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
      limitations.push(`The Codex process exited successfully, but the finalized subject trace was unavailable or invalid: ${errorMessage(error)}`);
    }
  }
  const finalMessage = await readFile(finalMessagePath);
  const run = createSubjectRun({
    schemaVersion: 1,
    runId: manifest.runId,
    ...(typeof manifest.configuration?.["sourceRunId"] === "string"
      ? { sourceRunId: manifest.configuration["sourceRunId"] }
      : {}),
    runner: { id: "codex-cli", version },
    model: manifest.model.modelId,
    modelSelector,
    reasoningEffort: options.reasoningEffort,
    startedAt,
    finishedAt,
    status: execution.exitCode === 0 && trace !== undefined ? "succeeded" : "failed",
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
    limitations,
  });
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { run, path: runPath };
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
    let totalBytes = 0;
    const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        reject(new Error(`Codex subject output exceeded ${String(MAX_CAPTURE_BYTES)} bytes.`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
