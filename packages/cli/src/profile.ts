import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  DecisionLedgerBodySchema,
  EvaluationProfileBodySchema,
  createDecisionLedger,
  createEvaluationProfile,
  parseEvaluationProfile,
  parseDecisionLedger,
  summarizeEvaluationProfile,
  type EvaluationProfile,
  type DecisionLedger,
} from "@seedspec/eval-core";

export async function finalizeDecisionLedgerFile(options: {
  draft: string;
  out?: string;
}): Promise<{ ledger: DecisionLedger; path: string }> {
  const draftPath = resolve(options.draft);
  const body = DecisionLedgerBodySchema.parse(JSON.parse(await readFile(draftPath, "utf8")) as unknown);
  const ledger = createDecisionLedger(body);
  const defaultOut = draftPath.endsWith("-draft.json")
    ? draftPath.replace(/-draft\.json$/, ".json")
    : resolve(dirname(draftPath), "decision-ledger.json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return { ledger, path };
}

export async function validateDecisionLedgerFile(file: string): Promise<DecisionLedger> {
  return parseDecisionLedger(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
}

export async function finalizeEvaluationProfileFile(options: {
  draft: string;
  out?: string;
}): Promise<{ profile: EvaluationProfile; path: string }> {
  const draftPath = resolve(options.draft);
  const body = EvaluationProfileBodySchema.parse(JSON.parse(await readFile(draftPath, "utf8")) as unknown);
  const profile = createEvaluationProfile(body);
  const defaultOut = draftPath.endsWith("-draft.json")
    ? draftPath.replace(/-draft\.json$/, ".json")
    : resolve(dirname(draftPath), "evaluation-profile.json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return { profile, path };
}

export async function validateEvaluationProfileFile(file: string): Promise<EvaluationProfile> {
  return parseEvaluationProfile(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
}

export function formatEvaluationProfile(profile: EvaluationProfile): string {
  const summary = summarizeEvaluationProfile(profile);
  const lines = [
    `Evaluation profile: ${profile.profileId}`,
    `Stage: ${profile.subject.stage}`,
    ...(profile.subject.variant === undefined ? [] : [`Variant: ${profile.subject.variant}`]),
    ...(profile.subject.runId === undefined ? [] : [`Run: ${profile.subject.runId}`]),
    ...(profile.subject.package === undefined ? [] : [`Package digest: ${profile.subject.package.digest}`]),
    "",
    "Decision landscape:",
    `- ${String(summary.decisions.total)} consequential decisions: ${String(summary.decisions.critical)} critical, ${String(summary.decisions.material)} material, ${String(summary.decisions.minor)} minor`,
    `- ${String(summary.decisions.delegatedOrOpen)} deliberately delegated or open`,
    `- ${String(summary.decisions.unresolved)} unresolved`,
    `- ${String(summary.decisions.ambientMaterial)} observed ambient material decisions`,
    `- ${String(summary.decisions.lowConfidence)} low-confidence attributions`,
    "",
    "Obligation-to-evidence coverage:",
    `- ${String(summary.obligations.total)} obligations: ${String(summary.obligations.covered)} covered, ${String(summary.obligations.partial)} partial, ${String(summary.obligations.uncovered)} uncovered, ${String(summary.obligations.unknown)} unknown`,
    `- ${String(summary.obligations.distinguishingNoOrUnknown)} lack confirmed distinguishing evidence`,
    "",
    `Structure findings: ${String(summary.structure.total)} total, ${String(summary.structure.material)} material`,
  ];
  if (summary.technical !== undefined) {
    lines.push(
      "",
      "Technical evaluation:",
      `- ${String(summary.technical.checks)} checks: ${String(summary.technical.pass)} pass, ${String(summary.technical.fail)} fail, ${String(summary.technical.concern)} concern, ${String(summary.technical.unknown)} unknown`,
      `- ${String(summary.technical.adaptationChallenges)} adaptation challenges`,
    );
  }
  lines.push(
    "",
    "This profile is descriptive. It does not rank author control, delegated agent freedom, or token use as inherently good or bad.",
  );
  return lines.join("\n");
}

export async function buildPackageProfileBrief(options: {
  packagePath: string;
  runner: "codex" | "claude-code";
  judgeModel: string;
  seedSpecCli: string;
  evaluationRepositoryRoot: string;
  evaluationCliEntry: string;
  out?: string;
}): Promise<{ path: string; brief: string; subjectPath: string }> {
  const packagePath = resolve(options.packagePath);
  const seedSpecCli = resolve(options.seedSpecCli);
  const inspection = JSON.parse(execFileSync(process.execPath, [seedSpecCli, "inspect", packagePath, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  })) as { id?: unknown; version?: unknown; digest?: unknown; kind?: unknown };
  if (typeof inspection.id !== "string" || typeof inspection.version !== "string"
    || typeof inspection.digest !== "string" || typeof inspection.kind !== "string") {
    throw new Error("SeedSpec inspection did not return a valid package identity.");
  }
  const defaultRoot = `${packagePath}.seedspec-evaluation`;
  const path = resolve(options.out ?? resolve(defaultRoot, "profile-handoff.md"));
  const subjectPath = resolve(dirname(path), "profile-subject.json");
  const draftPath = resolve(dirname(path), "evaluation-profile-draft.json");
  const finalPath = resolve(dirname(path), "evaluation-profile.json");
  const subject = {
    stage: "authorship",
    package: {
      id: inspection.id,
      version: inspection.version,
      digest: inspection.digest,
      path: packagePath,
    },
    kind: inspection.kind,
  };
  const brief = profileBrief({
    title: "SeedSpec package evaluation profile",
    runner: options.runner,
    judgeModel: options.judgeModel,
    evidence: [
      `Package to inspect without editing: \`${packagePath}\``,
      `Validated package identity: \`${subjectPath}\``,
    ],
    stage: "authorship",
    subjectPath,
    draftPath,
    finalPath,
    evaluationRepositoryRoot: options.evaluationRepositoryRoot,
    evaluationCliEntry: options.evaluationCliEntry,
  });
  await mkdir(dirname(path), { recursive: true });
  await Promise.all([
    writeFile(path, `${brief}\n`, "utf8"),
    writeFile(subjectPath, `${JSON.stringify(subject, null, 2)}\n`, "utf8"),
  ]);
  return { path, brief, subjectPath };
}

export async function buildRunProfileBrief(options: {
  runDirectory: string;
  runner: "codex" | "claude-code";
  judgeModel: string;
  evaluationRepositoryRoot: string;
  evaluationCliEntry: string;
  caseRoot?: string;
  out?: string;
}): Promise<{ path: string; brief: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as {
    runId?: unknown;
    target?: { stage?: unknown };
  };
  if (typeof manifest.runId !== "string"
    || (manifest.target?.stage !== "authorship" && manifest.target?.stage !== "implementation")) {
    throw new Error("Run manifest does not identify a valid run and stage.");
  }
  const path = resolve(options.out ?? resolve(runDirectory, "profile-evaluation-handoff.md"));
  const draftPath = resolve(runDirectory, "evaluation-profile-draft.json");
  const finalPath = resolve(runDirectory, "evaluation-profile.json");
  const evidence = [
    `Run manifest: \`${resolve(runDirectory, "run-manifest.json")}\``,
    `Source envelope: \`${resolve(runDirectory, "source-envelope.json")}\``,
    `Evaluated workspace: \`${resolve(runDirectory, "workspace")}\``,
    `Observable trace: \`${resolve(runDirectory, "trace.json")}\``,
    `Artifact manifest: \`${resolve(runDirectory, "artifact-manifest.json")}\``,
    `Runner report: \`${resolve(runDirectory, "report.md")}\``,
    `Implementing-agent decision ledger when present: \`${resolve(runDirectory, "decision-ledger.json")}\``,
  ];
  if (options.caseRoot !== undefined) {
    const fullManifest = JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as {
      case?: { id?: unknown; version?: unknown };
    };
    const cases = await loadCaseLibrary(resolve(options.caseRoot));
    const matched = cases.find(({ case: evaluationCase }) =>
      evaluationCase.id === fullManifest.case?.id && evaluationCase.version === fullManifest.case?.version);
    if (matched === undefined) throw new Error("The run's evaluation case was not found under the supplied case root.");
    evidence.push(`Full evaluator-only case, including technical expectations and authorized adaptation challenges: \`${matched.filePath}\``);
  }
  const brief = profileBrief({
    title: "SeedSpec run evaluation profile",
    runner: options.runner,
    judgeModel: options.judgeModel,
    evidence,
    stage: manifest.target.stage,
    subjectPath: resolve(runDirectory, "run-manifest.json"),
    draftPath,
    finalPath,
    evaluationRepositoryRoot: options.evaluationRepositoryRoot,
    evaluationCliEntry: options.evaluationCliEntry,
  });
  await writeFile(path, `${brief}\n`, "utf8");
  return { path, brief };
}

function profileBrief(options: {
  title: string;
  runner: "codex" | "claude-code";
  judgeModel: string;
  evidence: string[];
  stage: "authorship" | "implementation";
  subjectPath: string;
  draftPath: string;
  finalPath: string;
  evaluationRepositoryRoot: string;
  evaluationCliEntry: string;
}): string {
  const profileSkill = resolve(options.evaluationRepositoryRoot, "skills/evaluate-seedspec-profile/SKILL.md");
  const technicalSkill = resolve(options.evaluationRepositoryRoot, "skills/review-seedspec-technical-quality/SKILL.md");
  return [
    `# ${options.title}`,
    "",
    `Use ${options.runner === "codex" ? "Codex" : "Claude Code"} with the exact evaluator model \`${options.judgeModel}\`. Inspect the subject read-only; do not improve it while evaluating it.`,
    "",
    "## Evaluation objective",
    "",
    "Produce a descriptive profile, not a winner or quality grade. Establish the decision surface, expected and observed provenance where evidence permits, obligation-to-evidence coverage, structural ownership, process measurements, technical findings, and limitations.",
    "",
    "Do not reward author control over intentional agent latitude. Classify a decision as ambient only when a material choice lacks attributable authority; a deliberately delegated or open choice is not ambient. Preserve unknown and mixed attribution and include confidence.",
    "",
    "## Evidence",
    "",
    ...options.evidence.map((item) => `- ${item}`),
    "",
    "## Procedure",
    "",
    `1. Read the profile skill completely: \`${profileSkill}\`.`,
    ...(options.stage === "implementation" ? [`2. Read the technical review skill completely: \`${technicalSkill}\`.`] : []),
    `${options.stage === "implementation" ? "3" : "2"}. Use the exact subject identity at \`${options.subjectPath}\`; do not invent unavailable trace, token, cache, or timing data.`,
    `${options.stage === "implementation" ? "4" : "3"}. Write the profile body without a profileId to \`${options.draftPath}\`.`,
    `${options.stage === "implementation" ? "5" : "4"}. Finalize it with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate profile-finalize ${JSON.stringify(options.draftPath)} --out ${JSON.stringify(options.finalPath)}\`.`,
    `${options.stage === "implementation" ? "6" : "5"}. Validate and print its descriptive summary with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate profile ${JSON.stringify(options.finalPath)}\`.`,
    "",
    "Do not emit a normalized score or declare a winning variant. Findings must remain traceable to cited evidence, and limitations must state what the environment could not establish.",
  ].join("\n");
}
