import { readFile } from "node:fs/promises";
import { arch, platform } from "node:os";

import {
  createRunManifest,
  createRunnableCaseView,
  createSimulationFixtureView,
  contentId,
  ArtifactIdSchema,
  sha256Hex,
  stableJson,
  type EvaluationStage,
  type EvaluationVariant,
  type JsonValue,
} from "@seedspec/eval-core";
import type { LoadedEvaluationCase } from "@seedspec/eval-case-library";
import { HARNESS_VERSION, RunAgentConfigSchema } from "@seedspec/eval-harness";

import { ExperimentPlanSchema, type ExperimentPlan } from "./contracts.js";
import { FROZEN_PROTOCOL_SNAPSHOT } from "./protocol-snapshot.generated.js";

const EVALUATION_VERSION = "0.1.0-alpha.1";

export interface PlanOptions {
  readonly cases: readonly LoadedEvaluationCase[];
  readonly stage: EvaluationStage;
  readonly variants: readonly EvaluationVariant[];
  readonly models: readonly string[];
  readonly repetitions: number;
  readonly gatewayId: string;
  readonly protocolVersion: string;
  readonly createdAt: string;
  readonly maxSteps: number;
  readonly authoredPackageArtifactId?: string;
}

export async function createExperimentPlan(options: PlanOptions): Promise<ExperimentPlan> {
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 100) {
    throw new Error("Repetitions must be an integer from 1 to 100.");
  }
  if (options.models.length === 0) throw new Error("At least one model is required.");
  if (options.variants.length === 0) throw new Error("At least one evaluation variant is required.");
  if (options.stage === "implementation" && options.authoredPackageArtifactId === undefined) {
    throw new Error("Implementation planning requires --authored-package-artifact.");
  }

  const protocolSnapshot = FROZEN_PROTOCOL_SNAPSHOT;
  if (options.protocolVersion !== protocolSnapshot.version) {
    throw new Error(`Protocol version ${options.protocolVersion} does not match the frozen evaluation snapshot ${protocolSnapshot.version}. Run npm run protocol:sync before planning another revision.`);
  }
  const envelopes: unknown[] = [];

  for (const loaded of options.cases) {
    const source = await readFile(loaded.filePath, "utf8");
    const caseDigest = `sha256:${sha256Hex(source)}`;
    const fixture = createSimulationFixtureView(loaded.case);
    const simulatedAuthorResponses = simulationResponses(fixture.simulatedToolResponses);
    for (const variant of options.variants) {
      const view = createRunnableCaseView(loaded.case, options.stage, variant);
      const { variant: _runnerHiddenVariant, ...runnerView } = view;
      void _runnerHiddenVariant;
      const untrustedMaterial = stableJson(runnerView as unknown as JsonValue);
      const trustedInstructions = defaultTrustedInstructions(options.stage, variant);
      const caseTrustedInstructions = Object.keys(simulatedAuthorResponses).length === 0
        ? trustedInstructions
        : [
            ...trustedInstructions,
            `The simulated author can answer these clarification topics through ask_author: ${Object.keys(simulatedAuthorResponses).sort().join(", ")}. Use the exact questionId only when its topic is materially relevant.`,
          ];
      const instructionsDigest = `sha256:${sha256Hex(stableJson(caseTrustedInstructions))}`;

      for (const model of options.models) {
        for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
        const manifest = createRunManifest({
          schemaVersion: 1,
          case: { id: loaded.case.id, version: loaded.case.version, digest: caseDigest },
          target: options.stage === "authorship"
            ? { stage: "authorship" }
            : {
                stage: "implementation",
                authoredPackageArtifactId: ArtifactIdSchema.parse(options.authoredPackageArtifactId),
              },
          variant,
          repetition,
          createdAt: options.createdAt,
          protocol: { name: "seedspec", version: options.protocolVersion, revision: protocolSnapshot.sourceDigest },
          runner: {
            id: "cloudflare-think",
            kind: "agent",
            version: HARNESS_VERSION,
            environment: {
              runtime: "cloudflare-workers",
              runtimeVersion: "2026-07-21",
              operatingSystem: platform(),
              architecture: arch(),
            },
          },
          model: {
            provider: providerForModel(model),
            modelId: model,
            parameters: {},
            routing: { gateway: options.gatewayId },
          },
          harness: { name: "seedspec-eval-harness", version: HARNESS_VERSION },
          tools: toolsForVariant(options.stage, variant, protocolSnapshot),
          evaluators: [
            { id: "seedspec-eval-deterministic", kind: "deterministic", version: EVALUATION_VERSION },
            {
              id: `seedspec-${options.stage}-rubric`,
              kind: "rubric",
              version: EVALUATION_VERSION,
            },
          ],
          limits: {
            maxTurns: 1,
            maxDurationMs: 15 * 60 * 1000,
            maxInputBytes: 384 * 1024,
            maxOutputBytes: 8 * 1024 * 1024,
          },
          instructionsDigest,
          configuration: {
            gatewayId: options.gatewayId,
            maxSteps: options.maxSteps,
            evaluationVariant: variant,
            protocolSourceCommit: protocolSnapshot.sourceCommit,
            untrustedMaterialDigest: `sha256:${sha256Hex(untrustedMaterial)}`,
            simulatedAuthorResponsesDigest:
              `sha256:${sha256Hex(stableJson(simulatedAuthorResponses))}`,
          },
        });
        const config = RunAgentConfigSchema.parse({
          runId: manifest.runId,
          caseId: loaded.case.id,
          stage: options.stage,
          variant,
          model,
          gatewayId: options.gatewayId,
          maxSteps: options.maxSteps,
          trustedInstructions: caseTrustedInstructions,
          untrustedMaterial,
          simulatedAuthorResponses,
        });
        envelopes.push({
          schemaVersion: 1,
          manifest,
          submission: {
            config,
            idempotencyKey: `${manifest.runId}:initial`,
            metadata: {
              caseVersion: loaded.case.version,
              repetition,
              evaluationVersion: EVALUATION_VERSION,
              variant,
            },
          },
        });
        }
      }
    }
  }

  const planBody = { createdAt: options.createdAt, envelopes };
  return ExperimentPlanSchema.parse({
    schemaVersion: 1,
    planId: contentId("plan", planBody as unknown as JsonValue),
    ...planBody,
  });
}

function simulationResponses(
  responses: ReturnType<typeof createSimulationFixtureView>["simulatedToolResponses"],
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const response of responses) {
    if (response.toolName !== "author.ask") continue;
    const questionId = response.request["questionId"];
    const responseValue: unknown = response.response;
    const answer = isRecord(responseValue)
      ? responseValue["answer"]
      : undefined;
    if (typeof questionId === "string" && typeof answer === "string") mapped[questionId] = answer;
  }
  return mapped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerForModel(model: string): string {
  if (model.startsWith("@cf/")) return "cloudflare";
  const provider = model.split("/", 1)[0];
  if (provider === undefined || provider.length === 0) throw new Error(`Cannot infer provider from model: ${model}`);
  return provider.replaceAll(".", "-");
}

function defaultTrustedInstructions(stage: EvaluationStage, variant: EvaluationVariant): string[] {
  if (variant === "source-only") {
    return [
      "Produce the requested implementation-ready instructions in instructions.md using only the supplied author material and explicit simulated-author answers.",
      "Define the desired outcome, obligations, boundaries, material uncertainty, and observable success without prescribing architecture unless the source requires it.",
      "Ask the simulated author only about consequential uncertainty; label any remaining uncertainty instead of silently inventing intent.",
      "Write instructions.md before concluding, then summarize unresolved questions and the evidence used.",
    ];
  }
  if (stage === "authorship") {
    const common = [
      "Turn the supplied author material into a complete SeedSpec package inside the workspace using the frozen protocol revision named in the run manifest.",
      "Keep primary author intent, meaningful configuration, implementation profiles, resources, applied end-user intent, and evidence scopes in their defined authority order.",
      "Use the package kind as a discovery lens. Surface consequential uncertainty instead of silently inventing an answer.",
      "Distinguish verification evidence from adoption, operation, and outcome evidence; never claim that package validation proves the real-world outcome.",
    ];
    if (variant === "seedspec-scaffold") {
      return [
        ...common,
        "Use only the SeedSpec scaffold and deterministic validation path. Do not request or apply guided authoring audit instructions.",
        "Write every distributable package file and pass deterministic validation before concluding.",
      ];
    }
    return [
      ...common,
      "Use the complete guided authoring review: concern separation, kind-aware discovery, material ambiguity, internal consistency, progressive hardening, and agent-ready handoff.",
      "Write every distributable package file before concluding, then summarize unresolved questions and the evidence used.",
    ];
  }
  return [
    "Realize the resolved SeedSpec package in the workspace and keep every consequential choice traceable to intent or explicit user direction.",
    "Treat implementation profiles as subordinate implementation guidance and preserve permitted variation.",
    "Produce the declared outcome and acceptance evidence; do not claim success from plans or source files alone.",
    "Record material deviations, unsupported assumptions, verification limits, and reproducible evidence before concluding.",
  ];
}

function toolsForVariant(
  stage: EvaluationStage,
  variant: EvaluationVariant,
  protocolSnapshot: typeof FROZEN_PROTOCOL_SNAPSHOT,
) {
  const workspace = {
    name: "think-workspace",
    version: HARNESS_VERSION,
    configuration: { bash: false, network: false, reasoningPersistence: false },
  };
  const author = { name: "seedspec-simulated-author", version: HARNESS_VERSION };
  if (variant === "source-only") return [workspace, author];
  const packageTools = [
    {
      name: "seedspec-package-check",
      version: HARNESS_VERSION,
      configuration: {
        protocolVersion: "0.1",
        protocolPackage: `@seedspec/protocol@${protocolSnapshot.version}`,
        protocolRevision: protocolSnapshot.sourceDigest,
        adapter: "think-workspace",
      },
    },
    {
      name: "seedspec-package-digest",
      version: HARNESS_VERSION,
      configuration: { algorithm: "seedspec-package-sha256-v1" },
    },
  ];
  if (stage === "implementation" || variant === "seedspec-scaffold") {
    return [workspace, author, ...packageTools];
  }
  return [
    workspace,
    author,
    ...packageTools,
    { name: "seedspec-kind-lint", version: HARNESS_VERSION },
    { name: "seedspec-audit-guidance", version: HARNESS_VERSION, configuration: { areas: 6 } },
  ];
}
