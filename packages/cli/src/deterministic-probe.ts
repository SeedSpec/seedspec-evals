import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, relative, resolve, sep } from "node:path";

import {
  DeterministicProbeBodySchema,
  createDeterministicProbe,
  createDeterministicProbeResult,
  parseCaseQualification,
  parseDeterministicProbe,
  type DeterministicProbe,
  type DeterministicProbeResult,
} from "@seedspec/eval-core";
import { parseDocument } from "yaml";

import { artifactTreeDigest } from "./case-qualification.js";
import { darwinVerificationSandboxProfile } from "./implementation-verification.js";

const ALLOWED_PROBE_EXECUTABLES = new Set([
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

export async function finalizeDeterministicProbeFile(options: {
  draft: string;
  qualification: string;
  out?: string;
}): Promise<{ probe: DeterministicProbe; path: string }> {
  const draftPath = resolve(options.draft);
  const qualificationPath = resolve(options.qualification);
  const body = DeterministicProbeBodySchema.parse(
    parseStructuredDocument(await readFile(draftPath, "utf8"), draftPath),
  );
  const qualification = parseCaseQualification(
    JSON.parse(await readFile(qualificationPath, "utf8")) as unknown,
  );
  if (qualification.status !== "qualified") {
    throw new Error("Only a qualified case discovery can be promoted to a deterministic probe.");
  }
  if (body.qualificationId !== qualification.qualificationId
    || body.case.id !== qualification.case.id
    || body.case.version !== qualification.case.version
    || body.case.digest !== qualification.case.digest) {
    throw new Error("Deterministic probe does not share the exact qualified case identity.");
  }

  const probes = new Map(qualification.probes.map((probe) => [probe.id, probe]));
  const sourceProbes = body.sourceProbeIds.map((id) => {
    const source = probes.get(id);
    if (source === undefined) throw new Error(`Unknown source qualification probe: ${id}`);
    if (source.observedDisposition !== source.expectedDisposition) {
      throw new Error(`Source qualification probe ${id} did not confirm its expected disposition.`);
    }
    return source;
  });
  if (!sourceProbes.some(({ kind }) => kind === "false-positive")
    || !sourceProbes.some(({ kind }) => kind === "false-negative")) {
    throw new Error(
      "Probe promotion requires both false-positive and false-negative semantic source probes.",
    );
  }

  const candidates = new Map(qualification.candidates.map((candidate) => [candidate.id, candidate]));
  for (const control of body.controls) {
    const candidate = candidates.get(control.candidateId);
    if (candidate === undefined) {
      throw new Error(`Unknown deterministic probe control: ${control.candidateId}`);
    }
    const expected = candidate.classification === "known-bad"
      ? "fail"
      : candidate.classification === "valid-alternative"
        ? "pass"
        : undefined;
    if (expected === undefined || control.expectedOutcome !== expected) {
      throw new Error(
        `Control ${control.candidateId} must map known-bad to fail or valid-alternative to pass.`,
      );
    }
    if (!sourceProbes.some(({ candidateId }) => candidateId === candidate.id)) {
      throw new Error(
        `Control ${candidate.id} must be backed by one of the selected semantic source probes.`,
      );
    }
    const artifactPath = containedPath(dirname(qualificationPath), candidate.artifact.path);
    const digest = await artifactTreeDigest(artifactPath);
    if (digest !== candidate.artifact.digest) {
      throw new Error(
        `Control ${candidate.id} artifact digest changed; expected ${candidate.artifact.digest}, observed ${digest}.`,
      );
    }
  }

  const probe = createDeterministicProbe(body);
  const defaultOut = draftPath.replace(/(?:-draft)?\.(?:json|ya?ml)$/i, ".json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(probe, null, 2)}\n`, "utf8");
  return { probe, path };
}

export async function runDeterministicProbe(options: {
  probe: string;
  qualification: string;
  createdAt: string;
  out?: string;
  allowUnsandboxed?: boolean;
}): Promise<{ result: DeterministicProbeResult; path: string }> {
  const probePath = resolve(options.probe);
  const qualificationPath = resolve(options.qualification);
  const probe = parseDeterministicProbe(
    JSON.parse(await readFile(probePath, "utf8")) as unknown,
  );
  const qualification = parseCaseQualification(
    JSON.parse(await readFile(qualificationPath, "utf8")) as unknown,
  );
  if (qualification.qualificationId !== probe.qualificationId) {
    throw new Error("Probe and qualification IDs do not match.");
  }
  const executable = probe.command.argv[0]!;
  if (!ALLOWED_PROBE_EXECUTABLES.has(executable)) {
    throw new Error(
      `Probe uses unsupported executable ${JSON.stringify(executable)}. `
      + `Allowed executables: ${[...ALLOWED_PROBE_EXECUTABLES].toSorted().join(", ")}.`,
    );
  }

  const sandbox = verificationSandbox(options.allowUnsandboxed === true);
  const candidates = new Map(qualification.candidates.map((candidate) => [candidate.id, candidate]));
  const executions: Array<{
    candidateId: string;
    artifactDigest: `sha256:${string}`;
    expectedOutcome: "pass" | "fail";
    observedOutcome: "pass" | "fail" | "timed-out";
    matchesExpectation: boolean;
    startedAt: string;
    finishedAt: string;
    sandbox: "darwin-sandbox-exec" | "unsandboxed";
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> = [];

  for (const control of probe.controls) {
    const candidate = candidates.get(control.candidateId);
    if (candidate === undefined) throw new Error(`Qualification lacks control ${control.candidateId}.`);
    const sourcePath = containedPath(dirname(qualificationPath), candidate.artifact.path);
    const observedDigest = await artifactTreeDigest(sourcePath);
    if (observedDigest !== candidate.artifact.digest) {
      throw new Error(`Control ${candidate.id} no longer matches its qualified artifact digest.`);
    }
    if (!(await lstat(sourcePath)).isDirectory()) {
      throw new Error(`Executable deterministic probe controls must be directory trees: ${candidate.id}`);
    }

    const temporaryRoot = await realpath(await mkdtemp(resolve(tmpdir(), "seedspec-probe-")));
    const candidateRoot = resolve(temporaryRoot, "candidate");
    try {
      await cp(sourcePath, candidateRoot, { recursive: true, errorOnExist: true });
      const cwd = probe.command.cwd === undefined
        ? candidateRoot
        : containedPath(candidateRoot, probe.command.cwd);
      const startedAt = new Date().toISOString();
      const invocation = sandboxInvocation(
        sandbox,
        executable,
        probe.command.argv.slice(1),
        temporaryRoot,
      );
      let observedOutcome: "pass" | "fail" | "timed-out" = "pass";
      let exitCode: number | null = 0;
      let stdout = "";
      let stderr = "";
      try {
        stdout = execFileSync(invocation.executable, invocation.args, {
          cwd,
          encoding: "utf8",
          timeout: probe.command.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
          env: verificationEnvironment(temporaryRoot),
        });
      } catch (error) {
        const failure = executableError(error);
        observedOutcome = failure.timedOut ? "timed-out" : "fail";
        exitCode = failure.exitCode;
        stdout = failure.stdout;
        stderr = failure.stderr;
      }
      executions.push({
        candidateId: candidate.id,
        artifactDigest: candidate.artifact.digest,
        expectedOutcome: control.expectedOutcome,
        observedOutcome,
        matchesExpectation: observedOutcome === control.expectedOutcome,
        startedAt,
        finishedAt: new Date().toISOString(),
        sandbox,
        exitCode,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  const status = executions.some(({ observedOutcome }) => observedOutcome === "timed-out")
    ? "inconclusive" as const
    : executions.every(({ matchesExpectation }) => matchesExpectation)
      ? "passed" as const
      : "failed" as const;
  const result = createDeterministicProbeResult({
    schemaVersion: 1,
    probeId: probe.probeId,
    qualificationId: qualification.qualificationId,
    createdAt: options.createdAt,
    executions,
    status,
    limitations: [
      "A matched exit status establishes the declared seam behavior, not the absence of unrelated defects.",
      "Every promoted probe must retain both a known-bad rejection control and a valid-alternative acceptance control.",
      sandbox === "darwin-sandbox-exec"
        ? "Commands ran against disposable copies in a loopback-only macOS sandbox."
        : "Commands ran unsandboxed only after explicit approval for an externally isolated environment.",
    ],
  });
  const defaultOut = probePath.replace(/\.json$/i, "-result.json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { result, path };
}

function verificationSandbox(allowUnsandboxed: boolean): "darwin-sandbox-exec" | "unsandboxed" {
  if (process.platform === "darwin") return "darwin-sandbox-exec";
  if (allowUnsandboxed) return "unsandboxed";
  throw new Error(
    "No supported operating-system probe sandbox is available. Use an isolated disposable environment "
    + "and pass --allow-unsandboxed only when that external isolation is in place.",
  );
}

function sandboxInvocation(
  sandbox: "darwin-sandbox-exec" | "unsandboxed",
  executable: string,
  args: readonly string[],
  temporaryRoot: string,
): { executable: string; args: readonly string[] } {
  if (sandbox === "unsandboxed") return { executable, args };
  return {
    executable: "/usr/bin/sandbox-exec",
    args: ["-p", darwinVerificationSandboxProfile(temporaryRoot), executable, ...args],
  };
}

function verificationEnvironment(temporaryRoot: string): NodeJS.ProcessEnv {
  return {
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
  };
}

function containedPath(root: string, requested: string): string {
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Deterministic probe path escapes its bound artifact tree: ${requested}`);
  }
  return path;
}

function parseStructuredDocument(source: string, path: string): unknown {
  if (extname(path).toLowerCase() === ".json") return JSON.parse(source) as unknown;
  const document = parseDocument(source, {
    prettyErrors: true,
    schema: "core",
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map(({ message }) => message).join("; "));
  }
  return document.toJS({ maxAliasCount: 0 }) as unknown;
}

function truncateOutput(output: string): string {
  return output.length <= 32_000
    ? output
    : `${output.slice(0, 31_900)}\n...[truncated by deterministic probe runner]`;
}

function executableError(error: unknown): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
} {
  if (typeof error !== "object" || error === null) {
    return { exitCode: null, stdout: "", stderr: String(error), timedOut: false };
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
      : error instanceof Error ? error.message : "Probe command failed without string stderr.",
    timedOut: record.killed === true || record.signal === "SIGTERM",
  };
}
