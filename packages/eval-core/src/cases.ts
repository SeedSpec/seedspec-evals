import { z } from "zod";

import {
  IdentifierSchema,
  JsonValueSchema,
  SafeRelativePathSchema,
  SemVerSchema,
  addUniqueIdIssues,
  deepFreeze,
  type DeepReadonly,
} from "./common.js";

export const EvaluationStageSchema = z.enum(["authorship", "implementation"]);

export const AuthoringModeSchema = z.enum([
  "sparse-application",
  "existing-product-feature",
  "cross-system-workflow",
  "extract-existing-solution",
]);

export const SourceMaterialOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("inline") }),
  z.strictObject({ kind: z.literal("file"), reference: SafeRelativePathSchema }),
  z.strictObject({ kind: z.literal("url"), reference: z.url() }),
]);

export const SourceMaterialSchema = z.strictObject({
  id: IdentifierSchema,
  label: z.string().trim().min(1).max(256),
  mediaType: z.string().trim().min(1).max(256),
  content: z.string().min(1).max(1_000_000),
  origin: SourceMaterialOriginSchema,
  trust: z.literal("untrusted"),
});

export const CaseConstraintSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.enum(["requirement", "prohibition", "resource-limit", "compatibility"]),
  description: z.string().trim().min(1).max(4_000),
});

export const DeliverableSchema = z.strictObject({
  id: IdentifierSchema,
  description: z.string().trim().min(1).max(4_000),
  required: z.boolean(),
  path: SafeRelativePathSchema.optional(),
  mediaType: z.string().trim().min(1).max(256).optional(),
});

export const EvaluationMeasureSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("deterministic"),
    check: IdentifierSchema,
    target: JsonValueSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("rubric"),
    rubric: z.string().trim().min(1).max(8_000),
    maxPoints: z.number().int().positive().max(10_000),
  }),
]);

export const SuccessCriterionSchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  description: z.string().trim().min(1).max(4_000),
  measure: EvaluationMeasureSchema,
});

export const HiddenExpectationSchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  description: z.string().trim().min(1).max(4_000),
  severity: z.enum(["minor", "major", "critical"]),
  evaluation: EvaluationMeasureSchema,
  disclosure: z.literal("hidden"),
});

export const PermittedVariabilitySchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  dimension: IdentifierSchema,
  description: z.string().trim().min(1).max(4_000),
  bounds: z.string().trim().min(1).max(4_000).optional(),
  examples: z.array(z.string().trim().min(1).max(2_000)).max(32).optional(),
});

export const SimulatedToolResponseSchema = z.strictObject({
  id: IdentifierSchema,
  toolName: IdentifierSchema,
  request: z.record(z.string(), JsonValueSchema),
  response: JsonValueSchema,
});

export const AuthorshipStageSchema = z.strictObject({
  mode: AuthoringModeSchema,
  objective: z.string().trim().min(1).max(8_000),
  sourceMaterials: z.array(SourceMaterialSchema).min(1).max(128),
  constraints: z.array(CaseConstraintSchema).max(128),
  deliverables: z.array(DeliverableSchema).min(1).max(128),
});

export const ImplementationStageSchema = z.strictObject({
  objective: z.string().trim().min(1).max(8_000),
  constraints: z.array(CaseConstraintSchema).max(128),
  deliverables: z.array(DeliverableSchema).min(1).max(128),
});

const EvaluationCaseDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: IdentifierSchema,
    version: SemVerSchema,
    title: z.string().trim().min(1).max(256),
    description: z.string().trim().min(1).max(8_000).optional(),
    tags: z.array(IdentifierSchema).max(32).optional(),
    authorship: AuthorshipStageSchema,
    implementation: ImplementationStageSchema.optional(),
    successCriteria: z.array(SuccessCriterionSchema).min(1).max(256),
    hiddenExpectations: z.array(HiddenExpectationSchema).max(256),
    permittedVariability: z.array(PermittedVariabilitySchema).max(256),
    simulatedToolResponses: z.array(SimulatedToolResponseSchema).max(256),
  })
  .superRefine((evaluationCase, context) => {
    addUniqueIdIssues(evaluationCase.authorship.sourceMaterials, context, ["authorship", "sourceMaterials"]);
    addUniqueIdIssues(evaluationCase.authorship.constraints, context, ["authorship", "constraints"]);
    addUniqueIdIssues(evaluationCase.authorship.deliverables, context, ["authorship", "deliverables"]);
    addUniqueIdIssues(evaluationCase.successCriteria, context, ["successCriteria"]);
    addUniqueIdIssues(evaluationCase.hiddenExpectations, context, ["hiddenExpectations"]);
    addUniqueIdIssues(evaluationCase.permittedVariability, context, ["permittedVariability"]);
    addUniqueIdIssues(evaluationCase.simulatedToolResponses, context, ["simulatedToolResponses"]);

    if (evaluationCase.implementation !== undefined) {
      addUniqueIdIssues(evaluationCase.implementation.constraints, context, ["implementation", "constraints"]);
      addUniqueIdIssues(evaluationCase.implementation.deliverables, context, ["implementation", "deliverables"]);
    }

    addDeliverablePathIssues(evaluationCase.authorship.deliverables, context, ["authorship", "deliverables"]);
    if (evaluationCase.implementation !== undefined) {
      addDeliverablePathIssues(
        evaluationCase.implementation.deliverables,
        context,
        ["implementation", "deliverables"],
      );
    }

    const stageReferences = [
      ...evaluationCase.successCriteria,
      ...evaluationCase.hiddenExpectations,
      ...evaluationCase.permittedVariability,
    ];
    for (const referenced of stageReferences) {
      if (referenced.stage === "implementation" && evaluationCase.implementation === undefined) {
        context.addIssue({
          code: "custom",
          message: "implementation-stage evaluation data requires an implementation stage",
        });
      }
    }

    if (evaluationCase.tags !== undefined && new Set(evaluationCase.tags).size !== evaluationCase.tags.length) {
      context.addIssue({ code: "custom", message: "tags must be unique", path: ["tags"] });
    }
  });

export const EvaluationCaseSchema = EvaluationCaseDataSchema.transform((value) => deepFreeze(value));

export type EvaluationStage = z.infer<typeof EvaluationStageSchema>;
export type AuthoringMode = z.infer<typeof AuthoringModeSchema>;
export type SourceMaterial = z.infer<typeof SourceMaterialSchema>;
export type CaseConstraint = z.infer<typeof CaseConstraintSchema>;
export type Deliverable = z.infer<typeof DeliverableSchema>;
export type EvaluationMeasure = z.infer<typeof EvaluationMeasureSchema>;
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;
export type HiddenExpectation = z.infer<typeof HiddenExpectationSchema>;
export type PermittedVariability = z.infer<typeof PermittedVariabilitySchema>;
export type SimulatedToolResponse = z.infer<typeof SimulatedToolResponseSchema>;
export type AuthorshipStage = z.infer<typeof AuthorshipStageSchema>;
export type ImplementationStage = z.infer<typeof ImplementationStageSchema>;
export type EvaluationCase = DeepReadonly<z.infer<typeof EvaluationCaseDataSchema>>;

export function parseEvaluationCase(input: unknown): EvaluationCase {
  return EvaluationCaseSchema.parse(input);
}

export interface RunnableCaseView {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly stage: EvaluationStage;
  readonly objective: string;
  readonly sourceMaterials: readonly DeepReadonly<SourceMaterial>[];
  readonly constraints: readonly DeepReadonly<CaseConstraint>[];
  readonly deliverables: readonly DeepReadonly<Deliverable>[];
  readonly successCriteria: readonly DeepReadonly<SuccessCriterion>[];
  readonly permittedVariability: readonly DeepReadonly<PermittedVariability>[];
}

export interface SimulationFixtureView {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly simulatedToolResponses: readonly DeepReadonly<SimulatedToolResponse>[];
}

/** Creates the runner-facing projection. Hidden expectations cannot appear in its type or output. */
export function createRunnableCaseView(
  input: EvaluationCase,
  stage: EvaluationStage,
): DeepReadonly<RunnableCaseView> {
  if (stage === "implementation" && input.implementation === undefined) {
    throw new Error(`Case ${input.id} has no implementation stage`);
  }

  const stageDefinition = stage === "authorship" ? input.authorship : input.implementation;
  if (stageDefinition === undefined) throw new Error(`Case ${input.id} has no ${stage} stage`);

  return deepFreeze({
    caseId: input.id,
    caseVersion: input.version,
    stage,
    objective: stageDefinition.objective,
    sourceMaterials: stage === "authorship" ? input.authorship.sourceMaterials : [],
    constraints: stageDefinition.constraints,
    deliverables: stageDefinition.deliverables,
    successCriteria: input.successCriteria.filter((criterion) => criterion.stage === stage),
    permittedVariability: input.permittedVariability.filter((variability) => variability.stage === stage),
  });
}

/** Control-plane-only fixture data. Never include this view in a runner or model prompt. */
export function createSimulationFixtureView(input: EvaluationCase): DeepReadonly<SimulationFixtureView> {
  return deepFreeze({
    caseId: input.id,
    caseVersion: input.version,
    simulatedToolResponses: input.simulatedToolResponses,
  });
}

function addDeliverablePathIssues(
  deliverables: readonly { path?: string | undefined }[],
  context: z.core.$RefinementCtx,
  pathPrefix: PropertyKey[],
): void {
  const seen = new Map<string, number>();
  for (const [index, deliverable] of deliverables.entries()) {
    if (deliverable.path === undefined) continue;
    const collisionKey = deliverable.path.toLowerCase();
    const previous = seen.get(collisionKey);
    if (previous !== undefined) {
      context.addIssue({
        code: "custom",
        message: `deliverable path collides with item ${String(previous)}`,
        path: [...pathPrefix, index, "path"],
      });
    } else {
      seen.set(collisionKey, index);
    }
  }
}
