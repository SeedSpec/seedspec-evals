import { z } from "zod";

import {
  IsoTimestampSchema,
  JsonObjectSchema,
  RunIdSchema,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { ModelMetadataSchema, RunnerMetadataSchema } from "./versions.js";

export const TraceIdSchema = z.string().regex(/^trace_[a-f0-9]{64}$/);

export const TraceCaptureSchema = z.strictObject({
  messages: z.enum(["full", "partial", "digests", "unavailable"]),
  toolCalls: z.enum(["full", "names-only", "unavailable"]),
  toolResults: z.enum(["full", "digests", "unavailable"]),
  timing: z.enum(["event", "run-only", "unavailable"]),
  usage: z.enum(["tokens", "provider-summary", "unavailable"]),
  artifacts: z.enum(["digests", "paths-and-digests", "unavailable"]),
  reasoning: z.literal("not-collected"),
});

export const TraceEventSchema = z.strictObject({
  sequence: z.number().int().nonnegative().max(1_000_000),
  timestamp: IsoTimestampSchema,
  kind: z.enum(["message", "tool-call", "tool-result", "status", "usage", "artifact", "error"]),
  actor: z.enum(["system", "user", "assistant", "tool", "runner"]),
  name: z.string().trim().min(1).max(256).optional(),
  data: JsonObjectSchema,
});

export const TraceBodySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    runId: RunIdSchema,
    sourceRunId: RunIdSchema.optional(),
    runner: RunnerMetadataSchema,
    model: ModelMetadataSchema,
    startedAt: IsoTimestampSchema,
    finishedAt: IsoTimestampSchema,
    status: z.enum(["succeeded", "failed", "cancelled", "timed_out", "rejected"]),
    capture: TraceCaptureSchema,
    events: z.array(TraceEventSchema).max(10_000),
    limitations: z.array(z.string().trim().min(1).max(1_000)).max(128),
    redactions: z.array(z.strictObject({
      category: z.string().trim().min(1).max(128),
      count: z.number().int().positive().max(1_000_000),
      reason: z.string().trim().min(1).max(500),
    })).max(128),
  })
  .superRefine((trace, context) => {
    if (Date.parse(trace.finishedAt) < Date.parse(trace.startedAt)) {
      context.addIssue({ code: "custom", message: "finishedAt cannot precede startedAt", path: ["finishedAt"] });
    }
    for (const [index, event] of trace.events.entries()) {
      if (event.sequence !== index) {
        context.addIssue({ code: "custom", message: "event sequence must be contiguous and zero-based", path: ["events", index, "sequence"] });
      }
      const timestamp = Date.parse(event.timestamp);
      if (timestamp < Date.parse(trace.startedAt) || timestamp > Date.parse(trace.finishedAt)) {
        context.addIssue({ code: "custom", message: "event timestamp must fall within the run", path: ["events", index, "timestamp"] });
      }
    }
  });

const TraceDataSchema = TraceBodySchema.safeExtend({ traceId: TraceIdSchema }).superRefine(
  (trace, context) => {
    const { traceId, ...body } = trace;
    const parsedBody = TraceBodySchema.safeParse(body);
    if (!parsedBody.success) return;
    const expected = contentId("trace", parsedBody.data as unknown as JsonValue);
    if (traceId !== expected) {
      context.addIssue({ code: "custom", message: `traceId does not match trace content; expected ${expected}`, path: ["traceId"] });
    }
  },
);

export const TraceSchema = TraceDataSchema.transform((value) => deepFreeze(value));

export type TraceBody = z.infer<typeof TraceBodySchema>;
export type Trace = DeepReadonly<z.infer<typeof TraceDataSchema>>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export function computeTraceId(input: TraceBody): `trace_${string}` {
  const body = TraceBodySchema.parse(input);
  return contentId("trace", body as unknown as JsonValue);
}

export function createTrace(input: TraceBody): Trace {
  const body = TraceBodySchema.parse(input);
  return TraceSchema.parse({ ...body, traceId: computeTraceId(body) });
}

export function parseTrace(input: unknown): Trace {
  return TraceSchema.parse(input);
}
