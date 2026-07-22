import { createRunManifest, type RunManifest, type RunManifestInput } from "@seedspec/eval-core";
import { buildTrustedInstructionList } from "@seedspec/eval-harness";

import type { ExecutionEnvelope } from "./contracts.js";

export type DesktopRunner = "codex" | "claude-code";

function usesSeedSpec(variant: RunManifest["variant"]): boolean {
  return !["raw-source", "markdown-authored"].includes(variant);
}

function skillTreatment(manifest: RunManifest): string | undefined {
  const value = manifest.configuration?.["treatmentId"];
  return typeof value === "string" ? value : undefined;
}

function skillId(manifest: RunManifest): string {
  const value = manifest.configuration?.["skillId"];
  return typeof value === "string" ? value : "shape-solution-intent";
}

export function buildDesktopManifest(envelope: ExecutionEnvelope, runner: DesktopRunner): RunManifest {
  const { runId: _runId, runner: _runner, ...immutableBody } = envelope.manifest;
  void _runId;
  void _runner;
  const body = JSON.parse(JSON.stringify(immutableBody)) as RunManifestInput;
  const treatment = skillTreatment(envelope.manifest);
  const guidedAudit = treatment === undefined
    ? ["seedspec-guided", "seedspec-restructured"].includes(envelope.manifest.variant)
    : treatment === "audit-guidance" || treatment === "skill-and-audit";
  const usesSkill = treatment === "skill-guidance" || treatment === "skill-and-audit";
  const selectedSkillId = skillId(envelope.manifest);
  return createRunManifest({
    ...body,
    runner: {
      id: runner === "codex" ? "codex-desktop" : "claude-code",
      kind: "agent",
      version: "0.1.0-alpha.2",
    },
    tools: [
      { name: "desktop-agent-workspace", version: "0.1.0-alpha.2", configuration: { runner } },
      ...(envelope.manifest.variant === "raw-source" ? [] : [
        { name: "seedspec-simulated-author", version: "0.1.0-alpha.2" },
      ]),
      ...(usesSeedSpec(envelope.manifest.variant) ? [{
        name: "seedspec-cli",
        version: "0.1.0-alpha.5",
        configuration: {
          protocolVersion: envelope.manifest.protocol.version,
          protocolRevision: envelope.manifest.protocol.revision ?? null,
          guidedAudit,
        },
      }] : []),
      ...(usesSkill ? [{
        name: selectedSkillId,
        version: "0.1.0-alpha.1",
        configuration: {
          digest: envelope.manifest.configuration?.["skillDigest"] ?? null,
          entrypoint: `guidance/${selectedSkillId}/SKILL.md`,
        },
      }] : []),
    ],
    configuration: {
      ...(body.configuration ?? {}),
      sourceRunId: envelope.manifest.runId,
      parityRunner: runner,
    },
  });
}

export function buildDesktopBrief(
  envelope: ExecutionEnvelope,
  manifest: RunManifest,
  runner: DesktopRunner,
  runtime: { readonly seedSpecCliEntry?: string } = {},
): string {
  const config = envelope.submission.config;
  const sharedInstructions = buildTrustedInstructionList(config).map((instruction) =>
    instruction === "Use only the tools exposed for this turn and keep all artifacts inside the run workspace."
      ? "Use only the tools exposed for this turn. Put evaluated deliverables under workspace/ and put the evidence sidecars report.md and trace-draft.json at this isolated project's root."
      : instruction);
  const traceModel = !usesSeedSpec(config.variant)
    ? {
        ...manifest.model,
        routing: manifest.model.routing?.region === undefined
          ? undefined
          : { region: manifest.model.routing.region },
      }
    : manifest.model;
  const tracePath = "trace-draft.json";
  const reportPath = "report.md";
  const workspacePath = "workspace";
  const runnerControl = "node runner-control.mjs";
  const seedSpecCli = runtime.seedSpecCliEntry === undefined
    ? "seedspec"
    : `node ${JSON.stringify(runtime.seedSpecCliEntry)}`;
  const treatment = skillTreatment(manifest);
  return [
    `# Controlled ${config.stage} evaluation runner brief`,
    "",
    `You are the ${runner === "codex" ? "Codex desktop" : "Claude Code"} runner for one controlled ${config.stage} evaluation. Execute the work; do not merely review this brief.`,
    "",
    "## Reproducibility identity",
    "",
    `- External run ID: \`${manifest.runId}\``,
    `- Matching Think source run: \`${envelope.manifest.runId}\``,
    `- Case: \`${config.caseId}\``,
    `- Stage: \`${config.stage}\``,
    `- Requested model: \`${config.model}\``,
    ...(treatment === undefined ? [] : [`- Authoring treatment: \`${treatment}\``]),
    `- Harness version: \`${manifest.harness.version}\``,
    ...(usesSeedSpec(config.variant) ? [`- Protocol version: \`${manifest.protocol.version}\``] : []),
    "",
    "Before starting, verify that the operator launched the runner with the requested model selector. An explicit CLI or API model selection is authoritative even when the model cannot self-report its own version. Record that selector and any dated snapshot identifier the environment exposes; record the snapshot as unavailable when none is exposed. Stop only when the requested selector was unavailable or a different selector was actually used. Never infer parity from a marketing alias or model self-description.",
    "Before doing any evaluation work, run `node runner-control.mjs preflight`. Continue only when every check passes and the result says READY. Do not search parent directories, evaluation-harness source, plans, manifests, or control files to reconstruct information that the broker has not returned.",
    "",
    "## Trusted runner contract",
    "",
    ...sharedInstructions.map((instruction, index) => `${index + 1}. ${instruction}`),
    `${sharedInstructions.length + 1}. Work in a clean, isolated workspace. Do not inspect another runner's outputs.`,
    `${sharedInstructions.length + 2}. ${usesSeedSpec(config.variant) ? "Use only the SeedSpec CLI capabilities allowed by this variant. Record exact commands and versions." : "Record the runner and model versions exposed by the environment."}`,
    `${sharedInstructions.length + 3}. Record observable messages, tool calls/results, timing, usage when exposed, artifact paths/digests, errors, redactions, and capture limitations.`,
    config.variant === "raw-source"
      ? `${sharedInstructions.length + 4}. This zero-shot control has no simulated-author answers. Preserve uncertainty or make reversible implementation choices rather than inventing author intent.`
      : `${sharedInstructions.length + 4}. When a material clarification is needed, call the simulated author through: \`${runnerControl} answer --question <question-id>\`. The broker exposes only that answer. Do not inspect control storage or invent an unavailable answer.`,
    `${sharedInstructions.length + 5}. Put every evaluated deliverable under \`${workspacePath}/\`; do not write evaluated output elsewhere in this isolated project.`,
    `${sharedInstructions.length + 6}. Evidence sidecars are not evaluated deliverables: write \`${reportPath}\` and \`${tracePath}\` at the isolated project root, never under \`${workspacePath}/\`.`,
    ...(!usesSeedSpec(config.variant) ? [
      `${sharedInstructions.length + 7}. Use only the supplied case material, explicit author answers, and ordinary capabilities of this environment. Do not inspect or invoke unavailable authoring tooling.`,
    ] : [
      `${sharedInstructions.length + 7}. Use the frozen local SeedSpec CLI through \`${seedSpecCli}\`. Begin by recording \`${seedSpecCli} version --json\`.`,
      treatment !== undefined
        ? `${sharedInstructions.length + 8}. ${skillTreatmentInstruction(treatment, seedSpecCli, skillId(manifest))}`
        : config.variant === "seedspec-minimal"
        ? `${sharedInstructions.length + 8}. Use \`seedspec init\` and deterministic validation, but do not use \`seedspec audit\`, guided authoring skills, or authoring audit documentation.`
        : config.variant === "seedspec-restructured"
          ? `${sharedInstructions.length + 8}. Use the complete SeedSpec guided authoring audit, then perform a dedicated semantic restructuring pass that records canonical ownership, duplicate removal, decision provenance, and preserved meaning.`
          : `${sharedInstructions.length + 8}. Use the complete SeedSpec guided authoring audit and record each audit area consulted.`,
    ]),
    "",
    "## Untrusted case material",
    "",
    "```json",
    JSON.stringify({ kind: "untrusted_case_material", caseId: config.caseId, stage: config.stage, material: config.untrustedMaterial }, null, 2),
    "```",
    "",
    "## Required outputs",
    "",
    ...config.deliverables.map((deliverable) =>
      `- ${deliverable.required ? "Required" : "Optional"}: \`${deliverable.path === undefined ? deliverable.id : `${workspacePath}/${deliverable.path}`}\` — ${deliverable.description}`),
    "",
    `1. Produce exactly the applicable declared deliverables beneath \`${workspacePath}/\`; do not add a broker-specific deliverable that the case did not request.`,
    `2. Write a concise evidence report at the project root: \`./${reportPath}\`.`,
    `3. Write a trace body (without \`traceId\`) at the project root: \`./${tracePath}\`. Use run ID \`${manifest.runId}\`, sourceRunId \`${envelope.manifest.runId}\`, runner ID \`${manifest.runner.id}\`, and \`reasoning: not-collected\`.`,
    `4. Finalize it with: \`${runnerControl} finalize-trace\`.` ,
    ...(config.stage === "implementation" ? [
      `5. Write an observable decision-ledger body without \`ledgerId\` at \`decision-ledger-draft.json\`, then finalize it with \`${runnerControl} finalize-ledger\`. Record consequential decisions, not hidden reasoning or trivial local coding choices.`,
      "6. State exactly what your environment could not capture. Do not fabricate events, decision provenance, or token usage.",
    ] : [
      "5. State exactly what your environment could not capture. Do not fabricate events or token usage.",
    ]),
    "",
    "Use this shape for the trace draft, replacing the illustrative values and adding zero-based, contiguous observable events:",
    "",
    "```json",
    JSON.stringify({
      schemaVersion: 1,
      runId: manifest.runId,
      sourceRunId: envelope.manifest.runId,
      variant: manifest.variant,
      runner: manifest.runner,
      model: traceModel,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
      capture: { messages: "full", toolCalls: "full", toolResults: "full", timing: "event", usage: "unavailable", artifacts: "paths-and-digests", reasoning: "not-collected" },
      events: [{ sequence: 0, timestamp: "2026-01-01T00:00:00.000Z", kind: "status", actor: "runner", name: "run-started", data: {} }],
      limitations: ["Replace this with capture limitations for the current environment."],
      redactions: [],
    }, null, 2),
    "```",
    "",
    ...(config.stage === "implementation" ? [
      "Use this shape for the decision-ledger draft:",
      "",
      "```json",
      JSON.stringify({
        schemaVersion: 1,
        runId: manifest.runId,
        createdAt: "2026-01-01T00:00:01.000Z",
        entries: [{
          id: "runtime-choice",
          domain: "architecture",
          title: "Runtime choice",
          choice: "Observed choice",
          materiality: { level: "material", basis: "evaluator-assessed", rationale: "Why this changes the realization materially." },
          expectedLatitude: "delegated",
          sources: [{ actor: "package-author", basis: "What authorized or constrained the choice.", evidence: [{ path: "definition/application.md", note: "Relevant authority" }] }],
          alternativesConsidered: [],
          disclosure: "explicit",
          rationale: "Concise observable rationale, not hidden chain-of-thought.",
          evidence: [{ path: "realization/package.json", note: "Where the choice is observable" }],
        }],
        limitations: ["Record unavailable attribution or capture here."],
      }, null, 2),
      "```",
      "",
    ] : []),
    `The run is complete only when artifacts, report, finalized trace${config.stage === "implementation" ? ", and finalized decision ledger" : ""} exist.`,
  ].join("\n");
}

function skillTreatmentInstruction(treatment: string, seedSpecCli: string, selectedSkillId: string): string {
  if (treatment === "no-guidance" || treatment === "embedded-guidance") {
    return `Use \`${seedSpecCli} init\`, validation, inspection, and digest operations, but do not use \`seedspec audit\` or read a separate authoring skill.`;
  }
  if (treatment === "skill-guidance") {
    return `Read \`guidance/${selectedSkillId}/SKILL.md\` completely before authoring and record the consultation, but do not use \`seedspec audit\`.`;
  }
  if (treatment === "audit-guidance") {
    return "Use the complete SeedSpec guided authoring audit and record every audit area consulted, but do not read a supplied authoring skill.";
  }
  if (treatment === "skill-and-audit") {
    return `Read \`guidance/${selectedSkillId}/SKILL.md\` completely before authoring, then use the complete SeedSpec guided authoring audit. Record both forms of guidance consulted.`;
  }
  throw new Error(`Unknown skill forward-test treatment: ${treatment}`);
}
