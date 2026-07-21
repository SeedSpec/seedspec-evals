import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import {
  MatrixStartRequestSchema,
  type ExperimentPlan,
  type SubmissionInspection,
} from "@seedspec/eval-harness";
import { getAgentByName } from "agents";

import type { SeedSpecEvalAgent } from "./agent.js";

type MatrixParams = { plan: ExperimentPlan; confirmModelExecution: true };
type MatrixRun = {
  runId: string;
  submissionId: string | null;
  status: SubmissionInspection["status"] | "rejected";
  errorCode?: string;
};

const TERMINAL = new Set(["completed", "aborted", "skipped", "error", "rejected"]);

export class SeedSpecEvalMatrixWorkflow extends WorkflowEntrypoint<Env, MatrixParams> {
  override async run(event: WorkflowEvent<MatrixParams>, step: WorkflowStep): Promise<unknown> {
    const parsed = MatrixStartRequestSchema.safeParse(event.payload);
    if (!parsed.success) throw new NonRetryableError("The matrix request is invalid or lacks explicit model-execution confirmation.");
    const { plan } = parsed.data;
    const runs: MatrixRun[] = [];

    for (const [index, envelope] of plan.envelopes.entries()) {
      const submitted = await step.do(`submit-${String(index).padStart(3, "0")}`, async () => {
        const agent = await resolveAgent(this.env, envelope.manifest.runId);
        const result = await agent.submitRun({ manifest: envelope.manifest, ...envelope.submission });
        if (!result.ok || result.value === null) {
          return { runId: envelope.manifest.runId, submissionId: null, status: "rejected" as const, errorCode: result.error?.code ?? "submission_failed" };
        }
        return { runId: envelope.manifest.runId, submissionId: result.value.submissionId, status: result.value.status };
      });
      runs.push(submitted);
    }

    for (let cycle = 0; cycle < 90 && runs.some((run) => !TERMINAL.has(run.status)); cycle += 1) {
      const snapshot = await step.do(`poll-${String(cycle).padStart(3, "0")}`, async () => {
        return Promise.all(runs.map(async (run) => {
          if (run.submissionId === null || TERMINAL.has(run.status)) return run;
          const agent = await resolveAgent(this.env, run.runId);
          const inspection = await agent.inspectRunSubmission(run.submissionId);
          return inspection === null ? { ...run, status: "error" as const, errorCode: "submission_not_found" } : { ...run, status: inspection.status };
        }));
      });
      runs.splice(0, runs.length, ...snapshot);
      if (runs.some((run) => !TERMINAL.has(run.status))) await step.sleep(`poll-delay-${String(cycle).padStart(3, "0")}`, "10 seconds");
    }

    for (const run of runs) {
      if (!TERMINAL.has(run.status)) {
        run.status = "error";
        run.errorCode = "matrix_poll_timeout";
      }
    }
    return { schemaVersion: 1, planId: plan.planId, status: matrixStatus(runs), counts: countStatuses(runs), runs };
  }
}

function countStatuses(runs: MatrixRun[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) counts[run.status] = (counts[run.status] ?? 0) + 1;
  return counts;
}

function matrixStatus(runs: MatrixRun[]): "completed" | "failed" {
  return runs.every((run) => run.status === "completed") ? "completed" : "failed";
}

async function resolveAgent(env: Env, runId: string): Promise<DurableObjectStub<SeedSpecEvalAgent>> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- verified by the Worker package build
  return getAgentByName(env.SeedSpecEvalAgent, runId, { routingRetry: { maxAttempts: 3 } });
}
