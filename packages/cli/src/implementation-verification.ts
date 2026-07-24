import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

import {
  CounterfactualVerificationSchema,
  ImplementationAcceptanceReportSchema,
  ImplementationVerificationSchema,
  RunManifestSchema,
  createCounterfactualVerification,
  createImplementationVerification,
  sha256Hex,
  type CounterfactualVerification,
  type ImplementationVerification,
} from "@seedspec/eval-core";
import { artifactTreeDigest } from "./case-qualification.js";

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
  const reportInput = JSON.parse(reportSource) as unknown;
  const strictReport = ImplementationAcceptanceReportSchema.safeParse(reportInput);
  const reportDiagnostics = strictReport.success
    ? []
    : strictReport.error.issues.filter(({ code }) => code === "unrecognized_keys").map((issue) => ({
        path: formatIssuePath(issue.path),
        keys: issue.code === "unrecognized_keys" ? issue.keys.toSorted() : [],
      }));
  if (!strictReport.success && reportDiagnostics.length !== strictReport.error.issues.length) {
    throw strictReport.error;
  }
  const report = strictReport.success
    ? strictReport.data
    : ImplementationAcceptanceReportSchema.parse(stripAcceptanceReportExtraFields(reportInput));

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
    reportConformance: {
      outcome: reportDiagnostics.length === 0 ? "conformant" : "normalized-extra-fields",
      diagnostics: reportDiagnostics,
    },
    limitations: [
      sandbox === "darwin-sandbox-exec"
        ? "The verifier executed declared local commands against a disposable realization copy in a macOS sandbox that allowed loopback-only networking while denying remote network access and writes outside the temporary copy."
        : "The verifier executed declared local commands against a disposable realization copy without an operating-system sandbox after explicit unsandboxed approval.",
      "The verifier did not provide a browser.",
      "A passing command establishes execution, not that the subject-authored test is semantically distinguishing; the independent technical review assesses test quality.",
      ...(reportDiagnostics.length === 0 ? [] : [
        `The subject acceptance report contained undeclared fields at ${String(reportDiagnostics.length)} location${reportDiagnostics.length === 1 ? "" : "s"}. The verifier preserved the original report digest, recorded every extra key, stripped only those keys for compatibility, and did not edit the subject artifact.`,
      ]),
    ],
  });
  const path = resolve(runDirectory, "implementation-verification.json");
  await writeFile(path, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  return { verification, path };
}

function stripAcceptanceReportExtraFields(input: unknown): unknown {
  if (!isRecord(input)) return input;
  return {
    ...pick(input, ["schemaVersion", "limitations"]),
    verificationCommands: Array.isArray(input["verificationCommands"])
      ? (input["verificationCommands"] as unknown[]).map((command: unknown) =>
          isRecord(command) ? pick(command, ["id", "argv", "cwd", "testPaths"]) : command)
      : input["verificationCommands"],
    scenarios: Array.isArray(input["scenarios"])
      ? (input["scenarios"] as unknown[]).map(stripLinkedResultExtraFields)
      : input["scenarios"],
    ...(isRecord(input["accessibility"]) ? {
      accessibility: {
        ...pick(input["accessibility"], ["viewportWidth"]),
        keyboardTasks: Array.isArray(input["accessibility"]["keyboardTasks"])
          ? (input["accessibility"]["keyboardTasks"] as unknown[]).map(stripLinkedResultExtraFields)
          : input["accessibility"]["keyboardTasks"],
      },
    } : input["accessibility"] === undefined ? {} : { accessibility: input["accessibility"] }),
  };
}

export async function verifyImplementationCounterfactuals(options: {
  readonly runDirectory: string;
  readonly candidates: readonly { readonly id: string; readonly path: string }[];
  readonly createdAt: string;
  readonly allowUnsandboxed?: boolean;
}): Promise<{ readonly verification: CounterfactualVerification; readonly path: string }> {
  if (options.candidates.length === 0) {
    throw new Error("At least one known-bad counterfactual candidate is required.");
  }
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  if (manifest.target.stage !== "implementation") {
    throw new Error("Counterfactual verification is only valid for implementation runs.");
  }
  const implementationVerification = ImplementationVerificationSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "implementation-verification.json"), "utf8")) as unknown,
  );
  if (implementationVerification.runId !== manifest.runId) {
    throw new Error("Implementation verification does not share the immutable run identity.");
  }
  const realizationRoot = resolve(runDirectory, "workspace", "realization");
  const candidateIds = options.candidates.map(({ id }) => id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("Counterfactual candidate IDs must be unique.");
  }
  const sandbox = verificationSandbox(options.allowUnsandboxed === true);
  const candidateRecords = await Promise.all(options.candidates.map(async (candidate) => ({
    id: candidate.id,
    path: resolve(candidate.path),
    digest: await artifactTreeDigest(resolve(candidate.path)),
  })));
  for (const candidate of candidateRecords) {
    if (!(await lstat(candidate.path)).isDirectory()) {
      throw new Error(`Counterfactual candidate must be a directory tree: ${candidate.path}`);
    }
  }
  const primaryExecutions = new Map(
    implementationVerification.commands.map((command) => [command.id, command]),
  );
  for (const command of implementationVerification.report.verificationCommands) {
    if (command.testPaths === undefined) continue;
    const primary = primaryExecutions.get(command.id);
    if (primary?.outcome !== "pass") {
      throw new Error(
        `Counterfactual command ${command.id} cannot be interpreted because it did not pass on the final realization.`,
      );
    }
  }
  const executions: Array<{
    candidateId: string;
    commandId: string;
    argv: string[];
    cwd?: string;
    testPaths: string[];
    startedAt: string;
    finishedAt: string;
    sandbox: "darwin-sandbox-exec" | "unsandboxed";
    rawOutcome: "pass" | "fail" | "timed-out";
    distinguishes: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> = [];
  for (const candidate of candidateRecords) {
    const temporaryRoot = await realpath(
      await mkdtemp(resolve(tmpdir(), "seedspec-counterfactual-verifier-")),
    );
    const candidateRoot = resolve(temporaryRoot, "candidate");
    try {
      await cp(candidate.path, candidateRoot, { recursive: true, errorOnExist: true });
      for (const command of implementationVerification.report.verificationCommands) {
        if (command.testPaths === undefined) continue;
        for (const testPath of command.testPaths) {
          const source = containedPath(realizationRoot, testPath);
          const sourceStat = await lstat(source);
          if (sourceStat.isSymbolicLink()) {
            throw new Error(`Counterfactual test path cannot be a symbolic link: ${testPath}`);
          }
          await artifactTreeDigest(source);
          const target = containedPath(candidateRoot, testPath);
          await mkdir(dirname(target), { recursive: true });
          await cp(source, target, {
            recursive: sourceStat.isDirectory(),
            force: true,
          });
        }
        const executable = command.argv[0]!;
        if (!ALLOWED_VERIFICATION_EXECUTABLES.has(executable)) {
          throw new Error(`Counterfactual command ${command.id} uses unsupported executable ${executable}.`);
        }
        const cwd = command.cwd === undefined
          ? candidateRoot
          : containedPath(candidateRoot, command.cwd);
        const startedAt = new Date().toISOString();
        const invocation = sandboxInvocation(sandbox, executable, command.argv.slice(1), temporaryRoot);
        let rawOutcome: "pass" | "fail" | "timed-out" = "pass";
        let exitCode: number | null = 0;
        let stdout = "";
        let stderr = "";
        try {
          stdout = execFileSync(invocation.executable, invocation.args, {
            cwd,
            encoding: "utf8",
            timeout: 120_000,
            maxBuffer: 4 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
            env: verificationEnvironment(temporaryRoot),
          });
        } catch (error) {
          const observed = executableError(error);
          rawOutcome = observed.timedOut ? "timed-out" : "fail";
          exitCode = observed.exitCode;
          stdout = observed.stdout;
          stderr = observed.stderr;
        }
        executions.push({
          candidateId: candidate.id,
          commandId: command.id,
          argv: [...command.argv],
          ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
          testPaths: [...command.testPaths],
          startedAt,
          finishedAt: new Date().toISOString(),
          sandbox,
          rawOutcome,
          distinguishes: rawOutcome === "fail",
          exitCode,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
        });
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
  if (executions.length === 0) {
    throw new Error(
      "No counterfactual commands were executed. Subject verification commands must declare testPaths before their tests can be overlaid onto a known-bad candidate.",
    );
  }
  const verification = createCounterfactualVerification({
    schemaVersion: 1,
    runId: manifest.runId,
    implementationVerificationId: implementationVerification.verificationId,
    createdAt: options.createdAt,
    candidates: candidateRecords,
    executions,
    summary: {
      distinguishing: executions.filter(({ distinguishes }) => distinguishes).length,
      nonDistinguishing: executions.filter(({ rawOutcome }) => rawOutcome === "pass").length,
      unevaluated: executions.filter(({ rawOutcome }) => rawOutcome === "timed-out").length,
    },
    limitations: [
      "A failing command on the known-bad candidate is necessary but not sufficient evidence that the overlaid tests fail for the intended behavioral reason; review captured stderr and the changed test paths.",
      "Counterfactual candidates are operator-supplied, content-addressed artifact trees and are not visible to the implementation subject.",
      sandbox === "darwin-sandbox-exec"
        ? "Commands ran in the same loopback-only macOS verification sandbox used for final implementation checks."
        : "Commands ran unsandboxed only after explicit approval for an externally isolated disposable environment.",
    ],
  });
  const path = resolve(runDirectory, "counterfactual-verification.json");
  await writeFile(path, `${JSON.stringify(CounterfactualVerificationSchema.parse(verification), null, 2)}\n`, "utf8");
  return { verification, path };
}

function stripLinkedResultExtraFields(input: unknown): unknown {
  return isRecord(input)
    ? pick(input, ["id", "outcome", "commandIds", "evidence", "assessment"])
    : input;
}

function pick(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.flatMap((key) =>
    Object.prototype.hasOwnProperty.call(record, key) ? [[key, record[key]]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((part) => typeof part === "number" ? `[${String(part)}]` : `.${String(part)}`).join("")}`;
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
  const profile = darwinVerificationSandboxProfile(temporaryHome);
  return {
    executable: "/usr/bin/sandbox-exec",
    args: ["-p", profile, executable, ...args],
  };
}

function verificationEnvironment(temporaryHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "",
    LANG: "C.UTF-8",
    HOME: temporaryHome,
    TMPDIR: temporaryHome,
    CI: "1",
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    UV_OFFLINE: "1",
    CARGO_NET_OFFLINE: "true",
  };
}

export function darwinVerificationSandboxProfile(temporaryHome: string): string {
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(allow network* (local ip))",
    "(deny file-write*)",
    `(allow file-write* (subpath ${JSON.stringify(temporaryHome)}))`,
  ].join(" ");
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
