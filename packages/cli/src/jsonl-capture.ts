import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

export interface ObservedLineTiming {
  readonly providerLine: number;
  readonly observedAt: string;
  readonly elapsedMs: number;
}

export async function spawnJsonlProcessCaptured(options: {
  executable: string;
  args: string[];
  cwd: string;
  maxDurationMs: number;
  outputLabel: string;
}): Promise<{
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  timedOut: boolean;
  lineTimings: ObservedLineTiming[];
}> {
  return new Promise((resolvePromise, reject) => {
    const startedMonotonic = performance.now();
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    let timedOut = false;
    const lineTimings: ObservedLineTiming[] = [];
    const decoder = new StringDecoder("utf8");
    let pendingStdout = "";
    let providerLine = 0;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const durationTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, options.maxDurationMs);
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
        rejectOnce(new Error(`${options.outputLabel} output exceeded ${String(MAX_CAPTURE_BYTES)} bytes.`));
        return;
      }
      chunks.push(Buffer.from(chunk));
    };
    const observeCompleteLines = (text: string, final: boolean): void => {
      pendingStdout += text;
      const completeLines: string[] = [];
      let newlineIndex = pendingStdout.indexOf("\n");
      while (newlineIndex >= 0) {
        completeLines.push(pendingStdout.slice(0, newlineIndex).replace(/\r$/, ""));
        pendingStdout = pendingStdout.slice(newlineIndex + 1);
        newlineIndex = pendingStdout.indexOf("\n");
      }
      if (final && pendingStdout.length > 0) {
        completeLines.push(pendingStdout.replace(/\r$/, ""));
        pendingStdout = "";
      }
      const observedAt = new Date().toISOString();
      const elapsedMs = Math.max(0, Math.round(performance.now() - startedMonotonic));
      for (const line of completeLines) {
        providerLine += 1;
        if (line.trim().length === 0) continue;
        lineTimings.push({ providerLine, observedAt, elapsedMs });
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      capture(stdout)(chunk);
      observeCompleteLines(decoder.write(chunk), false);
    });
    child.stderr.on("data", capture(stderr));
    child.on("error", rejectOnce);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(durationTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      observeCompleteLines(decoder.end(), true);
      resolvePromise({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode: code ?? -1,
        timedOut,
        lineTimings,
      });
    });
  });
}
