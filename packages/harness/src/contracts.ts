import {
  EvaluationStageSchema,
  EvaluationVariantSchema,
  DeliverableSchema,
  AuthoredInputBundleSchema,
  IdentifierSchema,
  JsonObjectSchema,
  RunManifestSchema,
  RunIdSchema,
  contentId,
  sha256Hex,
  stableJson,
  type JsonValue,
} from "@seedspec/eval-core";
import { z } from "zod";

export { JsonObjectSchema, RunIdSchema } from "@seedspec/eval-core";
export type { JsonObject, JsonPrimitive, JsonValue } from "@seedspec/eval-core";

export const HARNESS_NAME = "seedspec-eval-harness";
export const HARNESS_VERSION = "0.1.0-alpha.2";
export const RUNNER_ID = "cloudflare-think";
export const DEFAULT_MAX_STEPS = 6;
export const MAX_MAX_STEPS = 12;

const MAX_TRUSTED_INSTRUCTION_BYTES = 32 * 1024;
const MAX_UNTRUSTED_MATERIAL_BYTES = 256 * 1024;
const MAX_SIMULATED_AUTHOR_RESPONSE_BYTES = 128 * 1024;
const MAX_GUIDANCE_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
export const MAX_MATRIX_PLAN_BYTES = 900 * 1024;

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;

export const CaseIdSchema = IdentifierSchema;

export const RunStageSchema = EvaluationStageSchema;

export const ModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(256)
  .regex(/^(?:@cf|[a-z0-9][a-z0-9.-]{0,62})\/[A-Za-z0-9][A-Za-z0-9._:/-]*$/, {
    message: "must be a Workers AI model ID or AI Gateway provider/model slug",
  });

export const GatewayIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, {
    message: "must be a lowercase AI Gateway ID",
  });

export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
    message: "must contain only stable identifier characters",
  });

export const SubmissionIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
    message: "must contain only stable identifier characters",
  });

export const RunAgentConfigSchema = z
  .strictObject({
    runId: RunIdSchema,
    caseId: CaseIdSchema,
    stage: RunStageSchema,
    variant: EvaluationVariantSchema,
    model: ModelIdSchema,
    gatewayId: GatewayIdSchema,
    maxSteps: z.number().int().min(1).max(MAX_MAX_STEPS).default(DEFAULT_MAX_STEPS),
    trustedInstructions: z.array(z.string().trim().min(1).max(8_000)).min(1).max(32),
    untrustedMaterial: z.string().min(1),
    deliverables: z.array(DeliverableSchema).min(1).max(128),
    authoredInput: AuthoredInputBundleSchema.optional(),
    guidanceInput: AuthoredInputBundleSchema.optional(),
    simulatedAuthorResponses: z
      .record(IdentifierSchema, z.string().min(1).max(8_000))
      .refine((responses) => Object.keys(responses).length <= 128, {
        message: "too many simulated author responses",
      })
      .default({}),
  })
  .superRefine((config, context) => {
    const trustedBytes = config.trustedInstructions.reduce(
      (total, instruction) => total + utf8Length(instruction),
      0,
    );
    if (trustedBytes > MAX_TRUSTED_INSTRUCTION_BYTES) {
      context.addIssue({
        code: "custom",
        message: "trusted instructions exceed the size limit",
        path: ["trustedInstructions"],
      });
    }
    if (utf8Length(config.untrustedMaterial) > MAX_UNTRUSTED_MATERIAL_BYTES) {
      context.addIssue({
        code: "custom",
        message: "untrusted material exceeds the size limit",
        path: ["untrustedMaterial"],
      });
    }
    if (config.stage === "implementation" && config.authoredInput === undefined) {
      context.addIssue({ code: "custom", message: "implementation runs require an authored input bundle", path: ["authoredInput"] });
    }
    if (config.stage === "authorship" && config.authoredInput !== undefined) {
      context.addIssue({ code: "custom", message: "authorship runs cannot include an authored input bundle", path: ["authoredInput"] });
    }
    const guidanceBytes = config.guidanceInput?.files.reduce(
      (total, file) => total + file.byteLength,
      0,
    ) ?? 0;
    if (guidanceBytes > MAX_GUIDANCE_INPUT_BYTES) {
      context.addIssue({
        code: "custom",
        message: "guidance input exceeds the evaluation limit",
        path: ["guidanceInput"],
      });
    }
    const simulatedResponseBytes = Object.values(config.simulatedAuthorResponses).reduce(
      (total, response) => total + utf8Length(response),
      0,
    );
    if (simulatedResponseBytes > MAX_SIMULATED_AUTHOR_RESPONSE_BYTES) {
      context.addIssue({
        code: "custom",
        message: "simulated author responses exceed the size limit",
        path: ["simulatedAuthorResponses"],
      });
    }
  });

export const ConfigureRunRequestSchema = z
  .strictObject({
    manifest: RunManifestSchema,
    config: RunAgentConfigSchema,
  })
  .superRefine(addManifestBindingIssues);

export const SubmitRunRequestSchema = z
  .strictObject({
    manifest: RunManifestSchema,
    config: RunAgentConfigSchema,
    idempotencyKey: IdempotencyKeySchema,
    metadata: JsonObjectSchema.optional(),
  })
  .superRefine((request, context) => {
    addManifestBindingIssues(request, context);
    if (
      request.metadata !== undefined &&
      utf8Length(JSON.stringify(request.metadata)) > MAX_METADATA_BYTES
    ) {
      context.addIssue({
        code: "custom",
        message: "metadata exceeds the size limit",
        path: ["metadata"],
      });
    }
  });

export const ExecutionEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    manifest: RunManifestSchema,
    submission: z.strictObject({
      config: RunAgentConfigSchema,
      idempotencyKey: IdempotencyKeySchema,
      metadata: JsonObjectSchema.optional(),
    }),
  })
  .superRefine((envelope, context) => {
    const bound = SubmitRunRequestSchema.safeParse({
      manifest: envelope.manifest,
      ...envelope.submission,
    });
    if (!bound.success) {
      context.addIssue({
        code: "custom",
        message: "submission inputs must be bound to the immutable run manifest",
        path: ["submission"],
      });
    }
  });

export const ExperimentPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    planId: z.string().regex(/^plan_[a-f0-9]{64}$/),
    createdAt: z.iso.datetime({ offset: true }),
    envelopes: z.array(ExecutionEnvelopeSchema).min(1).max(10_000),
  })
  .superRefine((plan, context) => {
    const body = { createdAt: plan.createdAt, envelopes: plan.envelopes };
    const expected = contentId("plan", body as unknown as JsonValue);
    if (plan.planId !== expected) {
      context.addIssue({
        code: "custom",
        message: "planId does not match the experiment plan content",
        path: ["planId"],
      });
    }
  });

export const MatrixStartRequestSchema = z
  .strictObject({
    plan: ExperimentPlanSchema,
    confirmModelExecution: z.literal(true),
  })
  .superRefine((request, context) => {
    if (request.plan.envelopes.length > 100) {
      context.addIssue({
        code: "custom",
        message: "a matrix execution may contain at most 100 runs",
        path: ["plan", "envelopes"],
      });
    }
    if (utf8Length(JSON.stringify(request.plan)) > MAX_MATRIX_PLAN_BYTES) {
      context.addIssue({
        code: "custom",
        message: "the matrix plan exceeds the Workflow payload safety limit",
        path: ["plan"],
      });
    }
  });

export const MatrixPlanRequestSchema = z
  .strictObject({ plan: ExperimentPlanSchema })
  .refine((request) => utf8Length(JSON.stringify(request.plan)) <= MAX_MATRIX_PLAN_BYTES, {
    message: "the matrix plan exceeds the Workflow payload safety limit",
    path: ["plan"],
  });

function addManifestBindingIssues(
  request: {
    manifest: z.infer<typeof RunManifestSchema>;
    config: z.infer<typeof RunAgentConfigSchema>;
  },
  context: z.core.$RefinementCtx,
): void {
  const { manifest, config } = request;
  const assertions: Array<{ matches: boolean; message: string; path: PropertyKey[] }> = [
    {
      matches: manifest.runId === config.runId,
      message: "manifest run ID does not match the execution configuration",
      path: ["config", "runId"],
    },
    {
      matches: manifest.case.id === config.caseId,
      message: "manifest case ID does not match the execution configuration",
      path: ["config", "caseId"],
    },
    {
      matches: manifest.target.stage === config.stage,
      message: "manifest stage does not match the execution configuration",
      path: ["config", "stage"],
    },
    {
      matches: manifest.variant === config.variant,
      message: "manifest variant does not match the execution configuration",
      path: ["config", "variant"],
    },
    {
      matches: manifest.model.modelId === config.model,
      message: "manifest model does not match the execution configuration",
      path: ["config", "model"],
    },
    {
      matches: manifest.model.routing?.gateway === config.gatewayId,
      message: "manifest gateway does not match the execution configuration",
      path: ["config", "gatewayId"],
    },
    {
      matches: manifest.harness.name === HARNESS_NAME && manifest.harness.version === HARNESS_VERSION,
      message: "manifest harness identity does not match this execution boundary",
      path: ["manifest", "harness"],
    },
    {
      matches:
        manifest.runner.id === RUNNER_ID &&
        manifest.runner.kind === "agent" &&
        manifest.runner.version === HARNESS_VERSION,
      message: "manifest runner identity does not match this execution boundary",
      path: ["manifest", "runner"],
    },
    {
      matches: manifest.instructionsDigest === digestJson(config.trustedInstructions),
      message: "trusted instructions do not match the manifest digest",
      path: ["config", "trustedInstructions"],
    },
    {
      matches:
        manifest.configuration?.["untrustedMaterialDigest"] ===
        `sha256:${sha256Hex(config.untrustedMaterial)}`,
      message: "untrusted material does not match the manifest digest",
      path: ["config", "untrustedMaterial"],
    },
    {
      matches: manifest.configuration?.["deliverablesDigest"] === digestJson(
        JSON.parse(JSON.stringify(config.deliverables)) as JsonValue,
      ),
      message: "declared deliverables do not match the manifest digest",
      path: ["config", "deliverables"],
    },
    {
      matches: manifest.target.stage === "authorship"
        ? config.authoredInput === undefined
        : config.authoredInput !== undefined
          && manifest.target.authoredInputArtifactId === config.authoredInput.artifactId
          && manifest.configuration?.["authoredInputArtifactId"] === config.authoredInput.artifactId
          && manifest.configuration?.["authoredInputDigest"] === config.authoredInput.digest,
      message: "authored input does not match the implementation target and manifest binding",
      path: ["config", "authoredInput"],
    },
    {
      matches: config.guidanceInput === undefined
        ? manifest.configuration?.["guidanceInputArtifactId"] === undefined
          && manifest.configuration?.["guidanceInputDigest"] === undefined
        : manifest.configuration?.["guidanceInputArtifactId"] === config.guidanceInput.artifactId
          && manifest.configuration?.["guidanceInputDigest"] === config.guidanceInput.digest,
      message: "guidance input does not match the manifest binding",
      path: ["config", "guidanceInput"],
    },
    {
      matches:
        manifest.configuration?.["simulatedAuthorResponsesDigest"] ===
        digestJson(config.simulatedAuthorResponses),
      message: "simulated author responses do not match the manifest digest",
      path: ["config", "simulatedAuthorResponses"],
    },
    {
      matches: manifest.configuration?.["maxSteps"] === config.maxSteps,
      message: "step limit does not match the manifest configuration",
      path: ["config", "maxSteps"],
    },
    {
      matches: manifest.configuration?.["gatewayId"] === config.gatewayId,
      message: "gateway does not match the manifest configuration",
      path: ["config", "gatewayId"],
    },
  ];

  for (const assertion of assertions) {
    if (!assertion.matches) {
      context.addIssue({ code: "custom", message: assertion.message, path: assertion.path });
    }
  }
}

function digestJson(value: JsonValue): `sha256:${string}` {
  return `sha256:${sha256Hex(stableJson(value))}`;
}

export const SubmissionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "aborted",
  "skipped",
  "error",
]);

export const ListSubmissionsQuerySchema = z.strictObject({
  status: SubmissionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RunAgentConfig = z.infer<typeof RunAgentConfigSchema>;
export type ConfigureRunRequest = z.infer<typeof ConfigureRunRequestSchema>;
export type SubmitRunRequest = z.infer<typeof SubmitRunRequestSchema>;
export type ExecutionEnvelope = z.infer<typeof ExecutionEnvelopeSchema>;
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;
export type MatrixStartRequest = z.infer<typeof MatrixStartRequestSchema>;
export type MatrixPlanRequest = z.infer<typeof MatrixPlanRequestSchema>;
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;
export type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuerySchema>;

export type PublicError = {
  code: string;
  message: string;
};

// A non-union envelope survives Cloudflare's recursive Durable Object RPC type
// transformation without losing the success branch at call sites.
export type RpcResult<T> = {
  ok: boolean;
  value: T | null;
  error: PublicError | null;
};

export type ConfigureRunResult = {
  disposition: "configured" | "unchanged";
  config: RunAgentConfig;
};

export type SubmissionInspection = {
  submissionId: string;
  idempotencyKey?: string;
  requestId?: string;
  status: SubmissionStatus;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
};

export type SubmitRunResult = SubmissionInspection & {
  accepted: boolean;
};

export type RunHealth = {
  runId: string;
  configured: boolean;
  degraded: boolean;
  degradations: Array<{ step: string; error: string }>;
  activeSubmissions: number;
};
