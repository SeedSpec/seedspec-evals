import { z } from "zod";

import {
  IdentifierSchema,
  JsonObjectSchema,
  SemVerSchema,
  Sha256DigestSchema,
} from "./common.js";

const RevisionFields = {
  version: SemVerSchema,
  revision: Sha256DigestSchema.optional(),
} as const;

export const ProtocolVersionMetadataSchema = z.strictObject({
  name: IdentifierSchema,
  ...RevisionFields,
});

export const ToolVersionMetadataSchema = z.strictObject({
  name: IdentifierSchema,
  ...RevisionFields,
  configuration: JsonObjectSchema.optional(),
});

export const RunnerMetadataSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.enum(["local", "remote", "agent"]),
  ...RevisionFields,
  environment: z
    .strictObject({
      runtime: z.string().min(1).max(128),
      runtimeVersion: z.string().min(1).max(128),
      operatingSystem: z.string().min(1).max(128).optional(),
      architecture: z.string().min(1).max(64).optional(),
    })
    .optional(),
});

export const ModelParametersSchema = z.strictObject({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  seed: z.number().int().safe().optional(),
  additional: JsonObjectSchema.optional(),
});

export const ModelMetadataSchema = z.strictObject({
  provider: IdentifierSchema,
  modelId: z.string().trim().min(1).max(256),
  snapshot: z.string().trim().min(1).max(256).optional(),
  parameters: ModelParametersSchema,
  routing: z
    .strictObject({
      gateway: z.string().trim().min(1).max(256).optional(),
      region: z.string().trim().min(1).max(128).optional(),
    })
    .optional(),
});

export const EvaluatorMetadataSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.enum(["deterministic", "rubric"]),
  ...RevisionFields,
});

export const CaseReferenceSchema = z.strictObject({
  id: IdentifierSchema,
  version: SemVerSchema,
  digest: Sha256DigestSchema,
});

export const ReproducibilityMetadataSchema = z.strictObject({
  case: CaseReferenceSchema,
  protocol: ProtocolVersionMetadataSchema,
  runner: RunnerMetadataSchema,
  model: ModelMetadataSchema,
  harness: ToolVersionMetadataSchema,
  authoringTool: ToolVersionMetadataSchema.optional(),
  tools: z.array(ToolVersionMetadataSchema),
  evaluators: z.array(EvaluatorMetadataSchema),
});

export type ProtocolVersionMetadata = z.infer<typeof ProtocolVersionMetadataSchema>;
export type ToolVersionMetadata = z.infer<typeof ToolVersionMetadataSchema>;
export type RunnerMetadata = z.infer<typeof RunnerMetadataSchema>;
export type ModelParameters = z.infer<typeof ModelParametersSchema>;
export type ModelMetadata = z.infer<typeof ModelMetadataSchema>;
export type EvaluatorMetadata = z.infer<typeof EvaluatorMetadataSchema>;
export type CaseReference = z.infer<typeof CaseReferenceSchema>;
export type ReproducibilityMetadata = z.infer<typeof ReproducibilityMetadataSchema>;
