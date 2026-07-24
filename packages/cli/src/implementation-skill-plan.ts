import { readFile } from "node:fs/promises";

import {
  createRunManifest,
  contentId,
  sha256Hex,
  stableJson,
  type AuthoredInputBundle,
  type JsonValue,
  type RunManifestInput,
} from "@seedspec/eval-core";
import type { LoadedEvaluationCase } from "@seedspec/eval-case-library";
import { ExperimentPlanSchema, RunAgentConfigSchema } from "@seedspec/eval-harness";

import type { ExperimentPlan } from "./contracts.js";
import { createExperimentPlan } from "./plan.js";

export const IMPLEMENTATION_SKILL_TREATMENTS = [
  "no-guidance",
  "embedded-guidance",
  "skill-guidance",
] as const;

export type ImplementationSkillTreatment = typeof IMPLEMENTATION_SKILL_TREATMENTS[number];
export type ImplementationSkillAdapter =
  | "none"
  | "gstack-plan-eng-review"
  | "gstack-engineering-suite"
  | "compound-engineering-core-loop";

export interface ImplementationSkillExperimentPlanOptions {
  readonly cases: readonly LoadedEvaluationCase[];
  readonly models: readonly string[];
  readonly repetitions: number;
  readonly gatewayId: string;
  readonly protocolVersion: string;
  readonly createdAt: string;
  readonly maxSteps: number;
  readonly maxDurationMs?: number;
  readonly skillPath: string;
  readonly guidanceInput: AuthoredInputBundle;
  readonly authoredInput: AuthoredInputBundle;
  readonly treatments?: readonly ImplementationSkillTreatment[];
  readonly skillTreatmentId?: string;
  readonly skillAdapter?: ImplementationSkillAdapter;
  readonly skillSourceRepository?: string;
  readonly skillSourceRevision?: string;
  readonly skillLicense?: string;
}

export async function createImplementationSkillExperimentPlan(
  options: ImplementationSkillExperimentPlanOptions,
): Promise<ExperimentPlan> {
  const skillSource = await readFile(options.skillPath, "utf8");
  const skillId = skillName(skillSource);
  const skillDigest = options.guidanceInput.digest;
  const skillEntrypointDigest = `sha256:${sha256Hex(skillSource)}`;
  const treatments = options.treatments ?? IMPLEMENTATION_SKILL_TREATMENTS;
  if (treatments.length === 0 || new Set(treatments).size !== treatments.length) {
    throw new Error("Implementation-skill treatments must be non-empty and unique.");
  }
  const skillTreatmentId = options.skillTreatmentId ?? "skill-guidance";
  if (!/^[a-z0-9-]+$/.test(skillTreatmentId)) {
    throw new Error("Skill treatment ID must be a lowercase hyphenated identifier.");
  }
  const skillAdapter = options.skillAdapter ?? "none";
  if (skillAdapter !== "none" && treatments.includes("embedded-guidance")) {
    throw new Error("Multi-file skill adapters cannot be embedded as one trusted instruction.");
  }
  const base = await createExperimentPlan({
    cases: options.cases,
    stage: "implementation",
    variants: ["seedspec-implementation"],
    models: options.models,
    repetitions: options.repetitions,
    gatewayId: options.gatewayId,
    protocolVersion: options.protocolVersion,
    createdAt: options.createdAt,
    maxSteps: options.maxSteps,
    ...(options.maxDurationMs === undefined ? {} : { maxDurationMs: options.maxDurationMs }),
    authoredInput: options.authoredInput,
  });

  const envelopes = base.envelopes.flatMap((envelope) =>
    treatments.map((treatment, treatmentIndex) => {
      const trustedInstructions = implementationInstructions(
        treatment,
        skillSource,
        skillId,
        skillAdapter,
      ).map((instruction) => instruction.trim());
      const instructionsDigest = `sha256:${sha256Hex(stableJson(trustedInstructions))}`;
      const { runId: _baseRunId, ...readonlyBaseManifest } = envelope.manifest;
      void _baseRunId;
      const baseManifest = JSON.parse(JSON.stringify(readonlyBaseManifest)) as RunManifestInput;
      const skillEnabled = treatment === "skill-guidance";
      const tools = envelope.manifest.tools.map((tool) => ({ ...tool }));
      if (skillEnabled) {
        tools.push({
          name: skillId,
          version: skillVersion(skillSource),
          configuration: {
            digest: skillDigest,
            entrypointDigest: skillEntrypointDigest,
            delivery: "runner-local-skill",
          },
        });
      }
      const treatmentId = skillEnabled ? skillTreatmentId : treatment;
      const manifest = createRunManifest({
        ...baseManifest,
        repetition: envelope.manifest.repetition * treatments.length + treatmentIndex,
        instructionsDigest,
        tools,
        configuration: {
          ...(envelope.manifest.configuration ?? {}),
          experimentKind: "implementation-skill",
          treatmentId,
          guidanceDelivery: treatment,
          skillId,
          skillDigest,
          skillEntrypointDigest,
          skillAdapter,
          ...(skillEnabled ? {
            guidanceInputArtifactId: options.guidanceInput.artifactId,
            guidanceInputDigest: options.guidanceInput.digest,
          } : {}),
          ...(options.skillSourceRepository === undefined
            ? {}
            : { skillSourceRepository: options.skillSourceRepository }),
          ...(options.skillSourceRevision === undefined
            ? {}
            : { skillSourceRevision: options.skillSourceRevision }),
          ...(options.skillLicense === undefined
            ? {}
            : { skillLicense: options.skillLicense }),
        },
      });
      const config = RunAgentConfigSchema.parse({
        ...envelope.submission.config,
        runId: manifest.runId,
        trustedInstructions,
        ...(skillEnabled ? { guidanceInput: options.guidanceInput } : {}),
      });
      return {
        schemaVersion: 1 as const,
        manifest,
        submission: {
          config,
          idempotencyKey: `${manifest.runId}:initial`,
          metadata: {
            ...(envelope.submission.metadata ?? {}),
            experimentKind: "implementation-skill",
            treatment: treatmentId,
            guidanceDelivery: treatment,
            skillId,
            skillDigest,
          },
        },
      };
    }),
  );
  const planBody = { createdAt: options.createdAt, envelopes };
  return ExperimentPlanSchema.parse({
    schemaVersion: 1,
    planId: contentId("plan", planBody as unknown as JsonValue),
    ...planBody,
  });
}

function implementationInstructions(
  treatment: ImplementationSkillTreatment,
  skillSource: string,
  skillId: string,
  skillAdapter: ImplementationSkillAdapter,
): string[] {
  const common = [
    "Implement the immutable authored package mounted at input/authored. Produce the case's declared working realization and acceptance evidence beneath workspace/; do not rewrite the authored package.",
    "Treat package intent and resolved end-user choices as authoritative. Treat implementation profiles as subordinate guidance, preserve permitted implementation latitude, and record consequential decisions through the supplied decision ledger.",
    "Deliver working behavior and distinguishing verification, not plans, code-shaped placeholders, or claims based only on source-file presence.",
    "Use only locally available runtimes and dependencies. Keep the realization self-contained and do not make network access or package installation a condition of evaluation.",
    "The declared adaptation challenge is evaluator context for maintainability. Do not implement it in the baseline realization.",
  ];
  if (treatment === "no-guidance") {
    return [
      ...common,
      "Use ordinary implementation judgment. Do not read or claim consultation of a supplied implementation skill.",
    ];
  }
  if (treatment === "embedded-guidance") {
    return [
      ...common,
      "Apply the following implementation method as direct runner instructions. Do not read or claim consultation of a separate implementation skill.",
      skillSource,
    ];
  }
  if (skillAdapter === "gstack-plan-eng-review") {
    return [
      ...common,
      "Before consulting the supplied review skill, inspect the authored package and write workspace/realization/TECHNICAL_PLAN.md inside the declared realization deliverable. The plan must identify the intended architecture, authority boundaries, state and data flow, failure modes, verification strategy, and implementation sequence.",
      `Then read guidance/${skillId}/SKILL.md and guidance/${skillId}/sections/review-sections.md completely. Use their technical plan-review method against workspace/realization/TECHNICAL_PLAN.md before writing implementation code.`,
      "Controlled-run adapter: the upstream skill assumes an installed gstack environment and an interactive user. No gstack binaries, telemetry, global brain, update checks, external Codex review, or AskUserQuestion tool are available here. Skip only those operational integrations. Treat this run as a spawned/headless review, choose each explicitly recommended option unless it conflicts with fixed package intent, and record every such choice in workspace/realization/TECHNICAL_PLAN.md.",
      "Execute all substantive scope, architecture, code-quality, test, performance, failure-mode, evidence-calibration, and completion-gate steps that can operate on the local plan and repository. After implementation, review the realized code against the accepted plan, correct supported findings, and preserve the review report in workspace/realization/TECHNICAL_PLAN.md.",
      "Record the exact upstream skill files consulted, the controlled-run adaptations applied, and their observable influence in report.md and the trace.",
    ];
  }
  if (skillAdapter === "compound-engineering-core-loop") {
    return [
      ...common,
      `Read guidance/${skillId}/SKILL.md completely. It is the controlled-run entrypoint for the supplied Compound Engineering suite.`,
      "Execute the suite's implementation-quality spine in order: ce-plan, ce-work, ce-simplify-code, then ce-code-review. Plan the implementation, implement and locally verify it, simplify substantive code where useful, then review the realized code and correct supported findings. Do not merely cite the skills or collapse their distinct gates into an unrecorded generic review.",
      "Controlled-run adapter: the SeedSpec package is the immutable requirements source, so do not invoke upstream brainstorming or revise product intent. Run planning non-interactively from the package and resolved end-user choices. Run work in caller-owned-tail mode so the suite adapter—not upstream shipping automation—owns completion.",
      "No publishing, branch push, pull request, CI-watch, Proof publishing, telemetry, global memory, external cross-model dispatch, or interactive question tool is available. Skip only those operational integrations. Use inline or serial fallbacks when specialist-subagent dispatch is unavailable.",
      "Do not run the compounding/knowledge-capture phase: it improves future sessions rather than the implementation being scored. Do not run browser testing unless the realization exposes a browser user interface and a locally usable browser driver is already available.",
      `Consult the member skills only through the frozen paths under guidance/${skillId}/members/. Record each member as consulted, skipped, or unavailable; its order; files actually read; artifacts produced; supported findings applied or rejected; and its observable influence in workspace/realization/SUITE_EXECUTION.md, report.md, and the trace.`,
      "The final implementation must still satisfy the package acceptance obligations. Suite procedures are subordinate implementation guidance and cannot weaken, replace, or reinterpret authored intent.",
    ];
  }
  if (skillAdapter === "gstack-engineering-suite") {
    return [
      ...common,
      `Read guidance/${skillId}/SKILL.md completely. It is the controlled-run entrypoint for the supplied gstack engineering suite.`,
      "Execute the suite in order: plan-eng-review, ordinary implementation, review, conditional qa, then the local verification portion of ship. Do not merely cite the member skills or collapse their distinct gates into an unrecorded generic review.",
      "Controlled-run adapter: the SeedSpec package is the immutable product authority. Write workspace/realization/TECHNICAL_PLAN.md, apply plan-eng-review in spawned/headless mode, and choose explicit recommended options unless they conflict with authored intent.",
      "No installed gstack runtime, telemetry, update checks, global brain, external Codex pass, AskUserQuestion tool, remote git operation, versioning, changelog, deployment, or PR workflow is available. Resolve upstream hard-coded skill paths to the frozen member directories. Use inline or serial review fallbacks when specialist-agent dispatch is unavailable.",
      "After implementation, run review against the realized diff and correct supported findings. Run qa only when the realization exposes a browser interface and a locally usable browser driver is already available; otherwise record the capability-based skip. Apply ship only as a final local gate for tests, coverage quality, plan completion, scope drift, and fresh verification. Stop before release mutation, commit, push, documentation sync, or PR creation.",
      `Record every member as consulted, skipped, or unavailable; its order; exact files read; artifacts produced; findings applied or rejected; and observable influence in workspace/realization/SUITE_EXECUTION.md, report.md, and the trace. A mounted member is not consulted unless its SKILL.md was actually read.`,
      "The final implementation must still satisfy the package acceptance obligations. Suite procedures are subordinate implementation guidance and cannot weaken, replace, or reinterpret authored intent.",
    ];
  }
  return [
    ...common,
    `Before implementation, read guidance/${skillId}/SKILL.md completely and consult it as package-scoped implementation guidance. Record the consultation and its observable influence in the report and trace.`,
  ];
}

function skillVersion(source: string): string {
  return /^version:\s*([A-Za-z0-9._-]+)\s*$/m.exec(source)?.[1] ?? "0.2.0";
}

function skillName(source: string): string {
  const match = /^---\s*\n[\s\S]*?^name:\s*([a-z0-9-]+)\s*$[\s\S]*?^---\s*$/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("Implementation-skill input must declare a lowercase hyphenated frontmatter name.");
  }
  return match[1];
}
