import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";

import {
  ImplementationAcceptanceReportSchema,
  RunManifestSchema,
  createImplementationVerification,
  sha256Hex,
  type ImplementationVerification,
} from "@seedspec/eval-core";

const ALLOWED_VERIFICATION_EXECUTABLES = new Set([
  "bun",
  "cargo",
  "deno",
  "go",
  "node",
  "npm",
  "php",
  "pnpm",
  "python",
  "python3",
  "ruby",
  "uv",
  "yarn",
]);

export async function verifyImplementationRun(options: {
  readonly runDirectory: string;
  readonly createdAt: string;
  readonly allowUnsandboxed?: boolean;
}): Promise<{ readonly verification: ImplementationVerification; readonly path: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  if (manifest.target.stage !== "implementation") {
    throw new Error("Executable implementation verification is only valid for implementation runs.");
  }
  const realizationRoot = resolve(runDirectory, "workspace", "realization");
  const reportPath = resolve(realizationRoot, "acceptance-report.json");
  const reportSource = await readFile(reportPath, "utf8");
  const report = ImplementationAcceptanceReportSchema.parse(JSON.parse(reportSource) as unknown);

  const sandbox = verificationSandbox(options.allowUnsandboxed === true);
  const temporaryRoot = await realpath(
    await mkdtemp(resolve(tmpdir(), "seedspec-implementation-verifier-")),
  );
  const verificationRoot = resolve(temporaryRoot, "realization");
  await cp(realizationRoot, verificationRoot, { recursive: true, errorOnExist: true });
  const commands = [];
  try {
    for (const command of report.verificationCommands) {
      const executable = command.argv[0]!;
      if (!ALLOWED_VERIFICATION_EXECUTABLES.has(executable)) {
        throw new Error(
          `Verification command ${command.id} uses unsupported executable ${JSON.stringify(executable)}. `
          + `Allowed executables: ${[...ALLOWED_VERIFICATION_EXECUTABLES].toSorted().join(", ")}.`,
        );
      }
      const cwd = command.cwd === undefined
        ? verificationRoot
        : containedPath(verificationRoot, command.cwd);
      const startedAt = new Date().toISOString();
      const invocation = sandboxInvocation(sandbox, executable, command.argv.slice(1), temporaryRoot);
      try {
        const stdout = execFileSync(invocation.executable, invocation.args, {
          cwd,
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 4 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            PATH: process.env["PATH"] ?? "",
            LANG: "C.UTF-8",
            HOME: temporaryRoot,
            TMPDIR: temporaryRoot,
            CI: "1",
            npm_config_offline: "true",
            npm_config_audit: "false",
            npm_config_fund: "false",
            UV_OFFLINE: "1",
            CARGO_NET_OFFLINE: "true",
          },
        });
        commands.push({
          id: command.id,
          argv: command.argv,
          ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
          startedAt,
          finishedAt: new Date().toISOString(),
          sandbox,
          outcome: "pass" as const,
          exitCode: 0,
          stdout: truncateOutput(stdout),
          stderr: "",
        });
      } catch (error) {
        const observed = executableError(error);
        commands.push({
          id: command.id,
          argv: command.argv,
          ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
          startedAt,
          finishedAt: new Date().toISOString(),
          sandbox,
          outcome: observed.timedOut ? "timed-out" as const : "fail" as const,
          exitCode: observed.exitCode,
          stdout: truncateOutput(observed.stdout),
          stderr: truncateOutput(observed.stderr),
        });
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const requestedEvidence = new Set([
    ...report.scenarios.flatMap(({ evidence }) => evidence),
    ...(report.accessibility?.keyboardTasks.flatMap(({ evidence }) => evidence) ?? []),
  ]);
  const evidence = await Promise.all([...requestedEvidence].toSorted().map(async (path) => {
    const file = containedPath(realizationRoot, path);
    const fileStat = await lstat(file).catch(() => null);
    if (fileStat?.isSymbolicLink() === true) {
      throw new Error(`Verification evidence cannot be a symbolic link: ${path}`);
    }
    if (fileStat?.isFile() !== true) return { path, exists: false };
    const source = await readFile(file);
    return {
      path,
      exists: true,
      digest: `sha256:${createHash("sha256").update(source).digest("hex")}` as const,
    };
  }));
  const verification = createImplementationVerification({
    schemaVersion: 1,
    runId: manifest.runId,
    createdAt: options.createdAt,
    reportPath: "workspace/realization/acceptance-report.json",
    reportDigest: `sha256:${sha256Hex(reportSource)}`,
    commands,
    evidence,
    report,
    limitations: [
      sandbox === "darwin-sandbox-exec"
        ? "The verifier executed declared local commands against a disposable realization copy in a macOS sandbox that denied network access and writes outside the temporary copy."
        : "The verifier executed declared local commands against a disposable realization copy without an operating-system sandbox after explicit unsandboxed approval.",
      "The verifier did not provide a browser.",
      "A passing command establishes execution, not that the subject-authored test is semantically distinguishing; the independent technical review assesses test quality.",
    ],
  });
  const path = resolve(runDirectory, "implementation-verification.json");
  await writeFile(path, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  return { verification, path };
}

function containedPath(root: string, requested: string): string {
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Path escapes the implementation realization: ${requested}`);
  }
  return path;
}

function truncateOutput(output: string): string {
  if (output.length <= 32_000) return output;
  return `${output.slice(0, 31_900)}\n...[truncated by implementation verifier]`;
}

function executableError(error: unknown): {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
} {
  if (typeof error !== "object" || error === null) {
    return { exitCode: null, stdout: "", stderr: primitiveErrorMessage(error), timedOut: false };
  }
  const record = error as {
    status?: unknown;
    stdout?: unknown;
    stderr?: unknown;
    killed?: unknown;
    signal?: unknown;
  };
  return {
    exitCode: typeof record.status === "number" ? record.status : null,
    stdout: typeof record.stdout === "string" ? record.stdout : "",
    stderr: typeof record.stderr === "string"
      ? record.stderr
      : error instanceof Error ? error.message : "Verification command failed without string stderr.",
    timedOut: record.killed === true || record.signal === "SIGTERM",
  };
}

function verificationSandbox(allowUnsandboxed: boolean): "darwin-sandbox-exec" | "unsandboxed" {
  if (process.platform === "darwin") return "darwin-sandbox-exec";
  if (allowUnsandboxed) return "unsandboxed";
  throw new Error(
    "No supported operating-system verification sandbox is available on this platform. "
    + "Use an isolated disposable environment, then pass --allow-unsandboxed only when that external isolation is in place.",
  );
}

function sandboxInvocation(
  sandbox: "darwin-sandbox-exec" | "unsandboxed",
  executable: string,
  args: readonly string[],
  temporaryHome: string,
): { readonly executable: string; readonly args: readonly string[] } {
  if (sandbox === "unsandboxed") return { executable, args };
  const profile = [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${JSON.stringify(temporaryHome)}))`,
  ].join(" ");
  return {
    executable: "/usr/bin/sandbox-exec",
    args: ["-p", profile, executable, ...args],
  };
}

function primitiveErrorMessage(error: unknown): string {
  if (typeof error === "symbol") return error.description ?? "symbol error";
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    return `${error}`;
  }
  if (typeof error === "undefined") return "unknown error";
  return "Verification command failed with a non-object error value.";
}
