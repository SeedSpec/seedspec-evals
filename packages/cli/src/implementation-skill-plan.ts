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
export type ImplementationSkillAdapter = "none" | "gstack-plan-eng-review";

export interface ImplementationSkillExperimentPlanOptions {
  readonly cases: readonly LoadedEvaluationCase[];
  readonly models: readonly string[];
  readonly repetitions: number;
  readonly gatewayId: string;
  readonly protocolVersion: string;
  readonly createdAt: string;
  readonly maxSteps: number;
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
  if (skillAdapter === "gstack-plan-eng-review" && treatments.includes("embedded-guidance")) {
    throw new Error("The gstack plan-review adapter is a multi-file workflow and cannot be embedded as one trusted instruction.");
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
  return [
    ...common,
    `Before implementation, read guidance/${skillId}/SKILL.md completely and consult it as package-scoped implementation guidance. Record the consultation and its observable influence in the report and trace.`,
  ];
}

function skillVersion(source: string): string {
  return /^version:\s*([A-Za-z0-9._-]+)\s*$/m.exec(source)?.[1] ?? "0.1.0-alpha.1";
}

function skillName(source: string): string {
  const match = /^---\s*\n[\s\S]*?^name:\s*([a-z0-9-]+)\s*$[\s\S]*?^---\s*$/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("Implementation-skill input must declare a lowercase hyphenated frontmatter name.");
  }
  return match[1];
}
