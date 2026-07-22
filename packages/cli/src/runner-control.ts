import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

import {
  RunManifestSchema,
  sha256Hex,
  stableJson,
  type RunManifest,
} from "@seedspec/eval-core";
import { z } from "zod";

import type { ExecutionEnvelope } from "./contracts.js";

const ControlIdSchema = z.string().regex(/^control_[a-f0-9]{64}$/);
const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const DesktopSourceEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("desktop-runner-source"),
  sourceRunId: z.string().regex(/^run_[a-f0-9]{64}$/),
  desktopRunId: z.string().regex(/^run_[a-f0-9]{64}$/),
  case: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
    digest: DigestSchema,
  }),
  stage: z.enum(["authorship", "implementation"]),
  variant: z.enum([
    "source-only",
    "seedspec-scaffold",
    "seedspec-guided-authoring",
    "seedspec-implementation",
  ]),
  model: z.string().min(1),
  trustedInstructions: z.array(z.string().min(1)),
  untrustedMaterial: z.string().min(1),
  availableAuthorQuestionIds: z.array(z.string().min(1)).max(128),
  authorControl: z.strictObject({
    id: ControlIdSchema,
    responsesDigest: DigestSchema,
  }),
});

const DesktopControlRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  controlId: ControlIdSchema,
  sourceRunId: z.string().regex(/^run_[a-f0-9]{64}$/),
  desktopRunId: z.string().regex(/^run_[a-f0-9]{64}$/),
  responsesDigest: DigestSchema,
  simulatedAuthorResponses: z.record(z.string().min(1), z.string().min(1)),
});

export type DesktopSourceEnvelope = z.infer<typeof DesktopSourceEnvelopeSchema>;
type DesktopControlRecord = z.infer<typeof DesktopControlRecordSchema>;

export async function createDesktopControl(
  envelope: ExecutionEnvelope,
  desktopManifest: RunManifest,
  options: { readonly controlDirectory?: string } = {},
): Promise<DesktopSourceEnvelope> {
  const controlId = `control_${randomBytes(32).toString("hex")}`;
  const responses = envelope.submission.config.simulatedAuthorResponses;
  const responsesDigest = digestResponses(responses);
  const expectedDigest = envelope.manifest.configuration?.["simulatedAuthorResponsesDigest"];
  if (responsesDigest !== expectedDigest) {
    throw new Error("Simulated-author responses do not match the immutable run manifest.");
  }
  const record = DesktopControlRecordSchema.parse({
    schemaVersion: 1,
    controlId,
    sourceRunId: envelope.manifest.runId,
    desktopRunId: desktopManifest.runId,
    responsesDigest,
    simulatedAuthorResponses: responses,
  });
  const root = controlRoot(options.controlDirectory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await writeFile(controlPath(record.controlId, options.controlDirectory), `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return DesktopSourceEnvelopeSchema.parse({
    schemaVersion: 1,
    kind: "desktop-runner-source",
    sourceRunId: envelope.manifest.runId,
    desktopRunId: desktopManifest.runId,
    case: desktopManifest.case,
    stage: envelope.submission.config.stage,
    variant: envelope.submission.config.variant,
    model: envelope.submission.config.model,
    trustedInstructions: envelope.submission.config.trustedInstructions,
    untrustedMaterial: envelope.submission.config.untrustedMaterial,
    availableAuthorQuestionIds: Object.keys(responses).sort(),
    authorControl: { id: record.controlId, responsesDigest },
  });
}

export async function answerDesktopAuthorQuestion(
  sourceEnvelopeFile: string,
  questionId: string,
  options: { readonly controlDirectory?: string } = {},
): Promise<{ answered: boolean; questionId: string; answer: string | null }> {
  const source = DesktopSourceEnvelopeSchema.parse(
    JSON.parse(await readFile(resolve(sourceEnvelopeFile), "utf8")) as unknown,
  );
  const control = await loadControl(source.authorControl.id, options.controlDirectory);
  assertControlMatchesSource(control, source);
  const answered = Object.prototype.hasOwnProperty.call(control.simulatedAuthorResponses, questionId);
  return {
    answered,
    questionId,
    answer: answered ? control.simulatedAuthorResponses[questionId] ?? null : null,
  };
}

export type RunnerPreflightResult = {
  readonly ready: boolean;
  readonly runDirectory: string;
  readonly runId: string | null;
  readonly sourceRunId: string | null;
  readonly checks: ReadonlyArray<{ id: string; passed: boolean; message: string }>;
};

export async function preflightDesktopRunner(
  runDirectory: string,
  evaluationRepositoryRoot: string,
  options: { readonly workingDirectory?: string; readonly controlDirectory?: string } = {},
): Promise<RunnerPreflightResult> {
  const directory = resolve(runDirectory);
  const checks: Array<{ id: string; passed: boolean; message: string }> = [];
  const outsideRepository = !pathIsWithin(resolve(evaluationRepositoryRoot), directory);
  checks.push({
    id: "isolated-directory",
    passed: outsideRepository,
    message: outsideRepository
      ? "Runner directory is outside the evaluation repository."
      : "Runner directory must be outside the evaluation repository so case controls are not model-readable.",
  });
  const currentDirectoryMatches = resolve(options.workingDirectory ?? process.cwd()) === directory;
  checks.push({
    id: "working-directory",
    passed: currentDirectoryMatches,
    message: currentDirectoryMatches
      ? "Current working directory is the isolated runner directory."
      : "Open the runner directory as the task project before starting.",
  });

  let source: DesktopSourceEnvelope | null = null;
  try {
    source = DesktopSourceEnvelopeSchema.parse(
      JSON.parse(await readFile(resolve(directory, "source-envelope.json"), "utf8")) as unknown,
    );
    checks.push({ id: "runner-source", passed: true, message: "Runner-safe source envelope is valid." });
  } catch {
    checks.push({ id: "runner-source", passed: false, message: "Runner-safe source envelope is missing or invalid." });
  }

  let manifest: RunManifest | null = null;
  try {
    manifest = RunManifestSchema.parse(
      JSON.parse(await readFile(resolve(directory, "run-manifest.json"), "utf8")) as unknown,
    );
    checks.push({ id: "run-manifest", passed: true, message: "Desktop run manifest is valid." });
  } catch {
    checks.push({ id: "run-manifest", passed: false, message: "Desktop run manifest is missing or invalid." });
  }

  let control: DesktopControlRecord | null = null;
  if (source !== null) {
    try {
      control = await loadControl(source.authorControl.id, options.controlDirectory);
      assertControlMatchesSource(control, source);
      checks.push({ id: "author-control", passed: true, message: "One-at-a-time author broker is available." });
    } catch {
      checks.push({ id: "author-control", passed: false, message: "Author broker control is unavailable or does not match this run." });
    }
  }

  const identityMatches = source !== null && manifest !== null && source.desktopRunId === manifest.runId;
  checks.push({
    id: "identity-binding",
    passed: identityMatches,
    message: identityMatches ? "Runner source and manifest identities match." : "Runner source and manifest identities do not match.",
  });

  const outputPaths = ["workspace", "report.md", "trace-draft.json", "trace.json"];
  const presentOutputs: string[] = [];
  for (const path of outputPaths) {
    if (await pathExists(resolve(directory, path))) presentOutputs.push(path);
  }
  checks.push({
    id: "clean-output",
    passed: presentOutputs.length === 0,
    message: presentOutputs.length === 0
      ? "No evaluated output exists yet."
      : `Evaluated output already exists: ${presentOutputs.join(", ")}. Generate a fresh run identity.`,
  });

  if (control !== null) {
    const leakedFiles = await filesContainingResponses(directory, Object.values(control.simulatedAuthorResponses));
    checks.push({
      id: "response-isolation",
      passed: leakedFiles.length === 0,
      message: leakedFiles.length === 0
        ? "No protected author response is present in runner-visible files."
        : `Protected author responses appear in ${String(leakedFiles.length)} runner-visible file(s). Generate a new kit.`,
    });
  } else {
    checks.push({ id: "response-isolation", passed: false, message: "Response isolation could not be verified without the author control." });
  }

  return {
    ready: checks.every((check) => check.passed),
    runDirectory: directory,
    runId: manifest?.runId ?? null,
    sourceRunId: source?.sourceRunId ?? null,
    checks,
  };
}

export function assertExternalRunnerDirectory(directory: string, evaluationRepositoryRoot: string): void {
  if (pathIsWithin(resolve(evaluationRepositoryRoot), resolve(directory))) {
    throw new Error("Desktop runner kits cannot be created inside the evaluation repository. Use an isolated directory outside seedspec-evals.");
  }
}

export async function assertEmptyRunnerDirectory(directory: string): Promise<void> {
  try {
    const entries = await readdir(directory);
    if (entries.length > 0) throw new Error(`Runner directory is not empty: ${directory}`);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
}

export function desktopRunnerWrapper(cliEntryPath: string): string {
  return [
    "#!/usr/bin/env node",
    'import { spawnSync } from "node:child_process";',
    "",
    `const cli = ${JSON.stringify(resolve(cliEntryPath))};`,
    'const action = process.argv[2];',
    'const rest = process.argv.slice(3);',
    'const commands = {',
    '  preflight: ["runner", "preflight", "."],',
    '  answer: ["author", "answer", "source-envelope.json", ...rest],',
    '  "finalize-trace": ["trace", "finalize", "trace-draft.json"],',
    '};',
    'const args = commands[action];',
    'if (args === undefined) {',
    '  process.stderr.write("Usage: node runner-control.mjs preflight | answer --question <id> | finalize-trace\\n");',
    '  process.exit(2);',
    '}',
    'const result = spawnSync(process.execPath, [cli, ...args], { cwd: process.cwd(), env: process.env, stdio: "inherit" });',
    'if (result.error !== undefined) throw result.error;',
    'process.exit(result.status ?? 1);',
    "",
  ].join("\n");
}

function controlRoot(override?: string): string {
  if (override !== undefined) return resolve(override);
  const configured = process.env["SEEDSPEC_EVAL_CONTROL_DIR"];
  return configured === undefined
    ? resolve(homedir(), ".seedspec-evals", "control")
    : resolve(configured);
}

function controlPath(controlId: string, override?: string): string {
  return resolve(controlRoot(override), `${ControlIdSchema.parse(controlId)}.json`);
}

async function loadControl(controlId: string, override?: string): Promise<DesktopControlRecord> {
  return DesktopControlRecordSchema.parse(
    JSON.parse(await readFile(controlPath(controlId, override), "utf8")) as unknown,
  );
}

function assertControlMatchesSource(control: DesktopControlRecord, source: DesktopSourceEnvelope): void {
  if (
    control.controlId !== source.authorControl.id ||
    control.sourceRunId !== source.sourceRunId ||
    control.desktopRunId !== source.desktopRunId ||
    control.responsesDigest !== source.authorControl.responsesDigest ||
    digestResponses(control.simulatedAuthorResponses) !== source.authorControl.responsesDigest
  ) {
    throw new Error("Author control does not match the runner source envelope.");
  }
}

function digestResponses(responses: Record<string, string>): `sha256:${string}` {
  return `sha256:${sha256Hex(stableJson(responses))}`;
}

function pathIsWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

async function filesContainingResponses(directory: string, responses: readonly string[]): Promise<string[]> {
  const matches: string[] = [];
  const files = await collectFiles(directory);
  for (const file of files) {
    const info = await stat(file);
    if (info.size > 2 * 1024 * 1024) continue;
    const content = await readFile(file, "utf8").catch(() => null);
    if (content !== null && responses.some((response) => response.length > 0 && content.includes(response))) {
      matches.push(relative(directory, file));
    }
  }
  return matches.sort();
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
