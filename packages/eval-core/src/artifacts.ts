import { z } from "zod";

import {
  ArtifactIdSchema,
  IsoTimestampSchema,
  JsonObjectSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluationStageSchema, EvaluationVariantSchema, variantBelongsToStage } from "./cases.js";
import { ReproducibilityMetadataSchema } from "./versions.js";

export const ArtifactKindSchema = z.enum([
  "source",
  "authored-instructions",
  "authored-package",
  "implementation",
  "transcript",
  "tool-trace",
  "log",
  "deterministic-scorecard",
  "rubric-scorecard",
  "comparison-report",
  "adversarial-report",
]);

export const ArtifactBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  stage: EvaluationStageSchema,
  variant: EvaluationVariantSchema,
  kind: ArtifactKindSchema,
  path: SafeRelativePathSchema,
  mediaType: z.string().trim().min(1).max(256),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  digest: Sha256DigestSchema,
  createdAt: IsoTimestampSchema,
  provenance: ReproducibilityMetadataSchema,
  metadata: JsonObjectSchema.optional(),
}).superRefine((artifact, context) => {
  if (!variantBelongsToStage(artifact.variant, artifact.stage)) {
    context.addIssue({ code: "custom", message: "variant does not belong to stage", path: ["variant"] });
  }
});

export type ArtifactBody = z.infer<typeof ArtifactBodySchema>;
export type ArtifactInput = z.input<typeof ArtifactBodySchema>;

const ArtifactDataSchema = ArtifactBodySchema.safeExtend({ artifactId: ArtifactIdSchema }).superRefine(
  (artifact, context) => {
    const { artifactId, ...body } = artifact;
    const expected = computeArtifactId(body);
    if (artifactId !== expected) {
      context.addIssue({
        code: "custom",
        message: `artifactId does not match descriptor content; expected ${expected}`,
        path: ["artifactId"],
      });
    }
  },
);

export const ArtifactSchema = ArtifactDataSchema.transform((value) => deepFreeze(value));
export const ArtifactDescriptorSchema = ArtifactSchema;

export type Artifact = DeepReadonly<z.infer<typeof ArtifactDataSchema>>;
export type ArtifactDescriptor = Artifact;

export const ArtifactEvidenceSchema = z.strictObject({
  artifactId: ArtifactIdSchema,
  path: SafeRelativePathSchema.optional(),
  jsonPointer: z.string().regex(/^(?:\/(?:[^~/]|~0|~1)*)*$/).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  note: z.string().trim().min(1).max(4_000).optional(),
}).superRefine((evidence, context) => {
  if (evidence.lineEnd !== undefined && evidence.lineStart === undefined) {
    context.addIssue({ code: "custom", message: "lineEnd requires lineStart", path: ["lineEnd"] });
  }
  if (
    evidence.lineStart !== undefined &&
    evidence.lineEnd !== undefined &&
    evidence.lineEnd < evidence.lineStart
  ) {
    context.addIssue({ code: "custom", message: "lineEnd cannot precede lineStart", path: ["lineEnd"] });
  }
});

const ArtifactManifestDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    artifacts: z.array(ArtifactSchema).max(10_000),
  })
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const [index, artifact] of manifest.artifacts.entries()) {
      if (artifact.runId !== manifest.runId) {
        context.addIssue({
          code: "custom",
          message: "artifact belongs to a different run",
          path: ["artifacts", index, "runId"],
        });
      }
      if (ids.has(artifact.artifactId)) {
        context.addIssue({ code: "custom", message: "duplicate artifactId", path: ["artifacts", index] });
      }
      if (paths.has(artifact.path)) {
        context.addIssue({ code: "custom", message: "duplicate artifact path", path: ["artifacts", index, "path"] });
      }
      ids.add(artifact.artifactId);
      paths.add(artifact.path);
    }
  });

export const ArtifactManifestSchema = ArtifactManifestDataSchema.transform((value) => deepFreeze(value));

export type ArtifactEvidence = z.infer<typeof ArtifactEvidenceSchema>;
export type ArtifactManifest = DeepReadonly<z.infer<typeof ArtifactManifestDataSchema>>;

export function computeArtifactId(input: ArtifactInput): `artifact_${string}` {
  const body = ArtifactBodySchema.parse(input);
  return contentId("artifact", body as unknown as JsonValue);
}

export function createArtifact(input: ArtifactInput): Artifact {
  const body = ArtifactBodySchema.parse(input);
  return ArtifactSchema.parse({ ...body, artifactId: computeArtifactId(body) });
}

export function parseArtifact(input: unknown): Artifact {
  return ArtifactSchema.parse(input);
}
