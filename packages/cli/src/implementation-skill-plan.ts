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

export interface ImplementationSkillExperimentPlanOptions {
  readonly cases: readonly LoadedEvaluationCase[];
  readonly models: readonly string[];
  readonly repetitions: number;
  readonly gatewayId: string;
  readonly protocolVersion: string;
  readonly createdAt: string;
  readonly maxSteps: number;
  readonly skillPath: string;
  readonly authoredInput: AuthoredInputBundle;
}

export async function createImplementationSkillExperimentPlan(
  options: ImplementationSkillExperimentPlanOptions,
): Promise<ExperimentPlan> {
  const skillSource = await readFile(options.skillPath, "utf8");
  const skillId = skillName(skillSource);
  const skillDigest = `sha256:${sha256Hex(skillSource)}`;
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
    IMPLEMENTATION_SKILL_TREATMENTS.map((treatment, treatmentIndex) => {
      const trustedInstructions = implementationInstructions(
        treatment,
        skillSource,
        skillId,
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
          version: "0.1.0-alpha.1",
          configuration: { digest: skillDigest, delivery: "runner-local-skill" },
        });
      }
      const manifest = createRunManifest({
        ...baseManifest,
        repetition: envelope.manifest.repetition * IMPLEMENTATION_SKILL_TREATMENTS.length + treatmentIndex,
        instructionsDigest,
        tools,
        configuration: {
          ...(envelope.manifest.configuration ?? {}),
          experimentKind: "implementation-skill",
          treatmentId: treatment,
          guidanceDelivery: treatment,
          skillId,
          skillDigest,
        },
      });
      const config = RunAgentConfigSchema.parse({
        ...envelope.submission.config,
        runId: manifest.runId,
        trustedInstructions,
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
            treatment,
            skillId,
            skillDigest,
            ...(skillEnabled ? { skillSource } : {}),
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
  return [
    ...common,
    `Before implementation, read guidance/${skillId}/SKILL.md completely and consult it as package-scoped implementation guidance. Record the consultation and its observable influence in the report and trace.`,
  ];
}

function skillName(source: string): string {
  const match = /^---\s*\n[\s\S]*?^name:\s*([a-z0-9-]+)\s*$[\s\S]*?^---\s*$/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("Implementation-skill input must declare a lowercase hyphenated frontmatter name.");
  }
  return match[1];
}
