import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  DecisionLedgerBodySchema,
  EvaluationProfileBodySchema,
  ArtifactManifestSchema,
  RunManifestSchema,
  ScorecardSchema,
  ProfileEvidenceEnvelopeBodySchema,
  createProfileEvidenceEnvelope,
  parseProfileEvidenceEnvelope,
  parseSubjectRun,
  parseTrace,
  sha256Hex,
  stableJson,
  createDecisionLedger,
  createEvaluationProfile,
  createProfileComparison,
  parseEvaluationProfile,
  parseDecisionLedger,
  summarizeEvaluationProfile,
  TECHNICAL_QUALITY_RUBRIC_VERSION,
  calculateContractGateSummary,
  type EvaluationProfile,
  type DecisionLedger,
  type EvaluationProfileBody,
  type ProfileEvidenceEnvelope,
  type TraceEvent,
  type JsonValue,
  type ProfileComparison,
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
  evidence?: string;
}): Promise<{ profile: EvaluationProfile; path: string }> {
  const draftPath = resolve(options.draft);
  const body = EvaluationProfileBodySchema.parse(JSON.parse(await readFile(draftPath, "utf8")) as unknown);
  if (options.evidence !== undefined) {
    const evidence = parseProfileEvidenceEnvelope(JSON.parse(await readFile(resolve(options.evidence), "utf8")) as unknown);
    assertProfileMatchesEvidence(body, evidence);
  }
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

export async function compareEvaluationProfileFiles(options: {
  files: readonly string[];
  caseRoot: string;
  createdAt: string;
  out?: string;
}): Promise<{ comparison: ProfileComparison; path: string; markdownPath: string }> {
  const profiles = await Promise.all(options.files.map(validateEvaluationProfileFile));
  if (profiles.length < 2) throw new Error("At least two evaluation profiles are required.");
  const subjectCase = profiles[0]?.subject.case;
  if (subjectCase === undefined) throw new Error("Profile comparisons require a run case identity.");
  const cases = await loadCaseLibrary(resolve(options.caseRoot));
  const matched = cases.find(({ case: evaluationCase }) =>
    evaluationCase.id === subjectCase.id && evaluationCase.version === subjectCase.version);
  if (matched === undefined) throw new Error(`Evaluation case ${subjectCase.id}@${subjectCase.version} was not found.`);
  const caseSource = await readFile(matched.filePath, "utf8");
  if (`sha256:${sha256Hex(caseSource)}` !== subjectCase.digest) {
    throw new Error("The evaluation case no longer matches the profile case digest.");
  }
  const comparison = createProfileComparison({
    profiles,
    comparisonAxes: matched.case.comparisonAxes,
    createdAt: options.createdAt,
  });
  const path = resolve(options.out ?? `runs/profile-comparison-${options.createdAt.replaceAll(/[:.]/g, "-")}.json`);
  const markdownPath = path.endsWith(".json") ? path.replace(/\.json$/, ".md") : `${path}.md`;
  await mkdir(dirname(path), { recursive: true });
  await Promise.all([
    writeFile(path, `${JSON.stringify(comparison, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, `${formatProfileComparison(comparison)}\n`, "utf8"),
  ]);
  return { comparison, path, markdownPath };
}

export function formatProfileComparison(comparison: ProfileComparison): string {
  const lines = [
    "# SeedSpec evaluation profile comparison",
    "",
    `Case: \`${comparison.case.id}@${comparison.case.version}\`  `,
    `Stage: \`${comparison.stage}\`  `,
    `Comparison: \`${comparison.comparisonId}\``,
    "",
    "This is a descriptive comparison over predeclared case axes. It does not calculate an aggregate score or declare a winner.",
    "",
    "## Decision axes",
    "",
    "| Axis | Materiality | Treatment / variant | Latitude | Alignment | Selected by | Confidence |",
    "|---|---|---|---|---|---|---:|",
  ];
  for (const axis of comparison.decisionAxes) {
    for (const observation of axis.observations) {
      lines.push(observation.status === "missing"
        ? `| ${axis.caseAxisId} | ${axis.materiality} | ${observation.treatment ?? observation.variant} | missing | missing | — | — |`
        : `| ${axis.caseAxisId} | ${axis.materiality} | ${observation.treatment ?? observation.variant} | ${observation.expectedLatitude} | ${observation.alignment} | ${observation.selectedBy.join(", ") || "—"} | ${observation.confidence.toFixed(2)} |`);
    }
  }
  lines.push(
    "",
    "## Obligation axes",
    "",
    "| Axis | Importance | Treatment / variant | Coverage | Distinguishing evidence | Confidence |",
    "|---|---|---|---|---|---:|",
  );
  for (const axis of comparison.obligationAxes) {
    for (const observation of axis.observations) {
      lines.push(observation.status === "missing"
        ? `| ${axis.caseAxisId} | ${axis.importance} | ${observation.treatment ?? observation.variant} | missing | missing | — |`
        : `| ${axis.caseAxisId} | ${axis.importance} | ${observation.treatment ?? observation.variant} | ${observation.coverage} | ${observation.distinguishing} | ${observation.confidence.toFixed(2)} |`);
    }
  }
  if ((comparison.technicalQualityAxes?.length ?? 0) > 0) {
    lines.push(
      "",
      "## Independent technical quality vector",
      "",
      "Levels are ordinal anchors (0 compromised, 1 fragile, 2 serviceable, 3 robust, 4 exceptional). They are not averaged into an overall score.",
      "",
      "| Dimension | Treatment / variant | Status | Level | Critical findings | Material findings | Confidence |",
      "|---|---|---|---:|---:|---:|---:|",
    );
    for (const axis of comparison.technicalQualityAxes ?? []) {
      for (const observation of axis.observations) {
        lines.push(observation.status === "assessed"
          ? `| ${axis.dimension} | ${observation.treatment ?? observation.variant} | assessed | ${String(observation.level)} | ${String(observation.openCriticalFindings)} | ${String(observation.openMaterialFindings)} | ${observation.confidence.toFixed(2)} |`
          : `| ${axis.dimension} | ${observation.treatment ?? observation.variant} | ${observation.status} | — | ${metric(observation.openCriticalFindings)} | ${metric(observation.openMaterialFindings)} | ${observation.confidence === undefined ? "—" : observation.confidence.toFixed(2)} |`);
      }
    }
  }
  lines.push(
    "",
    "## Process capture",
    "",
    "| Treatment / variant | Turns | Input tokens | Cached input | Output tokens | Duration |",
    "|---|---:|---:|---:|---:|---:|",
  );
  for (const entry of comparison.process) {
    const metrics = entry.metrics;
    lines.push(`| ${entry.treatment ?? entry.variant} | ${metric(metrics?.turns.total)} | ${metric(metrics?.tokens.input)} | ${metric(metrics?.tokens.cachedInputRead)} | ${metric(metrics?.tokens.output)} | ${metric(metrics?.durationMs, " ms")} |`);
  }
  lines.push("", "## Subject-specific records", "");
  for (const entry of comparison.unmatched) {
    lines.push(`- ${entry.treatment ?? entry.variant}: ${String(entry.decisionIds.length)} additional decisions; ${String(entry.obligationIds.length)} additional obligations.`);
  }
  lines.push("", ...comparison.notes.map((note) => `- ${note}`));
  return lines.join("\n");
}

function metric(value: number | undefined, suffix = ""): string {
  return value === undefined ? "unavailable" : `${String(value)}${suffix}`;
}

export function formatEvaluationProfile(profile: EvaluationProfile): string {
  const summary = summarizeEvaluationProfile(profile);
  const lines = [
    `Evaluation profile: ${profile.profileId}`,
    `Stage: ${profile.subject.stage}`,
    ...(profile.subject.variant === undefined ? [] : [`Variant: ${profile.subject.variant}`]),
    ...(profile.subject.treatment === undefined ? [] : [`Treatment: ${profile.subject.treatment}`]),
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
    if (summary.technical.quality !== undefined) {
      lines.push(
        `- Independent quality readiness: ${summary.technical.quality.readiness}`,
        `- ${String(summary.technical.quality.assessed)} dimensions assessed, ${String(summary.technical.quality.unknown)} unknown, ${String(summary.technical.quality.notApplicable)} not applicable`,
        `- ${String(summary.technical.quality.openCriticalFindings)} open critical findings`,
        "- Ordinal dimension levels are evidence anchors, not values to average into an overall score.",
      );
    }
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
  reasoningEffort: string;
  evaluationRepositoryRoot: string;
  evaluationCliEntry: string;
  caseRoot: string;
  seedSpecCli: string;
  out?: string;
}): Promise<{ path: string; brief: string; evidencePath: string; evidenceId: string }> {
  const runDirectory = resolve(options.runDirectory);
  const manifest = RunManifestSchema.parse(JSON.parse(await readFile(resolve(runDirectory, "run-manifest.json"), "utf8")) as unknown);
  const cases = await loadCaseLibrary(resolve(options.caseRoot));
  const matched = cases.find(({ case: evaluationCase }) =>
    evaluationCase.id === manifest.case.id && evaluationCase.version === manifest.case.version);
  if (matched === undefined) throw new Error("The run's evaluation case was not found under the supplied case root.");
  const caseSource = await readFile(matched.filePath, "utf8");
  if (`sha256:${sha256Hex(caseSource)}` !== manifest.case.digest) {
    throw new Error("The evaluation case no longer matches the immutable run manifest.");
  }
  const artifactManifest = ArtifactManifestSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "artifact-manifest.json"), "utf8")) as unknown,
  );
  const trace = parseTrace(JSON.parse(await readFile(resolve(runDirectory, "trace.json"), "utf8")) as unknown);
  const subjectRun = await fileExists(resolve(runDirectory, "subject-run.json"))
    ? parseSubjectRun(JSON.parse(await readFile(resolve(runDirectory, "subject-run.json"), "utf8")) as unknown)
    : undefined;
  const capturedTurnCount = subjectRun === undefined
    ? undefined
    : await capturedSubjectTurnCount(runDirectory, subjectRun.events.digest);
  const deterministic = ScorecardSchema.parse(
    JSON.parse(await readFile(resolve(runDirectory, "deterministic-scorecard.json"), "utf8")) as unknown,
  );
  if (deterministic.kind !== "deterministic") throw new Error("Run deterministic scorecard has the wrong kind.");
  if (artifactManifest.runId !== manifest.runId
    || trace.runId !== manifest.runId
    || trace.variant !== manifest.variant
    || deterministic.runId !== manifest.runId
    || deterministic.stage !== manifest.target.stage
    || deterministic.variant !== manifest.variant
    || deterministic.case.id !== manifest.case.id
    || deterministic.case.version !== manifest.case.version
    || deterministic.case.digest !== manifest.case.digest) {
    throw new Error("Profile evidence artifacts do not share the immutable run identity.");
  }
  if (subjectRun !== undefined && subjectRun.runId !== manifest.runId) {
    throw new Error("Captured subject-run evidence does not share the immutable run identity.");
  }
  const sourceEnvelope = JSON.parse(await readFile(resolve(runDirectory, "source-envelope.json"), "utf8")) as {
    untrustedMaterial?: unknown;
    availableAuthorQuestionIds?: unknown;
  };
  if (typeof sourceEnvelope.untrustedMaterial !== "string" || !Array.isArray(sourceEnvelope.availableAuthorQuestionIds)) {
    throw new Error("Runner source envelope cannot produce compact profile evidence.");
  }
  const packagePath = manifest.target.stage === "implementation"
    ? resolve(runDirectory, "input", "authored")
    : resolve(runDirectory, "workspace");
  // Implementation variants identify the evaluation treatment, not the format of
  // the transported authored input. A Markdown brief is a valid implementation
  // input and must not be sent through SeedSpec package inspection merely because
  // its run variant is `seedspec-implementation`.
  const packageIdentity = await inspectSeedSpecPackageIfPresent(packagePath, resolve(options.seedSpecCli));
  const packageKind = packageIdentity?.kind;
  const packageReference = packageIdentity === undefined ? undefined : {
    ...(packageIdentity.id === undefined ? {} : { id: packageIdentity.id }),
    ...(packageIdentity.version === undefined ? {} : { version: packageIdentity.version }),
    digest: packageIdentity.digest,
  };
  const subject = {
    stage: manifest.target.stage,
    runId: manifest.runId,
    variant: manifest.variant,
    ...(typeof manifest.configuration?.["treatmentId"] === "string"
      ? { treatment: manifest.configuration["treatmentId"] }
      : {}),
    case: manifest.case,
    ...(packageReference === undefined ? {} : {
      ...(packageKind === undefined ? {} : { kind: packageKind }),
      package: { ...packageReference, path: packagePath },
    }),
  };
  const evaluatorGuidance = await materializeRunEvaluatorGuidance(
    runDirectory,
    options.evaluationRepositoryRoot,
    manifest.target.stage,
  );
  const evidenceBody = ProfileEvidenceEnvelopeBodySchema.parse({
    schemaVersion: 1,
    profileSchemaVersion: 1,
    createdAt: new Date().toISOString(),
    subject,
    evaluatorRequest: {
      runner: options.runner,
      model: options.judgeModel,
      reasoningEffort: options.reasoningEffort,
    },
    comparisonAxes: {
      decisions: matched.case.comparisonAxes.decisions.filter(({ stages }) => stages.includes(manifest.target.stage)),
      obligations: matched.case.comparisonAxes.obligations.filter(({ stages }) => stages.includes(manifest.target.stage)),
    },
    technicalExpectations: matched.case.technicalExpectations,
    adaptationChallenges: matched.case.adaptationChallenges,
    evaluatorGuidance: evaluatorGuidance.entries,
    source: {
      path: "source-envelope.json",
      untrustedMaterial: sourceEnvelope.untrustedMaterial,
      availableAuthorQuestionIds: sourceEnvelope.availableAuthorQuestionIds.map(String),
    },
    artifacts: artifactManifest.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      path: runRelativeArtifactPath(artifact.path, artifact.kind),
      kind: artifact.kind,
      mediaType: artifact.mediaType,
      byteLength: artifact.byteLength,
      digest: artifact.digest,
    })),
    trace: {
      path: "trace.json",
      startedAt: trace.startedAt,
      finishedAt: trace.finishedAt,
      status: trace.status,
      capture: trace.capture,
      relevantEvents: trace.events.map((event) => compactTraceEvent(event as unknown as TraceEvent)),
      limitations: [...trace.limitations],
    },
    ...(subjectRun === undefined ? {} : {
      subjectRun: {
        path: "subject-run.json",
        subjectRunId: subjectRun.subjectRunId,
        startedAt: subjectRun.startedAt,
        finishedAt: subjectRun.finishedAt,
        status: subjectRun.status,
        usage: subjectRun.usage,
        eventCount: subjectRun.events.count,
        ...(capturedTurnCount === undefined ? {} : { turnCount: capturedTurnCount }),
        ...(subjectRun.events.threadId === undefined ? {} : { threadId: subjectRun.events.threadId }),
        ...(subjectRun.captureTrace === undefined ? {} : {
          captureTracePath: subjectRun.captureTrace.path,
          captureTraceId: subjectRun.captureTrace.traceId,
        }),
        limitations: [...subjectRun.limitations],
      },
    }),
    contractGate: {
      path: "deterministic-scorecard.json",
      summary: deterministic.gate ?? calculateContractGateSummary(deterministic.checks),
      checks: deterministic.checks,
      interpretation: deterministic.interpretation,
    },
    reportPath: "report.md",
    ...(await fileExists(resolve(runDirectory, "decision-ledger.json")) ? { decisionLedgerPath: "decision-ledger.json" } : {}),
    instructions: [
      "Use this envelope instead of opening the full evaluation case, evaluator implementation, TypeScript schemas, or unrelated repository files.",
      "Inspect only the listed authored artifacts, runner report, optional decision ledger, and trace events needed to support a finding.",
      "Create exactly one decision record for every applicable decision axis and set caseAxisId to that axis ID.",
      "Create exactly one obligation record for every applicable obligation axis and set caseAxisId to that axis ID.",
      "Additional subject-specific records may omit caseAxisId, but they cannot replace or duplicate a case axis.",
      "Use package-author for the human or organization author, authoring-agent for the agent that shaped a specification, implementing-agent for the agent that realized it, and evaluation-case only for evaluator-only expectations.",
      "A case expectation may establish evaluation alignment but was not authority available to the subject unless the source or author answers also supplied it.",
      "For authorship, a request to complete or improve a specification is not blanket delegation of material product policy. Use ambient when the authoring agent selected a material product choice without attributable authority, and use not-observed only when the authored material contains no choice to compare.",
      "Do not estimate tokens, cache activity, turns, timing, technical outcomes, or provenance that the envelope and cited files do not establish.",
      "When subjectRun is present, use its provider-reported usage and exact outer run interval for process metrics instead of the subject-authored trace's unavailable or reconstructed values.",
      "When subjectRun.captureTracePath is present, use that runner-owned trace for event timing and matched tool-call duration; treat those values as harness observations, not provider-internal execution timestamps.",
      "When subjectRun.turnCount is present, use it as the reported total turn count. Do not infer a different count from subject-authored trace events.",
      "Adaptation challenge definitions are evaluation prompts, not captured outcomes. Do not execute a challenge during profile evaluation; emit not-run unless the envelope supplies a separate captured adaptation run.",
      "Treat contractGate only as run-integrity and outcome-contract evidence. Its check counts do not establish implementation quality and must not influence ordinal technical levels without underlying implementation evidence.",
    ],
  });
  const evidenceEnvelope = createProfileEvidenceEnvelope(evidenceBody);
  const path = resolve(options.out ?? resolve(runDirectory, "profile-evaluation-handoff.md"));
  const evidencePath = resolve(runDirectory, "profile-evidence.json");
  const draftPath = resolve(runDirectory, "evaluation-profile-draft.json");
  const finalPath = resolve(runDirectory, "evaluation-profile.json");
  const brief = profileBrief({
    title: "SeedSpec run evaluation profile",
    runner: options.runner,
    judgeModel: options.judgeModel,
    reasoningEffort: options.reasoningEffort,
    evidence: [`Compact, content-addressed evidence envelope: \`${evidencePath}\` (\`${evidenceEnvelope.evidenceId}\`)`],
    stage: manifest.target.stage,
    subjectPath: evidencePath,
    draftPath,
    finalPath,
    evaluationRepositoryRoot: options.evaluationRepositoryRoot,
    evaluationCliEntry: options.evaluationCliEntry,
    evidencePath,
    profileSkillPath: evaluatorGuidance.profileSkillPath,
    ...(evaluatorGuidance.technicalSkillPath === undefined
      ? {}
      : { technicalSkillPath: evaluatorGuidance.technicalSkillPath }),
  });
  await Promise.all([
    writeFile(path, `${brief}\n`, "utf8"),
    writeFile(evidencePath, `${JSON.stringify(evidenceEnvelope, null, 2)}\n`, "utf8"),
  ]);
  return { path, brief, evidencePath, evidenceId: evidenceEnvelope.evidenceId };
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
  reasoningEffort?: string;
  evidencePath?: string;
  profileSkillPath?: string;
  technicalSkillPath?: string;
}): string {
  const profileSkill = options.profileSkillPath
    ?? resolve(options.evaluationRepositoryRoot, "skills/evaluate-seedspec-profile/SKILL.md");
  const technicalSkill = options.technicalSkillPath
    ?? resolve(options.evaluationRepositoryRoot, "skills/review-seedspec-technical-quality/SKILL.md");
  return [
    `# ${options.title}`,
    "",
    `Use ${options.runner === "codex" ? "Codex" : "Claude Code"} with the exact evaluator model \`${options.judgeModel}\`${options.reasoningEffort === undefined ? "" : ` and reasoning effort \`${options.reasoningEffort}\``}. Inspect the subject read-only; do not improve it while evaluating it.`,
    "",
    "## Evaluation objective",
    "",
    "Produce a descriptive profile and, for implementations, an independently anchored technical quality vector. Do not collapse the result into one winner or overall quality grade. Establish the decision surface, expected and observed provenance where evidence permits, obligation-to-evidence coverage, structural ownership, process measurements, technical findings, and limitations.",
    "",
    "Do not reward author control over intentional agent latitude. Classify a decision as ambient only when a material choice lacks attributable authority; a deliberately delegated or open choice is not ambient. Preserve unknown and mixed attribution and include confidence.",
    ...(options.stage === "authorship" ? ["A request to complete or improve a specification is not blanket delegation of material product policy. Compare authored choices at the authorship stage; do not mark them not-observed merely because no implementation exists.", ""] : []),
    ...(options.stage === "implementation"
      ? ["Do not execute an adaptation challenge during this profile run. Only consume a separately captured adaptation run when the evidence envelope explicitly supplies one; otherwise record the challenge as `not-run`.", ""]
      : []),
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
    `${options.stage === "implementation" ? "5" : "4"}. Finalize it with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate profile-finalize ${JSON.stringify(options.draftPath)} --out ${JSON.stringify(options.finalPath)}${options.evidencePath === undefined ? "" : ` --evidence ${JSON.stringify(options.evidencePath)}`}\`.`,
    `${options.stage === "implementation" ? "6" : "5"}. Validate and print its descriptive summary with \`node ${JSON.stringify(resolve(options.evaluationCliEntry))} evaluate profile ${JSON.stringify(options.finalPath)}\`.`,
    "",
    "Do not emit a normalized score or declare a winning variant. Findings must remain traceable to cited evidence, and limitations must state what the environment could not establish.",
  ].join("\n");
}

async function materializeRunEvaluatorGuidance(
  runDirectory: string,
  evaluationRepositoryRoot: string,
  stage: "authorship" | "implementation",
): Promise<{
  readonly entries: readonly { readonly id: string; readonly path: string; readonly digest: string }[];
  readonly profileSkillPath: string;
  readonly technicalSkillPath?: string;
}> {
  const sources = [
    {
      id: "profile-skill",
      source: resolve(evaluationRepositoryRoot, "skills/evaluate-seedspec-profile/SKILL.md"),
      target: "evaluator-guidance/evaluate-seedspec-profile/SKILL.md",
    },
    {
      id: "profile-output",
      source: resolve(evaluationRepositoryRoot, "skills/evaluate-seedspec-profile/references/output.md"),
      target: "evaluator-guidance/evaluate-seedspec-profile/references/output.md",
    },
    ...(stage === "implementation" ? [
      {
        id: "technical-review-skill",
        source: resolve(evaluationRepositoryRoot, "skills/review-seedspec-technical-quality/SKILL.md"),
        target: "evaluator-guidance/review-seedspec-technical-quality/SKILL.md",
      },
      {
        id: "technical-review-output",
        source: resolve(evaluationRepositoryRoot, "skills/review-seedspec-technical-quality/references/output.md"),
        target: "evaluator-guidance/review-seedspec-technical-quality/references/output.md",
      },
    ] : []),
  ];
  const entries = await Promise.all(sources.map(async ({ id, source, target }) => {
    const content = await readFile(source, "utf8");
    const output = resolve(runDirectory, target);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, content, "utf8");
    return { id, path: target, digest: `sha256:${sha256Hex(content)}` };
  }));
  return {
    entries,
    profileSkillPath: resolve(runDirectory, "evaluator-guidance/evaluate-seedspec-profile/SKILL.md"),
    ...(stage === "implementation"
      ? {
          technicalSkillPath: resolve(
            runDirectory,
            "evaluator-guidance/review-seedspec-technical-quality/SKILL.md",
          ),
        }
      : {}),
  };
}

export async function inspectSeedSpecPackageIfPresent(packagePath: string, seedSpecCli: string): Promise<{
  id?: string;
  version?: string;
  digest: `sha256:${string}`;
  kind?: string;
} | undefined> {
  if (!await fileExists(resolve(packagePath, "seedspec.yaml"))) return undefined;
  return inspectPackage(packagePath, seedSpecCli);
}

function inspectPackage(packagePath: string, seedSpecCli: string): {
  id?: string;
  version?: string;
  digest: `sha256:${string}`;
  kind?: string;
} {
  const raw = JSON.parse(execFileSync(process.execPath, [seedSpecCli, "inspect", packagePath, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  })) as { id?: unknown; version?: unknown; digest?: unknown; kind?: unknown };
  if (typeof raw.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(raw.digest)) {
    throw new Error("SeedSpec inspection did not return a valid package digest.");
  }
  return {
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    ...(typeof raw.version === "string" ? { version: raw.version } : {}),
    digest: raw.digest as `sha256:${string}`,
    ...(typeof raw.kind === "string" ? { kind: raw.kind } : {}),
  };
}

function runRelativeArtifactPath(path: string, _kind: string): string {
  if (["authored-instructions", "authored-package", "implementation"].includes(_kind)) return `workspace/${path}`;
  if (["source", "log", "tool-trace"].includes(_kind) && path.startsWith("evidence/")) {
    return path.slice("evidence/".length);
  }
  return path;
}

function compactTraceEvent(event: TraceEvent): JsonValue {
  return {
    sequence: event.sequence,
    timestamp: event.timestamp,
    kind: event.kind,
    actor: event.actor,
    ...(event.name === undefined ? {} : { name: event.name }),
    dataDigest: `sha256:${sha256Hex(stableJson(event.data))}`,
    data: compactJson(event.data, 0),
  };
}

async function capturedSubjectTurnCount(
  runDirectory: string,
  expectedDigest: string,
): Promise<number | undefined> {
  const path = resolve(runDirectory, "subject-events.jsonl");
  const source = await readFile(path).catch(() => null);
  if (source === null || `sha256:${sha256Hex(source.toString("utf8"))}` !== expectedDigest) {
    return undefined;
  }
  let count = 0;
  for (const line of source.toString("utf8").split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const event = JSON.parse(line) as { type?: unknown };
      if (event.type === "turn.completed") count += 1;
    } catch {
      return undefined;
    }
  }
  return count;
}

function compactJson(value: JsonValue, depth: number): JsonValue {
  if (typeof value === "string") {
    return value.length <= 1_500 ? value : `${value.slice(0, 1_500)}… [truncated ${String(value.length - 1_500)} characters]`;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[nested value omitted]";
  if (Array.isArray(value)) {
    const kept = value.slice(0, 24).map((entry) => compactJson(entry, depth + 1));
    return value.length <= 24 ? kept : [...kept, `[${String(value.length - 24)} additional items omitted]`];
  }
  return Object.fromEntries(
    Object.entries(value).slice(0, 48).map(([key, entry]) => [key, compactJson(entry, depth + 1)]),
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function assertProfileMatchesEvidence(body: EvaluationProfileBody, evidence: ProfileEvidenceEnvelope): void {
  if (stableJson(body.subject as unknown as JsonValue) !== stableJson(evidence.subject as unknown as JsonValue)) {
    throw new Error("Evaluation profile subject does not exactly match the content-addressed evidence envelope.");
  }
  const model = body.evaluator.model;
  if (body.evaluator.kind !== "agent") {
    throw new Error("An evidence-bound independent profile must identify an agent evaluator.");
  }
  if (model === undefined || model.modelId !== evidence.evaluatorRequest.model) {
    throw new Error(`Evaluation profile must identify the requested evaluator model ${evidence.evaluatorRequest.model}.`);
  }
  if (model.parameters.additional?.["reasoningEffort"] !== evidence.evaluatorRequest.reasoningEffort) {
    throw new Error(`Evaluation profile must record requested reasoning effort ${evidence.evaluatorRequest.reasoningEffort}.`);
  }
  assertDecisionAxes(body, evidence);
  assertObligationAxes(body, evidence);
  if (evidence.subject.stage === "implementation") {
    if (body.technical?.quality === undefined) {
      throw new Error("Implementation profiles must include the independent technical quality vector.");
    }
    if (body.technical.quality.rubricVersion !== TECHNICAL_QUALITY_RUBRIC_VERSION) {
      throw new Error(
        `Technical quality must use rubric version ${TECHNICAL_QUALITY_RUBRIC_VERSION}.`,
      );
    }
  }
}

function assertDecisionAxes(body: EvaluationProfileBody, evidence: ProfileEvidenceEnvelope): void {
  const axes = new Map(evidence.comparisonAxes.decisions.map((axis) => [axis.id, axis]));
  const seen = new Set<string>();
  for (const decision of body.decisions) {
    if (decision.caseAxisId === undefined) continue;
    const axis = axes.get(decision.caseAxisId);
    if (axis === undefined) throw new Error(`Decision ${decision.id} uses unknown case axis ${decision.caseAxisId}.`);
    if (decision.materiality.level !== axis.materiality) {
      throw new Error(`Decision ${decision.id} must retain case-axis materiality ${axis.materiality}.`);
    }
    seen.add(decision.caseAxisId);
  }
  const missing = [...axes.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`Evaluation profile is missing decision case axes: ${missing.join(", ")}.`);
}

function assertObligationAxes(body: EvaluationProfileBody, evidence: ProfileEvidenceEnvelope): void {
  const axes = new Map(evidence.comparisonAxes.obligations.map((axis) => [axis.id, axis]));
  const seen = new Set<string>();
  for (const obligation of body.obligations) {
    if (obligation.caseAxisId === undefined) continue;
    const axis = axes.get(obligation.caseAxisId);
    if (axis === undefined) throw new Error(`Obligation ${obligation.id} uses unknown case axis ${obligation.caseAxisId}.`);
    if (obligation.kind !== axis.kind || obligation.importance !== axis.importance) {
      throw new Error(`Obligation ${obligation.id} must retain case-axis kind ${axis.kind} and importance ${axis.importance}.`);
    }
    seen.add(obligation.caseAxisId);
  }
  const missing = [...axes.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`Evaluation profile is missing obligation case axes: ${missing.join(", ")}.`);
}
