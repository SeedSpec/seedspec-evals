import { z } from "zod";

import {
  IdentifierSchema,
  JsonValueSchema,
  SafeRelativePathSchema,
  SemVerSchema,
  TechnicalDimensionSchema,
  addUniqueIdIssues,
  deepFreeze,
  type DeepReadonly,
} from "./common.js";

export const EvaluationStageSchema = z.enum(["authorship", "implementation"]);

export const AuthorshipVariantSchema = z.enum([
  "raw-source",
  "markdown-authored",
  "seedspec-minimal",
  "seedspec-guided",
  "seedspec-restructured",
]);
export const ImplementationVariantSchema = z.literal("seedspec-implementation");
export const EvaluationVariantSchema = z.union([
  AuthorshipVariantSchema,
  ImplementationVariantSchema,
]);

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
  variants: z.array(EvaluationVariantSchema).min(1).max(16).optional(),
  description: z.string().trim().min(1).max(4_000),
  measure: EvaluationMeasureSchema,
});

export const HiddenExpectationSchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  variants: z.array(EvaluationVariantSchema).min(1).max(16).optional(),
  description: z.string().trim().min(1).max(4_000),
  severity: z.enum(["minor", "major", "critical"]),
  evaluation: EvaluationMeasureSchema,
  disclosure: z.literal("hidden"),
});

export const PermittedVariabilitySchema = z.strictObject({
  id: IdentifierSchema,
  stage: EvaluationStageSchema,
  variants: z.array(EvaluationVariantSchema).min(1).max(16).optional(),
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

export const TechnicalExpectationSchema = z.strictObject({
  id: IdentifierSchema,
  dimension: TechnicalDimensionSchema,
  description: z.string().trim().min(1).max(4_000),
  method: z.enum(["deterministic", "structured-review"]),
  applicability: z.string().trim().min(1).max(4_000).optional(),
});

export const AdaptationChallengeDefinitionSchema = z.strictObject({
  id: IdentifierSchema,
  description: z.string().trim().min(1).max(8_000),
  purpose: z.string().trim().min(1).max(4_000),
  authorization: z.literal("declared-by-case"),
  constraints: z.array(CaseConstraintSchema).max(64),
  observations: z.array(z.string().trim().min(1).max(4_000)).min(1).max(64),
});

export const ComparisonDecisionAxisSchema = z.strictObject({
  id: IdentifierSchema,
  stages: z.array(EvaluationStageSchema).min(1).max(2),
  title: z.string().trim().min(1).max(512),
  description: z.string().trim().min(1).max(4_000),
  materiality: z.enum(["critical", "material", "minor"]),
});

export const ComparisonObligationAxisSchema = z.strictObject({
  id: IdentifierSchema,
  stages: z.array(EvaluationStageSchema).min(1).max(2),
  kind: z.enum([
    "outcome",
    "behavior",
    "invariant",
    "constraint",
    "forbidden-state",
    "boundary",
    "success-criterion",
  ]),
  description: z.string().trim().min(1).max(4_000),
  importance: z.enum(["critical", "material", "minor"]),
});

export const ComparisonAxesSchema = z.strictObject({
  decisions: z.array(ComparisonDecisionAxisSchema).min(1).max(256),
  obligations: z.array(ComparisonObligationAxisSchema).min(1).max(512),
});

export const AuthorshipVariantContractSchema = z.strictObject({
  objective: z.string().trim().min(1).max(8_000),
  deliverables: z.array(DeliverableSchema).min(1).max(128),
});

export const AuthorshipStageSchema = z.strictObject({
  mode: AuthoringModeSchema,
  sourceMaterials: z.array(SourceMaterialSchema).min(1).max(128),
  constraints: z.array(CaseConstraintSchema).max(128),
  variants: z.strictObject({
    "raw-source": AuthorshipVariantContractSchema,
    "markdown-authored": AuthorshipVariantContractSchema,
    "seedspec-minimal": AuthorshipVariantContractSchema,
    "seedspec-guided": AuthorshipVariantContractSchema,
    "seedspec-restructured": AuthorshipVariantContractSchema,
  }),
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
    technicalExpectations: z.array(TechnicalExpectationSchema).max(256).default([]),
    adaptationChallenges: z.array(AdaptationChallengeDefinitionSchema).max(128).default([]),
    comparisonAxes: ComparisonAxesSchema,
  })
  .superRefine((evaluationCase, context) => {
    addUniqueIdIssues(evaluationCase.authorship.sourceMaterials, context, ["authorship", "sourceMaterials"]);
    addUniqueIdIssues(evaluationCase.authorship.constraints, context, ["authorship", "constraints"]);
    for (const [variant, contract] of Object.entries(evaluationCase.authorship.variants)) {
      addUniqueIdIssues(contract.deliverables, context, ["authorship", "variants", variant, "deliverables"]);
      addDeliverablePathIssues(contract.deliverables, context, ["authorship", "variants", variant, "deliverables"]);
    }
    addUniqueIdIssues(evaluationCase.successCriteria, context, ["successCriteria"]);
    addUniqueIdIssues(evaluationCase.hiddenExpectations, context, ["hiddenExpectations"]);
    addUniqueIdIssues(evaluationCase.permittedVariability, context, ["permittedVariability"]);
    addUniqueIdIssues(evaluationCase.simulatedToolResponses, context, ["simulatedToolResponses"]);
    addUniqueIdIssues(evaluationCase.technicalExpectations, context, ["technicalExpectations"]);
    addUniqueIdIssues(evaluationCase.adaptationChallenges, context, ["adaptationChallenges"]);
    addUniqueIdIssues(evaluationCase.comparisonAxes.decisions, context, ["comparisonAxes", "decisions"]);
    addUniqueIdIssues(evaluationCase.comparisonAxes.obligations, context, ["comparisonAxes", "obligations"]);
    for (const [kind, axes] of Object.entries(evaluationCase.comparisonAxes)) {
      for (const [index, axis] of axes.entries()) {
        if (new Set(axis.stages).size !== axis.stages.length) {
          context.addIssue({ code: "custom", message: "comparison-axis stages must be unique", path: ["comparisonAxes", kind, index, "stages"] });
        }
      }
    }

    if (evaluationCase.implementation !== undefined) {
      addUniqueIdIssues(evaluationCase.implementation.constraints, context, ["implementation", "constraints"]);
      addUniqueIdIssues(evaluationCase.implementation.deliverables, context, ["implementation", "deliverables"]);
    }

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
      if (referenced.variants !== undefined) {
        if (new Set(referenced.variants).size !== referenced.variants.length) {
          context.addIssue({ code: "custom", message: "variants must be unique" });
        }
        const invalid = referenced.variants.filter((variant) => !variantBelongsToStage(variant, referenced.stage));
        if (invalid.length > 0) {
          context.addIssue({
            code: "custom",
            message: `variants do not belong to ${referenced.stage}: ${invalid.join(", ")}`,
          });
        }
      }
    }

    if (evaluationCase.tags !== undefined && new Set(evaluationCase.tags).size !== evaluationCase.tags.length) {
      context.addIssue({ code: "custom", message: "tags must be unique", path: ["tags"] });
    }
  });

export const EvaluationCaseSchema = EvaluationCaseDataSchema.transform((value) => deepFreeze(value));

export type EvaluationStage = z.infer<typeof EvaluationStageSchema>;
export type AuthorshipVariant = z.infer<typeof AuthorshipVariantSchema>;
export type ImplementationVariant = z.infer<typeof ImplementationVariantSchema>;
export type EvaluationVariant = z.infer<typeof EvaluationVariantSchema>;
export type AuthoringMode = z.infer<typeof AuthoringModeSchema>;
export type SourceMaterial = z.infer<typeof SourceMaterialSchema>;
export type CaseConstraint = z.infer<typeof CaseConstraintSchema>;
export type Deliverable = z.infer<typeof DeliverableSchema>;
export type EvaluationMeasure = z.infer<typeof EvaluationMeasureSchema>;
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;
export type HiddenExpectation = z.infer<typeof HiddenExpectationSchema>;
export type PermittedVariability = z.infer<typeof PermittedVariabilitySchema>;
export type SimulatedToolResponse = z.infer<typeof SimulatedToolResponseSchema>;
export type TechnicalExpectation = z.infer<typeof TechnicalExpectationSchema>;
export type AdaptationChallengeDefinition = z.infer<typeof AdaptationChallengeDefinitionSchema>;
export type ComparisonAxes = z.infer<typeof ComparisonAxesSchema>;
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
  readonly variant: EvaluationVariant;
  readonly objective: string;
  readonly sourceMaterials: readonly DeepReadonly<SourceMaterial>[];
  readonly constraints: readonly DeepReadonly<CaseConstraint>[];
  readonly deliverables: readonly DeepReadonly<Deliverable>[];
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
  variant: EvaluationVariant,
): DeepReadonly<RunnableCaseView> {
  if (!variantBelongsToStage(variant, stage)) {
    throw new Error(`Variant ${variant} does not belong to the ${stage} stage`);
  }
  if (stage === "implementation" && input.implementation === undefined) {
    throw new Error(`Case ${input.id} has no implementation stage`);
  }

  const stageDefinition = stage === "authorship"
    ? input.authorship.variants[variant as AuthorshipVariant]
    : input.implementation;
  if (stageDefinition === undefined) throw new Error(`Case ${input.id} has no ${stage} stage`);

  return deepFreeze({
    caseId: input.id,
    caseVersion: input.version,
    stage,
    variant,
    objective: stageDefinition.objective,
    sourceMaterials: stage === "authorship" ? input.authorship.sourceMaterials : [],
    // Authorship constraints, success criteria, and permitted variability are normalized
    // evaluator expectations. The authoring subject receives only original source material,
    // its variant objective, and the requested deliverable shape.
    constraints: stage === "authorship" ? [] : input.implementation?.constraints ?? [],
    deliverables: stageDefinition.deliverables,
  });
}

export function variantsForStage(stage: EvaluationStage): readonly EvaluationVariant[] {
  return stage === "authorship"
    ? AuthorshipVariantSchema.options
    : [ImplementationVariantSchema.value];
}

export function variantBelongsToStage(variant: EvaluationVariant, stage: EvaluationStage): boolean {
  return variantsForStage(stage).includes(variant);
}

export function appliesToVariant(
  variants: readonly EvaluationVariant[] | undefined,
  variant: EvaluationVariant,
): boolean {
  return variants === undefined || variants.includes(variant);
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
