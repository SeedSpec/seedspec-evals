import { z } from "zod";

import {
  ArtifactIdSchema,
  IsoTimestampSchema,
  JsonObjectSchema,
  RunIdSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluationStageSchema, EvaluationVariantSchema, variantBelongsToStage } from "./cases.js";
import {
  CaseReferenceSchema,
  EvaluatorMetadataSchema,
  ModelMetadataSchema,
  ProtocolVersionMetadataSchema,
  RunnerMetadataSchema,
  ToolVersionMetadataSchema,
} from "./versions.js";

export const RunTargetSchema = z.discriminatedUnion("stage", [
  z.strictObject({ stage: z.literal("authorship") }),
  z.strictObject({
    stage: z.literal("implementation"),
    authoredPackageArtifactId: ArtifactIdSchema,
  }),
]);

export const RunLimitsSchema = z.strictObject({
  maxTurns: z.number().int().positive().max(10_000),
  maxDurationMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1_000),
  maxInputBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxOutputBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const RunManifestBodySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    case: CaseReferenceSchema,
    target: RunTargetSchema,
    variant: EvaluationVariantSchema,
    repetition: z.number().int().nonnegative().max(1_000_000),
    createdAt: IsoTimestampSchema,
    protocol: ProtocolVersionMetadataSchema,
    runner: RunnerMetadataSchema,
    model: ModelMetadataSchema,
    harness: ToolVersionMetadataSchema,
    authoringTool: ToolVersionMetadataSchema.optional(),
    tools: z.array(ToolVersionMetadataSchema).max(128),
    evaluators: z.array(EvaluatorMetadataSchema).max(128),
    limits: RunLimitsSchema,
    instructionsDigest: Sha256DigestSchema,
    configuration: JsonObjectSchema.optional(),
  })
  .superRefine((body, context) => {
    if (!variantBelongsToStage(body.variant, body.target.stage)) {
      context.addIssue({
        code: "custom",
        message: `variant ${body.variant} does not belong to ${body.target.stage}`,
        path: ["variant"],
      });
    }
    const toolKeys = body.tools.map((tool) => `${tool.name}@${tool.version}`);
    if (new Set(toolKeys).size !== toolKeys.length) {
      context.addIssue({ code: "custom", message: "tools must be unique by name and version", path: ["tools"] });
    }

    const evaluatorKeys = body.evaluators.map(
      (evaluator) => `${evaluator.kind}:${evaluator.id}@${evaluator.version}`,
    );
    if (new Set(evaluatorKeys).size !== evaluatorKeys.length) {
      context.addIssue({
        code: "custom",
        message: "evaluators must be unique by kind, id, and version",
        path: ["evaluators"],
      });
    }
  });

export type RunManifestBody = z.infer<typeof RunManifestBodySchema>;
export type RunManifestInput = z.input<typeof RunManifestBodySchema>;

const RunManifestDataSchema = RunManifestBodySchema.safeExtend({ runId: RunIdSchema }).superRefine(
  (manifest, context) => {
    const { runId, ...body } = manifest;
    const expected = computeRunId(body);
    if (runId !== expected) {
      context.addIssue({
        code: "custom",
        message: `runId does not match manifest content; expected ${expected}`,
        path: ["runId"],
      });
    }
  },
);

export const RunManifestSchema = RunManifestDataSchema.transform((value) => deepFreeze(value));

export type RunManifest = DeepReadonly<z.infer<typeof RunManifestDataSchema>>;

export function computeRunId(input: RunManifestInput): `run_${string}` {
  const body = RunManifestBodySchema.parse(input);
  return contentId("run", body as unknown as JsonValue);
}

export function createRunManifest(input: RunManifestInput): RunManifest {
  const body = RunManifestBodySchema.parse(input);
  return RunManifestSchema.parse({ ...body, runId: computeRunId(body) });
}

export function parseRunManifest(input: unknown): RunManifest {
  return RunManifestSchema.parse(input);
}

export function verifyRunManifestId(input: unknown): boolean {
  return RunManifestSchema.safeParse(input).success;
}

export const ActiveRunStatusSchema = z.enum(["queued", "running"]);
export const TerminalRunStatusSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "rejected",
]);
export const RunStatusSchema = z.union([ActiveRunStatusSchema, TerminalRunStatusSchema]);

const RunStateCommon = {
  runId: RunIdSchema,
  queuedAt: IsoTimestampSchema,
} as const;

const QueuedRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("queued"),
});

const RunningRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("running"),
  startedAt: IsoTimestampSchema,
  lastHeartbeatAt: IsoTimestampSchema.optional(),
});

const SucceededRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("succeeded"),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  artifactIds: z.array(ArtifactIdSchema),
});

const FailedRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("failed"),
  startedAt: IsoTimestampSchema.optional(),
  finishedAt: IsoTimestampSchema,
  artifactIds: z.array(ArtifactIdSchema),
  failure: z.strictObject({
    code: z.string().trim().min(1).max(128),
    message: z.string().trim().min(1).max(8_000),
    retryable: z.boolean(),
    details: JsonObjectSchema.optional(),
  }),
});

const CancelledRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("cancelled"),
  startedAt: IsoTimestampSchema.optional(),
  finishedAt: IsoTimestampSchema,
  reason: z.string().trim().min(1).max(4_000),
  cancelledBy: z.enum(["operator", "runner", "orchestrator"]),
});

const TimedOutRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("timed_out"),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  limit: z.enum(["duration", "turns", "input-bytes", "output-bytes"]),
});

const RejectedRunStateSchema = z.strictObject({
  ...RunStateCommon,
  status: z.literal("rejected"),
  finishedAt: IsoTimestampSchema,
  reason: z.string().trim().min(1).max(4_000),
  code: z.string().trim().min(1).max(128),
});

const TerminalRunStateDataSchema = z
  .discriminatedUnion("status", [
    SucceededRunStateSchema,
    FailedRunStateSchema,
    CancelledRunStateSchema,
    TimedOutRunStateSchema,
    RejectedRunStateSchema,
  ])
  .superRefine(addChronologyIssues);

const RunStateDataSchema = z
  .discriminatedUnion("status", [
    QueuedRunStateSchema,
    RunningRunStateSchema,
    SucceededRunStateSchema,
    FailedRunStateSchema,
    CancelledRunStateSchema,
    TimedOutRunStateSchema,
    RejectedRunStateSchema,
  ])
  .superRefine(addChronologyIssues);

export const TerminalRunStateSchema = TerminalRunStateDataSchema.transform((value) => deepFreeze(value));
export const RunStateSchema = RunStateDataSchema.transform((value) => deepFreeze(value));

export type ActiveRunStatus = z.infer<typeof ActiveRunStatusSchema>;
export type TerminalRunStatus = z.infer<typeof TerminalRunStatusSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type TerminalRunState = DeepReadonly<z.infer<typeof TerminalRunStateDataSchema>>;
export type RunState = DeepReadonly<z.infer<typeof RunStateDataSchema>>;

export function isTerminalRunState(state: RunState): state is TerminalRunState {
  return TerminalRunStatusSchema.safeParse(state.status).success;
}

export function canTransitionRunState(from: RunState, to: RunState): boolean {
  if (from.runId !== to.runId || isTerminalRunState(from)) return false;
  if (from.status === "queued") {
    return ["running", "failed", "cancelled", "rejected"].includes(to.status);
  }
  return ["running", "succeeded", "failed", "cancelled", "timed_out"].includes(to.status);
}

function addChronologyIssues(
  state: z.infer<typeof QueuedRunStateSchema> |
    z.infer<typeof RunningRunStateSchema> |
    z.infer<typeof TerminalRunStateDataSchema>,
  context: z.core.$RefinementCtx,
): void {
  const queued = Date.parse(state.queuedAt);
  if ("startedAt" in state && state.startedAt !== undefined && Date.parse(state.startedAt) < queued) {
    context.addIssue({ code: "custom", message: "startedAt cannot precede queuedAt", path: ["startedAt"] });
  }
  if ("lastHeartbeatAt" in state && state.lastHeartbeatAt !== undefined) {
    if (Date.parse(state.lastHeartbeatAt) < Date.parse(state.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "lastHeartbeatAt cannot precede startedAt",
        path: ["lastHeartbeatAt"],
      });
    }
  }
  if ("finishedAt" in state) {
    const earliest = "startedAt" in state && state.startedAt !== undefined ? state.startedAt : state.queuedAt;
    if (Date.parse(state.finishedAt) < Date.parse(earliest)) {
      context.addIssue({ code: "custom", message: "finishedAt is out of order", path: ["finishedAt"] });
    }
  }
}

// Prevent accidental stage strings from diverging between cases and manifests.
export const ManifestEvaluationStageSchema = EvaluationStageSchema;
