import {
  DecisionActorSchema,
  createTrace,
  type JsonObject,
  type TraceEvent,
} from "@seedspec/eval-core";
import {
  Think,
  type ChatErrorContext,
  type ChatResponseResult,
  type StepContext,
  type ThinkSubmissionInspection,
  type TurnConfig,
} from "@cloudflare/think";
import {
  DEFAULT_MAX_STEPS,
  HARNESS_VERSION,
  buildTrustedSystemPrompt,
  buildUntrustedUserMessage,
  conflictingRunConfigFields,
  equalRunAgentConfigs,
  parseConfigureRunRequest,
  parseSubmitRunRequest,
  type ConfigureRunResult,
  type RpcResult,
  type RunAgentConfig,
  type RunHealth,
  type SubmissionInspection,
  type SubmissionStatus,
  type SubmitRunResult,
} from "@seedspec/eval-harness";
import { tool, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

import { errorClass, structuredLog } from "./logging.js";
import { createSeedSpecTools, digestPackage, seedSpecToolNamesForVariant } from "./seedspec-tools.js";

const WORKSPACE_TOOLS = ["read", "write", "edit", "list", "find", "grep"];

type TraceRow = {
  event_at: string;
  kind: TraceEvent["kind"];
  actor: TraceEvent["actor"];
  name: string | null;
  data_json: string;
};

function toSubmissionInspection(submission: ThinkSubmissionInspection): SubmissionInspection {
  const inspection: SubmissionInspection = {
    submissionId: submission.submissionId,
    status: submission.status,
    createdAt: submission.createdAt,
  };
  if (submission.idempotencyKey !== undefined) {
    inspection.idempotencyKey = submission.idempotencyKey;
  }
  if (submission.requestId !== undefined) inspection.requestId = submission.requestId;
  if (submission.error !== undefined) inspection.error = "submission_failed";
  if (submission.startedAt !== undefined) inspection.startedAt = submission.startedAt;
  if (submission.completedAt !== undefined) inspection.completedAt = submission.completedAt;
  return inspection;
}

export class SeedSpecEvalAgent extends Think<Env> {
  override workspaceBash = false;
  override fetchTools = false as const;
  override maxSteps = DEFAULT_MAX_STEPS;
  override sendReasoning = false;
  override chatStreamStallTimeoutMs = 120_000;
  override chatRecovery = {
    maxAttempts: 3,
    noProgressTimeoutMs: 120_000,
    maxRecoveryWork: 64,
    terminalMessage: "The evaluation turn could not be recovered safely.",
  };

  override getModel(): LanguageModel {
    const config = this.requireRunConfig();
    return createWorkersAI({
      binding: this.env.AI,
      gateway: { id: config.gatewayId },
    })(config.model);
  }

  override getSystemPrompt(): string {
    return buildTrustedSystemPrompt(this.requireRunConfig());
  }

  override getTools(): ToolSet {
    const config = this.requireRunConfig();
    return {
      ...createSeedSpecTools(this.workspace, config.stage, config.variant),
      ...(config.stage === "implementation" ? {
        record_decision: tool({
          description: "Record one consequential implementation decision as observable evidence. Do not record hidden reasoning or trivial local coding choices.",
          inputSchema: z.strictObject({
            id: z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
            domain: z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
            title: z.string().min(1).max(512),
            choice: z.string().min(1).max(4_000),
            materiality: z.enum(["critical", "material", "minor"]),
            expectedLatitude: z.enum(["fixed", "preferred", "delegated", "open", "unresolved", "unknown"]),
            sources: z.array(z.strictObject({
              actor: DecisionActorSchema.exclude(["evaluation-case", "evaluator"]),
              basis: z.string().min(1).max(4_000),
              path: z.string().min(1).max(1_024).optional(),
            })).max(32),
            alternativesConsidered: z.array(z.string().min(1).max(2_000)).max(32),
            disclosure: z.enum(["explicit", "implicit", "unknown"]),
            rationale: z.string().min(1).max(8_000),
          }),
          execute: ({ id }) => ({ recorded: true as const, id }),
        }),
      } : {}),
      ask_author: tool({
        description:
          "Ask one pre-declared clarification question. Use the exact questionId; unavailable questions return no answer.",
        inputSchema: z.strictObject({
          questionId: z.string().min(1).max(128),
          question: z.string().min(1).max(2_000),
        }),
        execute: ({ questionId }) => {
          const responses = this.requireRunConfig().simulatedAuthorResponses;
          if (!Object.prototype.hasOwnProperty.call(responses, questionId)) {
            return { answered: false as const, answer: null };
          }
          return { answered: true as const, answer: responses[questionId] ?? null };
        },
      }),
    };
  }

  override beforeTurn(): TurnConfig {
    const config = this.requireRunConfig();
    this.appendTraceEvent("status", "runner", "turn-started", {
      stage: config.stage,
      variant: config.variant,
      model: config.model,
      maxSteps: config.maxSteps,
    });
    structuredLog("info", "eval.turn.started", {
      runId: config.runId,
      caseId: config.caseId,
      stage: config.stage,
      variant: config.variant,
      model: config.model,
      gatewayId: config.gatewayId,
      maxSteps: config.maxSteps,
    });
    return {
      activeTools: [
        ...WORKSPACE_TOOLS,
        ...(config.variant === "raw-source" ? [] : ["ask_author"]),
        ...(config.stage === "implementation" ? ["record_decision"] : []),
        ...seedSpecToolNamesForVariant(config.stage, config.variant),
      ],
      maxSteps: config.maxSteps,
      sendReasoning: false,
    };
  }

  override onStepFinish(context: StepContext): void {
    const config = this.getConfig<RunAgentConfig>();
    structuredLog("info", "eval.turn.step.finished", {
      runId: config?.runId ?? this.name,
      stepNumber: context.stepNumber,
      finishReason: context.finishReason,
      inputTokens: context.usage.inputTokens ?? null,
      outputTokens: context.usage.outputTokens ?? null,
      totalTokens: context.usage.totalTokens ?? null,
      toolCallCount: context.toolCalls.length,
    });
    if (context.text.length > 0) {
      this.appendTraceEvent("message", "assistant", "step-text", { stepNumber: context.stepNumber, text: context.text });
    }
    for (const call of context.toolCalls) {
      this.appendTraceEvent("tool-call", "assistant", call.toolName, {
        stepNumber: context.stepNumber,
        input: toJsonValue(call.input),
      });
    }
    for (const result of context.toolResults) {
      this.appendTraceEvent("tool-result", "tool", result.toolName, {
        stepNumber: context.stepNumber,
        output: toJsonValue("output" in result ? result.output : null),
      });
    }
    this.appendTraceEvent("usage", "runner", "step-usage", {
      stepNumber: context.stepNumber,
      finishReason: context.finishReason,
      inputTokens: context.usage.inputTokens ?? null,
      outputTokens: context.usage.outputTokens ?? null,
      totalTokens: context.usage.totalTokens ?? null,
      cachedInputTokens: context.usage.cachedInputTokens ?? null,
      reasoningTokens: context.usage.reasoningTokens ?? null,
    });
  }

  override onChatResponse(result: ChatResponseResult): void {
    const config = this.getConfig<RunAgentConfig>();
    structuredLog("info", "eval.turn.finished", {
      runId: config?.runId ?? this.name,
      requestId: result.requestId,
      status: result.status,
      continuation: result.continuation,
      partCount: result.message.parts.length,
    });
    this.appendTraceEvent(
      result.status === "error" ? "error" : "status",
      "runner",
      `turn-${result.status}`,
      { requestId: result.requestId, continuation: result.continuation, partCount: result.message.parts.length },
    );
  }

  override onChatError(error: unknown, context?: ChatErrorContext): unknown {
    const config = this.getConfig<RunAgentConfig>();
    structuredLog("error", "eval.turn.failed", {
      runId: config?.runId ?? this.name,
      requestId: context?.requestId,
      stage: context?.stage,
      messagesPersisted: context?.messagesPersisted,
      classification: context?.classification,
      errorClass: errorClass(error),
    });
    this.appendTraceEvent("error", "runner", "turn-error", {
      requestId: context?.requestId ?? null,
      stage: context?.stage ?? null,
      classification: context?.classification ?? null,
      errorClass: errorClass(error),
    });
    return error;
  }

  protected override onSubmissionStatus(submission: ThinkSubmissionInspection): void {
    const config = this.getConfig<RunAgentConfig>();
    structuredLog("info", "eval.submission.status", {
      runId: config?.runId ?? this.name,
      submissionId: submission.submissionId,
      requestId: submission.requestId,
      status: submission.status,
      createdAt: submission.createdAt,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
    });
    this.appendTraceEvent("status", "runner", "submission-status", {
      submissionId: submission.submissionId,
      status: submission.status,
      requestId: submission.requestId ?? null,
    });
  }

  configureRun(input: unknown): RpcResult<ConfigureRunResult> {
    const parsed = parseConfigureRunRequest(input);
    if (!parsed.success) {
      return {
        ok: false,
        value: null,
        error: { code: "invalid_request", message: "The run configuration is invalid." },
      };
    }
    return this.initializeConfig(parsed.data.config);
  }

  getRunConfig(): RunAgentConfig | null {
    return this.getConfig<RunAgentConfig>();
  }

  async getRunHealth(): Promise<RunHealth> {
    const config = this.getConfig<RunAgentConfig>();
    const active = await this.listSubmissions({
      status: ["pending", "running"],
      limit: 100,
    });
    const degradations = this.getOnStartDegradations().map((degradation) => ({
      step: degradation.step,
      error: errorClass(degradation.error),
    }));
    return {
      runId: config?.runId ?? this.name,
      configured: config !== null,
      degraded: degradations.length > 0,
      degradations,
      activeSubmissions: active.length,
    };
  }

  async submitRun(input: unknown): Promise<RpcResult<SubmitRunResult>> {
    const parsed = parseSubmitRunRequest(input);
    if (!parsed.success) {
      return {
        ok: false,
        value: null,
        error: { code: "invalid_request", message: "The submission request is invalid." },
      };
    }

    const initialized = this.initializeConfig(parsed.data.config);
    if (!initialized.ok) return { ok: false, value: null, error: initialized.error };

    try {
      await this.ensureAuthoredInputMounted(parsed.data.config);
      await this.ensureGuidanceInputMounted(parsed.data.config);
    } catch (error) {
      structuredLog("error", "eval.input.mount_failed", {
        runId: parsed.data.config.runId,
        errorClass: errorClass(error),
      });
      return { ok: false, value: null, error: { code: "run_input_invalid", message: "A content-addressed run input could not be verified and mounted." } };
    }

    const message: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: buildUntrustedUserMessage(parsed.data.config) }],
    };
    const submission = await this.submitMessages([message], {
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: {
        ...(parsed.data.metadata ?? {}),
        runId: parsed.data.config.runId,
        caseId: parsed.data.config.caseId,
        stage: parsed.data.config.stage,
      },
    });
    return {
      ok: true,
      error: null,
      value: {
        ...toSubmissionInspection(submission),
        accepted: submission.accepted,
      },
    };
  }

  async inspectRunSubmission(submissionId: string): Promise<SubmissionInspection | null> {
    const submission = await this.inspectSubmission(submissionId);
    return submission === null ? null : toSubmissionInspection(submission);
  }

  async listRunSubmissions(options: {
    status?: SubmissionStatus | SubmissionStatus[];
    limit: number;
  }): Promise<SubmissionInspection[]> {
    const submissions = await this.listSubmissions(options);
    return submissions.map(toSubmissionInspection);
  }

  async cancelRunSubmission(submissionId: string): Promise<SubmissionInspection | null> {
    const existing = await this.inspectSubmission(submissionId);
    if (existing === null) return null;
    if (existing.status === "pending" || existing.status === "running") {
      await this.cancelSubmission(submissionId, "Cancelled by operator through the run API.");
    }
    const current = await this.inspectSubmission(submissionId);
    return current === null ? null : toSubmissionInspection(current);
  }

  async exportRunTrace(): Promise<{ ok: boolean; traceJson: string | null; error: { code: string; message: string } | null }> {
    const config = this.getConfig<RunAgentConfig>();
    if (config === null) return { ok: false, traceJson: null, error: { code: "run_not_configured", message: "The run is not configured." } };
    const submissions = await this.listSubmissions({ limit: 100 });
    const latest = submissions.toSorted((left, right) => right.createdAt - left.createdAt)[0];
    if (latest === undefined || latest.status === "pending" || latest.status === "running") {
      return { ok: false, traceJson: null, error: { code: "trace_not_final", message: "A final trace is available after the run reaches a terminal state." } };
    }
    const rows = this.readTraceRows();
    const startedAt = new Date(latest.startedAt ?? latest.createdAt).toISOString();
    const finishedAt = new Date(latest.completedAt ?? Date.now()).toISOString();
    const lowerBound = Date.parse(startedAt);
    const upperBound = Date.parse(finishedAt);
    const events: TraceEvent[] = rows.map((row, sequence) => ({
      sequence,
      timestamp: new Date(Math.min(upperBound, Math.max(lowerBound, Date.parse(row.event_at)))).toISOString(),
      kind: row.kind,
      actor: row.actor,
      ...(row.name === null ? {} : { name: row.name }),
      data: parseTraceData(row.data_json),
    }));
    const artifactSummary = summarizeArtifactDigest(await digestPackage(this.workspace, "."));
    events.push({
      sequence: events.length,
      timestamp: finishedAt,
      kind: "artifact",
      actor: "runner",
      name: "workspace-digest",
      data: artifactSummary,
    });
    const status = latest.status === "completed"
      ? "succeeded"
      : latest.status === "aborted"
        ? "cancelled"
        : latest.status === "skipped"
          ? "rejected"
          : "failed";
    return {
      ok: true,
      error: null,
      traceJson: JSON.stringify(createTrace({
        schemaVersion: 1,
        runId: config.runId,
        variant: config.variant,
        runner: { id: "cloudflare-think", kind: "agent", version: HARNESS_VERSION, environment: { runtime: "cloudflare-workers", runtimeVersion: "2026-07-21" } },
        model: { provider: providerForModel(config.model), modelId: config.model, parameters: {}, routing: { gateway: config.gatewayId } },
        startedAt,
        finishedAt,
        status,
        capture: { messages: "partial", toolCalls: "full", toolResults: "full", timing: "event", usage: "tokens", artifacts: "digests", reasoning: "not-collected" },
        events,
        limitations: ["The user input is represented by the immutable run envelope rather than duplicated in the trace.", "Artifact contents remain in the durable workspace; the trace records observable tool events and final export metadata."],
        redactions: [],
      })),
    };
  }

  private initializeConfig(config: RunAgentConfig): RpcResult<ConfigureRunResult> {
    if (config.runId !== this.name) {
      return {
        ok: false,
        value: null,
        error: {
          code: "run_id_mismatch",
          message: "The configured run ID does not match the addressed run instance.",
        },
      };
    }

    const existing = this.getConfig<RunAgentConfig>();
    if (existing === null) {
      this.configure<RunAgentConfig>(config);
      structuredLog("info", "eval.run.configured", {
        runId: config.runId,
        caseId: config.caseId,
        stage: config.stage,
        variant: config.variant,
        model: config.model,
        gatewayId: config.gatewayId,
        maxSteps: config.maxSteps,
      });
      return { ok: true, value: { disposition: "configured", config }, error: null };
    }

    if (equalRunAgentConfigs(existing, config)) {
      return { ok: true, value: { disposition: "unchanged", config: existing }, error: null };
    }

    return {
      ok: false,
      value: null,
      error: {
        code: "config_conflict",
        message: `The run is already configured with different values for: ${conflictingRunConfigFields(existing, config).join(", ")}.`,
      },
    };
  }

  private requireRunConfig(): RunAgentConfig {
    const config = this.getConfig<RunAgentConfig>();
    if (config === null) throw new Error("Run configuration has not been initialized.");
    return config;
  }

  private async ensureAuthoredInputMounted(config: RunAgentConfig): Promise<void> {
    if (config.authoredInput === undefined) return;
    for (const file of config.authoredInput.files) {
      const bytes = decodeBase64(file.contentBase64);
      if (bytes.byteLength !== file.byteLength || `sha256:${await sha256Bytes(bytes)}` !== file.digest) {
        throw new Error(`Authored input failed digest verification: ${file.path}`);
      }
      const path = `input/authored/${file.path}`;
      const existing = await this.workspace.readFileBytes(path);
      if (existing !== null) {
        if (`sha256:${await sha256Bytes(existing)}` !== file.digest) throw new Error(`Mounted authored input changed: ${file.path}`);
        continue;
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      await this.workspace.writeFile(path, content);
    }
    this.appendTraceEvent("artifact", "runner", "authored-input-mounted", {
      artifactId: config.authoredInput.artifactId,
      digest: config.authoredInput.digest,
      fileCount: config.authoredInput.files.length,
      path: "input/authored",
    });
  }

  private async ensureGuidanceInputMounted(config: RunAgentConfig): Promise<void> {
    if (config.guidanceInput === undefined) return;
    for (const file of config.guidanceInput.files) {
      const bytes = decodeBase64(file.contentBase64);
      if (bytes.byteLength !== file.byteLength || `sha256:${await sha256Bytes(bytes)}` !== file.digest) {
        throw new Error(`Guidance input failed digest verification: ${file.path}`);
      }
      const path = `guidance/${file.path}`;
      const existing = await this.workspace.readFileBytes(path);
      if (existing !== null) {
        if (`sha256:${await sha256Bytes(existing)}` !== file.digest) throw new Error(`Mounted guidance input changed: ${file.path}`);
        continue;
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      await this.workspace.writeFile(path, content);
    }
    this.appendTraceEvent("artifact", "runner", "guidance-input-mounted", {
      artifactId: config.guidanceInput.artifactId,
      digest: config.guidanceInput.digest,
      fileCount: config.guidanceInput.files.length,
      path: "guidance",
    });
  }

  private appendTraceEvent(kind: TraceEvent["kind"], actor: TraceEvent["actor"], name: string, data: JsonObject): void {
    this.ensureTraceTable();
    void this.sql`INSERT INTO seedspec_eval_trace_events (event_at, kind, actor, name, data_json)
      VALUES (${new Date().toISOString()}, ${kind}, ${actor}, ${name}, ${JSON.stringify(data)})`;
  }

  private readTraceRows(): TraceRow[] {
    this.ensureTraceTable();
    return this.sql<TraceRow>`SELECT event_at, kind, actor, name, data_json FROM seedspec_eval_trace_events ORDER BY sequence ASC`;
  }

  private ensureTraceTable(): void {
    void this.sql`CREATE TABLE IF NOT EXISTS seedspec_eval_trace_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT NOT NULL,
      name TEXT,
      data_json TEXT NOT NULL
    )`;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function providerForModel(model: string): string {
  if (model.startsWith("@cf/")) return "cloudflare";
  return (model.split("/", 1)[0] ?? "unknown").replaceAll(".", "-");
}

function toJsonValue(value: unknown): JsonObject[string] {
  try { return JSON.parse(JSON.stringify(value)) as JsonObject[string]; }
  catch { return "[unserializable]"; }
}

function parseTraceData(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as JsonObject : {};
  } catch { return {}; }
}

function summarizeArtifactDigest(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { available: false };
  const record = value as Record<string, unknown>;
  return {
    available: record["ok"] === true,
    digest: typeof record["digest"] === "string" ? record["digest"] : null,
    fileCount: typeof record["fileCount"] === "number" ? record["fileCount"] : null,
    errorCode: typeof record["code"] === "string" ? record["code"] : null,
  };
}
