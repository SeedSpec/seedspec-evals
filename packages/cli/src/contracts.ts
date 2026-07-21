import {
  JsonObjectSchema,
  RunManifestSchema,
  contentId,
  type JsonValue,
} from "@seedspec/eval-core";
import { RunAgentConfigSchema, SubmitRunRequestSchema } from "@seedspec/eval-harness";
import { z } from "zod";

export const ExecutionEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  manifest: RunManifestSchema,
  submission: z.strictObject({
    config: RunAgentConfigSchema,
    idempotencyKey: z.string().min(1).max(200),
    metadata: JsonObjectSchema.optional(),
  }),
}).superRefine((envelope, context) => {
  const boundRequest = SubmitRunRequestSchema.safeParse({
    manifest: envelope.manifest,
    ...envelope.submission,
  });
  if (!boundRequest.success) {
    context.addIssue({
      code: "custom",
      message: "submission inputs must be bound to the immutable run manifest",
      path: ["submission"],
    });
  }
  if (envelope.manifest.runId !== envelope.submission.config.runId) {
    context.addIssue({
      code: "custom",
      message: "manifest and submission run IDs must match",
      path: ["submission", "config", "runId"],
    });
  }
  if (envelope.manifest.case.id !== envelope.submission.config.caseId) {
    context.addIssue({
      code: "custom",
      message: "manifest and submission case IDs must match",
      path: ["submission", "config", "caseId"],
    });
  }
  if (envelope.manifest.target.stage !== envelope.submission.config.stage) {
    context.addIssue({
      code: "custom",
      message: "manifest and submission stages must match",
      path: ["submission", "config", "stage"],
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

export type ExecutionEnvelope = z.infer<typeof ExecutionEnvelopeSchema>;

export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;
