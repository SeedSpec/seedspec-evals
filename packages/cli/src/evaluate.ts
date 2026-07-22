import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  ArtifactManifestSchema,
  RunManifestSchema,
  ScorecardSchema,
  createArtifact,
  sha256Hex,
  type Artifact,
  type ArtifactManifest,
  type RunManifest,
  type Scorecard,
} from "@seedspec/eval-core";
import {
  evaluateDeterministically,
  type DeterministicCheckAdapter,
} from "@seedspec/evaluators";

export interface DeterministicEvaluationResult {
  readonly manifest: ArtifactManifest;
  readonly scorecard: Extract<Scorecard, { readonly kind: "deterministic" }>;
  readonly artifactManifestPath: string;
  readonly scorecardPath: string;
}

export async function evaluateRunDirectoryDeterministically(options: {
  runDirectory: string;
  caseRoot: string;
  seedSpecCli: string;
  createdAt: string;
}): Promise<DeterministicEvaluationResult> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown);
  const cases = await loadCaseLibrary(resolve(options.caseRoot));
  const loaded = cases.find(({ case: evaluationCase }) =>
    evaluationCase.id === manifest.case.id && evaluationCase.version === manifest.case.version);
  if (loaded === undefined) throw new Error(`Case ${manifest.case.id}@${manifest.case.version} was not found under ${options.caseRoot}.`);
  const caseSource = await readFile(loaded.filePath, "utf8");
  const caseDigest = `sha256:${sha256Hex(caseSource)}`;
  if (caseDigest !== manifest.case.digest) throw new Error("The case file no longer matches the immutable run manifest digest.");

  const workspace = resolve(runDirectory, "workspace");
  const artifacts = await inventoryRunEvidence(runDirectory, workspace, manifest);
  const artifactManifest = ArtifactManifestSchema.parse({ schemaVersion: 1, runId: manifest.runId, artifacts });
  const adapters = ["raw-source", "markdown-authored"].includes(manifest.variant)
    ? []
    : packageValidationAdapters(workspace, resolve(options.seedSpecCli), artifacts);
  const scorecard = evaluateDeterministically({
    manifest,
    evaluationCase: loaded.case,
    artifacts: artifactManifest,
    stage: manifest.target.stage,
    createdAt: options.createdAt,
    adapters,
  });
  const artifactManifestPath = resolve(runDirectory, "artifact-manifest.json");
  const scorecardPath = resolve(runDirectory, "deterministic-scorecard.json");
  await Promise.all([
    writeFile(artifactManifestPath, `${JSON.stringify(artifactManifest, null, 2)}\n`, "utf8"),
    writeFile(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`, "utf8"),
  ]);
  return { manifest: artifactManifest, scorecard, artifactManifestPath, scorecardPath };
}

export async function validateScorecardFile(file: string): Promise<Scorecard> {
  return ScorecardSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
}

export async function buildRubricEvaluationBrief(options: {
  runDirectory: string;
  caseRoot: string;
  runner: "codex" | "claude-code";
  judgeModel: string;
  evaluationRepositoryRoot: string;
  evaluationCliEntry: string;
  out?: string;
}): Promise<{ path: string; brief: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown);
  const cases = await loadCaseLibrary(resolve(options.caseRoot));
  const loaded = cases.find(({ case: evaluationCase }) =>
    evaluationCase.id === manifest.case.id && evaluationCase.version === manifest.case.version);
  if (loaded === undefined) throw new Error(`Case ${manifest.case.id}@${manifest.case.version} was not found.`);
  const outputPath = resolve(options.out ?? resolve(runDirectory, "rubric-evaluation-handoff.md"));
  const scorecardPath = resolve(runDirectory, "rubric-scorecard.json");
  const brief = [
    "# Independent SeedSpec authorship evaluation",
    "",
    `Use ${options.runner === "codex" ? "Codex" : "Claude Code"} with the exact judge model \`${options.judgeModel}\`. Evaluate this run; do not edit its output.`,
    "",
    "## Subject",
    "",
    `- Run: \`${manifest.runId}\``,
    `- Case: \`${manifest.case.id}@${manifest.case.version}\``,
    `- Stage: \`${manifest.target.stage}\``,
    `- Evaluation variant: \`${manifest.variant}\``,
    `- Protocol: \`${manifest.protocol.version}\` (\`${manifest.protocol.revision ?? "revision-unavailable"}\`)`,
    "",
    "## Evidence to inspect",
    "",
    `- Full evaluation case, including evaluator-only expectations: \`${loaded.filePath}\``,
    `- Run identity and tool contract: \`${resolve(runDirectory, "run-manifest.json")}\``,
    `- Original runnable case envelope: \`${resolve(runDirectory, "source-envelope.json")}\``,
    `- Authored output: \`${resolve(runDirectory, "workspace")}\``,
    `- Runner report: \`${resolve(runDirectory, "report.md")}\``,
    `- Observable trace: \`${resolve(runDirectory, "trace.json")}\``,
    `- Artifact identities: \`${resolve(runDirectory, "artifact-manifest.json")}\``,
    `- Deterministic checks: \`${resolve(runDirectory, "deterministic-scorecard.json")}\``,
    `- Evaluation procedure: \`${resolve(options.evaluationRepositoryRoot, "skills/evaluate-seedspec-authorship/SKILL.md")}\``,
    `- Rubric: \`${resolve(options.evaluationRepositoryRoot, "skills/evaluate-seedspec-authorship/references/rubric.md")}\``,
    `- Canonical output contract: \`${resolve(options.evaluationRepositoryRoot, "skills/evaluate-seedspec-authorship/references/output.md")}\``,
    "",
    "Keep protocol validity separate from semantic quality. Score the common outcome contract fairly across variants; do not award points merely because an output uses SeedSpec vocabulary or has more files.",
    `Write the one canonical rubric scorecard to \`${scorecardPath}\`, then validate it with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate scorecard ${JSON.stringify(scorecardPath)}\`.`,
  ].join("\n");
  await writeFile(outputPath, `${brief}\n`, "utf8");
  return { path: outputPath, brief };
}

async function inventoryRunEvidence(runDirectory: string, workspace: string, manifest: RunManifest): Promise<Artifact[]> {
  const workspaceStat = await lstat(workspace).catch(() => null);
  if (workspaceStat === null || !workspaceStat.isDirectory()) throw new Error(`Run workspace is missing: ${workspace}`);
  const files: string[] = [];
  await collectFiles(workspace, workspace, files);
  const kind = manifest.target.stage === "implementation"
    ? "implementation"
    : ["raw-source", "markdown-authored"].includes(manifest.variant)
      ? "authored-instructions"
      : "authored-package";
  const workspaceArtifacts = await Promise.all(files.toSorted().map(async (file) => {
    const path = relative(workspace, file).split(sep).join("/");
    return fileArtifact(file, path, kind, manifest);
  }));
  const authoredInputArtifacts: Artifact[] = [];
  if (manifest.target.stage === "implementation") {
    const inputRoot = resolve(runDirectory, "input", "authored");
    const inputFiles: string[] = [];
    const inputStat = await lstat(inputRoot).catch(() => null);
    if (inputStat?.isDirectory() !== true) throw new Error(`Implementation authored input is missing: ${inputRoot}`);
    await collectFiles(inputRoot, inputRoot, inputFiles);
    authoredInputArtifacts.push(...await Promise.all(inputFiles.toSorted().map(async (file) => {
      const path = `input/authored/${relative(inputRoot, file).split(sep).join("/")}`;
      return fileArtifact(file, path, "source", manifest);
    })));
  }
  const evidenceKinds = {
    "run-manifest.json": "source",
    "source-envelope.json": "source",
    "report.md": "log",
    "trace.json": "tool-trace",
    "decision-ledger.json": "tool-trace",
  } as const;
  const evidenceArtifacts: Artifact[] = [];
  for (const [name, evidenceKind] of Object.entries(evidenceKinds)) {
    const file = resolve(runDirectory, name);
    const fileStat = await lstat(file).catch(() => null);
    if (fileStat?.isFile() === true) {
      evidenceArtifacts.push(await fileArtifact(file, `evidence/${name}`, evidenceKind, manifest));
    }
  }
  return [...authoredInputArtifacts, ...workspaceArtifacts, ...evidenceArtifacts];
}

async function fileArtifact(
  file: string,
  path: string,
  kind: "authored-instructions" | "authored-package" | "implementation" | "source" | "log" | "tool-trace",
  manifest: RunManifest,
): Promise<Artifact> {
    const bytes = await readFile(file);
    const fileStat = await stat(file);
    return createArtifact({
      schemaVersion: 1,
      runId: manifest.runId,
      stage: manifest.target.stage,
      variant: manifest.variant,
      kind,
      path,
      mediaType: mediaTypeForPath(path),
      byteLength: bytes.byteLength,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      createdAt: fileStat.mtime.toISOString(),
      provenance: {
        case: manifest.case,
        variant: manifest.variant,
        protocol: manifest.protocol,
        runner: manifest.runner,
        model: manifest.model,
        harness: manifest.harness,
        ...(manifest.authoringTool === undefined ? {} : { authoringTool: manifest.authoringTool }),
        tools: [...manifest.tools],
        evaluators: [...manifest.evaluators],
      },
    });
}

async function collectFiles(root: string, directory: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not permitted in evaluated output: ${relative(root, path)}`);
    if (entry.isDirectory()) await collectFiles(root, path, files);
    else if (entry.isFile()) files.push(path);
  }
}

function packageValidationAdapters(
  workspace: string,
  seedSpecCli: string,
  artifacts: readonly Artifact[],
): DeterministicCheckAdapter[] {
  const ids = ["seedspec.package.valid", "seedspec.package.feature-valid", "seedspec.package.workflow-valid"];
  return ids.map((id) => ({
    id,
    description: "The authored SeedSpec package passes the frozen canonical CLI validator.",
    evaluate: () => {
      try {
        const output = execFileSync(process.execPath, [seedSpecCli, "validate", workspace], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
        }).trim();
        const manifestArtifact = artifacts.find(({ path }) => path === "seedspec.yaml");
        return {
          outcome: "pass" as const,
          message: output,
          evidence: manifestArtifact === undefined ? [] : [{ artifactId: manifestArtifact.artifactId, path: manifestArtifact.path }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { outcome: "fail" as const, message: `Canonical validation failed: ${message.slice(0, 4_000)}`, evidence: [] };
      }
    },
  }));
}

function mediaTypeForPath(path: string): string {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "application/yaml";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}
