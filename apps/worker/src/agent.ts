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

const ACTIVE_TOOLS = ["read", "write", "edit", "list", "find", "grep", "ask_author"];

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
    return {
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
    structuredLog("info", "eval.turn.started", {
      runId: config.runId,
      caseId: config.caseId,
      stage: config.stage,
      model: config.model,
      gatewayId: config.gatewayId,
      maxSteps: config.maxSteps,
    });
    return {
      activeTools: ACTIVE_TOOLS,
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
      inputTokens: context.usage.inputTokens,
      outputTokens: context.usage.outputTokens,
      totalTokens: context.usage.totalTokens,
      toolCallCount: context.toolCalls.length,
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
    status?: SubmissionStatus;
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
}
