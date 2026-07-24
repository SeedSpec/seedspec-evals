import { createHash, randomBytes } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  BlindTechnicalReviewBodySchema,
  ImplementationAcceptanceReportSchema,
  ImplementationVerificationSchema,
  RunManifestSchema,
  attachBlindTechnicalReview,
  contentId,
  createBlindTechnicalEvidence,
  createBlindTechnicalReview,
  parseBlindTechnicalEvidence,
  parseBlindTechnicalReview,
  sha256Hex,
  stableJson,
  type BlindTechnicalReview,
  type JsonValue,
} from "@seedspec/eval-core";

interface BlindTechnicalMap {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly runId: string;
  readonly blindSubjectId: string;
  readonly blindEvidenceId: string;
  readonly authoredInputDigest: string;
  readonly realizationDigest: string;
  readonly viewPath: string;
}

export async function buildBlindTechnicalReviewBrief(options: {
  readonly runDirectory: string;
  readonly runner: "codex" | "claude-code";
  readonly judgeModel: string;
  readonly reasoningEffort: string;
  readonly caseRoot: string;
  readonly evaluationRepositoryRoot: string;
  readonly evaluationCliEntry: string;
  readonly outRoot?: string;
}): Promise<{
  readonly path: string;
  readonly evidencePath: string;
  readonly blindSubjectId: string;
  readonly blindEvidenceId: string;
  readonly viewPath: string;
}> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  if (manifest.target.stage !== "implementation") {
    throw new Error("Treatment-blinded technical review is only valid for implementation runs.");
  }
  const verification = ImplementationVerificationSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "implementation-verification.json"), "utf8")) as unknown,
  );
  if (verification.runId !== manifest.runId) {
    throw new Error("Implementation verification does not share the run identity.");
  }
  const cases = await loadCaseLibrary(resolve(options.caseRoot));
  const matched = cases.find(({ case: evaluationCase }) =>
    evaluationCase.id === manifest.case.id && evaluationCase.version === manifest.case.version);
  if (matched === undefined) throw new Error("The run's evaluation case was not found.");
  const caseSource = await readFile(matched.filePath, "utf8");
  if (`sha256:${sha256Hex(caseSource)}` !== manifest.case.digest) {
    throw new Error("The evaluation case no longer matches the immutable run manifest.");
  }

  const blindSubjectId = contentId("blind_subject", {
    nonce: randomBytes(32).toString("hex"),
  });
  const viewPath = resolve(
    options.outRoot
      ?? resolve(options.evaluationRepositoryRoot, "../..", "agent-eval-runs", "blind-technical"),
    blindSubjectId,
  );
  assertOutsideEvaluationRepository(viewPath, options.evaluationRepositoryRoot);
  if (await exists(viewPath)) {
    throw new Error(`Blind technical review workspace already exists: ${viewPath}`);
  }
  const authoredSource = resolve(runDirectory, "input", "authored");
  const realizationSource = resolve(runDirectory, "workspace", "realization");
  const authoredInputDigest = await treeDigest(authoredSource);
  const realizationDigest = await treeDigest(realizationSource);
  const authoredTarget = resolve(viewPath, "subject", "authored");
  const realizationTarget = resolve(viewPath, "subject", "realization");
  await mkdir(resolve(viewPath, "evidence"), { recursive: true });
  await Promise.all([
    copyTreeWithoutLinks(authoredSource, authoredTarget),
    copyTreeWithoutLinks(realizationSource, realizationTarget),
  ]);

  const guidanceSources = [
    {
      id: "technical-review-skill",
      source: resolve(options.evaluationRepositoryRoot, "skills/review-seedspec-technical-quality/SKILL.md"),
      target: "guidance/review-seedspec-technical-quality/SKILL.md",
    },
    {
      id: "technical-review-output",
      source: resolve(
        options.evaluationRepositoryRoot,
        "skills/review-seedspec-technical-quality/references/output.md",
      ),
      target: "guidance/review-seedspec-technical-quality/references/output.md",
    },
  ];
  const evaluatorGuidance = await Promise.all(guidanceSources.map(async ({ id, source, target }) => {
    const content = await readFile(source, "utf8");
    const output = resolve(viewPath, target);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, content, "utf8");
    return { id, path: target, digest: `sha256:${sha256Hex(content)}` as const };
  }));
  const artifacts = [
    ...(await snapshotFiles(authoredTarget, viewPath, "authored-input")),
    ...(await snapshotFiles(realizationTarget, viewPath, "realization")),
  ];
  const evidence = createBlindTechnicalEvidence({
    schemaVersion: 1,
    blindSubjectId,
    createdAt: new Date().toISOString(),
    evaluatorRequest: {
      runner: options.runner,
      model: options.judgeModel,
      reasoningEffort: options.reasoningEffort,
    },
    technicalExpectations: matched.case.technicalExpectations.map((expectation) => ({
      id: expectation.id,
      dimension: expectation.dimension,
      description: expectation.description,
      method: expectation.method,
      ...(expectation.applicability === undefined
        ? {}
        : { applicability: expectation.applicability }),
    })),
    artifacts,
    verification: {
      reportDigest: verification.reportDigest,
      report: ImplementationAcceptanceReportSchema.parse(verification.report),
      commands: verification.commands.map((command) => ({
        id: command.id,
        argv: [...command.argv],
        ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
        outcome: command.outcome,
        exitCode: command.exitCode,
        stdout: command.stdout,
        stderr: command.stderr,
      })),
      limitations: [...verification.limitations],
    },
    evaluatorGuidance,
    instructions: [
      "Review only this opaque workspace. Do not inspect parent directories, plans, manifests, traces, reports, or other run workspaces.",
      "The subject's treatment, implementing model, runner, token use, duration, and run identity are intentionally unavailable.",
      "Assess the implementation against subject/authored, subject/realization, the independently captured verification record, the fixed technical expectations, and the frozen technical-review guidance.",
      "Do not reward process claims, skill vocabulary, or the mere existence of tests. Require evidence for every assessed dimension and preserve unknowns.",
      "Do not execute adaptation challenges in this review.",
    ],
  });
  const evidencePath = resolve(viewPath, "blind-technical-evidence.json");
  const draftPath = resolve(viewPath, "blind-technical-review-draft.json");
  const reviewPath = resolve(viewPath, "blind-technical-review.json");
  const handoffPath = resolve(viewPath, "blind-technical-review-handoff.md");
  const technicalSkillPath = resolve(
    viewPath,
    "guidance/review-seedspec-technical-quality/SKILL.md",
  );
  const brief = [
    "# Treatment-blinded SeedSpec technical review",
    "",
    `Use ${options.runner === "codex" ? "Codex" : "Claude Code"} with exact evaluator model \`${options.judgeModel}\` and reasoning effort \`${options.reasoningEffort}\`.`,
    "",
    "This workspace deliberately withholds the treatment, implementing model, runner, process trace, cost, and true run identity. Do not inspect any parent or sibling directory to recover them.",
    "",
    "## Procedure",
    "",
    `1. Read \`${technicalSkillPath}\` completely.`,
    `2. Read the content-addressed evidence envelope at \`${evidencePath}\` and inspect only files it lists.`,
    `3. Write a BlindTechnicalReviewBody without a blindReviewId to \`${draftPath}\`. Use blindSubjectId \`${blindSubjectId}\` and blindEvidenceId \`${evidence.blindEvidenceId}\`.`,
    `4. Finalize it with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate technical-blind-finalize ${JSON.stringify(draftPath)} --evidence ${JSON.stringify(evidencePath)} --out ${JSON.stringify(reviewPath)}\`.`,
    "",
    "Produce the complete fixed technical quality vector. Do not emit an overall normalized score or infer missing process facts.",
  ].join("\n");
  await Promise.all([
    writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8"),
    writeFile(handoffPath, `${brief}\n`, "utf8"),
  ]);
  const mapping: BlindTechnicalMap = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    runId: manifest.runId,
    blindSubjectId,
    blindEvidenceId: evidence.blindEvidenceId,
    authoredInputDigest,
    realizationDigest,
    viewPath,
  };
  await writeFile(
    resolve(runDirectory, "blind-technical-map.json"),
    `${JSON.stringify(mapping, null, 2)}\n`,
    "utf8",
  );
  return {
    path: handoffPath,
    evidencePath,
    blindSubjectId,
    blindEvidenceId: evidence.blindEvidenceId,
    viewPath,
  };
}

export async function finalizeBlindTechnicalReviewFile(options: {
  readonly draft: string;
  readonly evidence: string;
  readonly out?: string;
}): Promise<{ readonly review: BlindTechnicalReview; readonly path: string }> {
  const draftPath = resolve(options.draft);
  const evidence = parseBlindTechnicalEvidence(
    JSON.parse(await readFile(resolve(options.evidence), "utf8")) as unknown,
  );
  await verifyBlindEvidenceFiles(resolve(options.evidence), evidence);
  const body = BlindTechnicalReviewBodySchema.parse(
    JSON.parse(await readFile(draftPath, "utf8")) as unknown,
  );
  if (
    body.blindSubjectId !== evidence.blindSubjectId
    || body.blindEvidenceId !== evidence.blindEvidenceId
  ) {
    throw new Error("Blind technical review does not match the content-addressed evidence.");
  }
  if (
    body.evaluator.model?.modelId !== evidence.evaluatorRequest.model
    || body.evaluator.model.parameters.additional?.["reasoningEffort"]
      !== evidence.evaluatorRequest.reasoningEffort
  ) {
    throw new Error("Blind technical review does not record the requested evaluator model and reasoning effort.");
  }
  const review = createBlindTechnicalReview(body);
  const path = resolve(
    options.out
      ?? (draftPath.endsWith("-draft.json")
        ? draftPath.replace(/-draft\.json$/, ".json")
        : resolve(dirname(draftPath), "blind-technical-review.json")),
  );
  await writeFile(path, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  return { review, path };
}

export async function unblindTechnicalReview(options: {
  readonly runDirectory: string;
  readonly review: string;
  readonly createdAt: string;
}): Promise<{ readonly path: string; readonly attachmentId: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown,
  );
  const mapping = parseBlindTechnicalMap(
    JSON.parse(await readFile(resolve(runDirectory, "blind-technical-map.json"), "utf8")) as unknown,
  );
  if (mapping.runId !== manifest.runId) throw new Error("Blind technical map has the wrong run identity.");
  const [authoredInputDigest, realizationDigest] = await Promise.all([
    treeDigest(resolve(runDirectory, "input", "authored")),
    treeDigest(resolve(runDirectory, "workspace", "realization")),
  ]);
  if (
    mapping.authoredInputDigest !== authoredInputDigest
    || mapping.realizationDigest !== realizationDigest
  ) {
    throw new Error("The implementation changed after the blind technical view was created.");
  }
  const review = parseBlindTechnicalReview(
    JSON.parse(await readFile(resolve(options.review), "utf8")) as unknown,
  );
  if (
    review.blindSubjectId !== mapping.blindSubjectId
    || review.blindEvidenceId !== mapping.blindEvidenceId
  ) {
    throw new Error("Blind technical review does not match this run's opaque review mapping.");
  }
  const attachment = attachBlindTechnicalReview({
    runId: manifest.runId,
    createdAt: options.createdAt,
    review,
  });
  const path = resolve(runDirectory, "blind-technical-review.json");
  await writeFile(path, `${JSON.stringify(attachment, null, 2)}\n`, "utf8");
  return { path, attachmentId: attachment.attachmentId };
}

async function copyTreeWithoutLinks(source: string, target: string): Promise<void> {
  await assertTreeHasNoLinks(source);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, errorOnExist: true, preserveTimestamps: false });
}

async function assertTreeHasNoLinks(path: string): Promise<void> {
  const root = await realpath(path);
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const currentStat = await lstat(current);
    if (currentStat.isSymbolicLink()) {
      throw new Error(`Blind review inputs cannot contain symbolic links: ${current}`);
    }
    if (!currentStat.isDirectory()) continue;
    for (const child of await readdir(current)) pending.push(resolve(current, child));
  }
}

async function snapshotFiles(
  root: string,
  viewRoot: string,
  role: "authored-input" | "realization",
): Promise<Array<{
  artifactId: `artifact_${string}`;
  path: string;
  role: "authored-input" | "realization";
  mediaType: string;
  byteLength: number;
  digest: `sha256:${string}`;
}>> {
  const files: Array<{
    artifactId: `artifact_${string}`;
    path: string;
    role: "authored-input" | "realization";
    mediaType: string;
    byteLength: number;
    digest: `sha256:${string}`;
  }> = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const children = (await readdir(current, { withFileTypes: true }))
      .toSorted((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children.toReversed()) {
      const path = resolve(current, child.name);
      if (child.isDirectory()) {
        pending.push(path);
      } else if (child.isFile()) {
        const source = await readFile(path);
        const relativePath = relative(viewRoot, path).split(sep).join("/");
        const digest = `sha256:${createHash("sha256").update(source).digest("hex")}` as const;
        const descriptor = {
          path: relativePath,
          role,
          mediaType: mediaType(path),
          byteLength: source.byteLength,
          digest,
        };
        files.push({
          artifactId: contentId("artifact", descriptor as unknown as JsonValue),
          ...descriptor,
        });
      }
    }
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path, "en"));
}

async function treeDigest(path: string): Promise<`sha256:${string}`> {
  const root = await realpath(path);
  const files = await snapshotTreeForDigest(root);
  return `sha256:${sha256Hex(stableJson(files))}`;
}

async function snapshotTreeForDigest(root: string): Promise<Array<{
  path: string;
  digest: string;
  byteLength: number;
}>> {
  const files: Array<{ path: string; digest: string; byteLength: number }> = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const children = (await readdir(current, { withFileTypes: true }))
      .toSorted((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children.toReversed()) {
      const path = resolve(current, child.name);
      const childStat = await lstat(path);
      if (childStat.isSymbolicLink()) throw new Error(`Blind review inputs cannot contain symbolic links: ${path}`);
      if (childStat.isDirectory()) {
        pending.push(path);
      } else if (childStat.isFile()) {
        const source = await readFile(path);
        files.push({
          path: relative(root, path).split(sep).join("/"),
          digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
          byteLength: source.byteLength,
        });
      }
    }
  }
  return files.toSorted((left, right) => left.path.localeCompare(right.path, "en"));
}

function mediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css": return "text/css";
    case ".html": return "text/html";
    case ".js":
    case ".mjs":
    case ".cjs": return "text/javascript";
    case ".json": return "application/json";
    case ".md": return "text/markdown";
    case ".ts":
    case ".tsx": return "text/typescript";
    case ".yaml":
    case ".yml": return "application/yaml";
    default: return "application/octet-stream";
  }
}

function parseBlindTechnicalMap(input: unknown): BlindTechnicalMap {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Blind technical map is invalid.");
  }
  const map = input as Record<string, unknown>;
  const required = [
    "createdAt",
    "runId",
    "blindSubjectId",
    "blindEvidenceId",
    "authoredInputDigest",
    "realizationDigest",
    "viewPath",
  ];
  if (
    map["schemaVersion"] !== 1
    || required.some((key) => typeof map[key] !== "string")
  ) {
    throw new Error("Blind technical map is invalid.");
  }
  return map as unknown as BlindTechnicalMap;
}

async function verifyBlindEvidenceFiles(
  evidencePath: string,
  evidence: ReturnType<typeof parseBlindTechnicalEvidence>,
): Promise<void> {
  const root = dirname(evidencePath);
  for (const artifact of evidence.artifacts) {
    const path = containedViewPath(root, artifact.path);
    const artifactStat = await lstat(path);
    if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
      throw new Error(`Blind evidence artifact is not a regular file: ${artifact.path}`);
    }
    const source = await readFile(path);
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    if (digest !== artifact.digest || source.byteLength !== artifact.byteLength) {
      throw new Error(`Blind evidence artifact changed after the view was created: ${artifact.path}`);
    }
  }
  for (const guidance of evidence.evaluatorGuidance) {
    const path = containedViewPath(root, guidance.path);
    const guidanceStat = await lstat(path);
    if (guidanceStat.isSymbolicLink() || !guidanceStat.isFile()) {
      throw new Error(`Blind evaluator guidance is not a regular file: ${guidance.path}`);
    }
    const source = await readFile(path);
    const digest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    if (digest !== guidance.digest) {
      throw new Error(`Blind evaluator guidance changed after the view was created: ${guidance.path}`);
    }
  }
}

function containedViewPath(root: string, requested: string): string {
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Blind evidence path escapes its opaque workspace: ${requested}`);
  }
  return path;
}

function assertOutsideEvaluationRepository(
  viewPath: string,
  evaluationRepositoryRoot: string,
): void {
  const fromRepository = relative(resolve(evaluationRepositoryRoot), resolve(viewPath));
  if (fromRepository === "" || (!fromRepository.startsWith(`..${sep}`) && fromRepository !== "..")) {
    throw new Error(
      "Blind technical review workspaces must be created outside the evaluation repository.",
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
