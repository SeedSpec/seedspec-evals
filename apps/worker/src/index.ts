import {
  HARNESS_VERSION,
  MatrixPlanRequestSchema,
  MatrixStartRequestSchema,
  parseConfigureRunRequest,
  parseSubmitRunRequest,
} from "@seedspec/eval-harness";
import { getAgentByName } from "agents";

import type { SeedSpecEvalAgent } from "./agent.js";
import {
  HttpError,
  MAX_MATRIX_REQUEST_BODY_BYTES,
  authenticateRequest,
  allowedMethodsForRoute,
  matchApiRoute,
  parseListSubmissionsQuery,
  readBoundedJson,
  readApiToken,
  type ApiRoute,
} from "./http.js";
import { errorClass, structuredLog } from "./logging.js";

export { SeedSpecEvalAgent } from "./agent.js";
export { SeedSpecEvalMatrixWorkflow } from "./matrix-workflow.js";

type AgentStub = DurableObjectStub<SeedSpecEvalAgent>;

function jsonResponse(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  extraHeaders?: HeadersInit,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message, requestId },
    },
    status,
    extraHeaders,
  );
}

function methodNotAllowed(requestId: string, allowed: string[]): Response {
  return errorResponse(
    requestId,
    405,
    "method_not_allowed",
    "The HTTP method is not allowed.",
    { allow: allowed.join(", ") },
  );
}

async function resolveAgent(env: Env, runId: string): Promise<AgentStub> {
  // Wrangler's generated Env is strongly typed for tsc, but ESLint resolves its
  // circular `import("./src/index")` binding annotation as `any`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- verified by the Worker package build
  return getAgentByName(env.SeedSpecEvalAgent, runId, {
    routingRetry: { maxAttempts: 3 },
  });
}

async function handleRunRoute(
  request: Request,
  env: Env,
  route: Extract<ApiRoute, { runId: string }>,
  requestId: string,
): Promise<Response> {
  const agent = await resolveAgent(env, route.runId);

  if (route.kind === "run-health") {
    if (request.method !== "GET") return methodNotAllowed(requestId, ["GET"]);
    const health = await agent.getRunHealth();
    return jsonResponse({ ok: true, health });
  }

  if (route.kind === "run-trace") {
    if (request.method !== "GET") return methodNotAllowed(requestId, ["GET"]);
    const result = await agent.exportRunTrace();
    if (!result.ok || result.traceJson === null) {
      const code = result.error?.code ?? "trace_unavailable";
      return errorResponse(requestId, code === "trace_not_final" ? 409 : 404, code, result.error?.message ?? "The trace is unavailable.");
    }
    return jsonResponse({ ok: true, trace: JSON.parse(result.traceJson) as unknown });
  }

  if (route.kind === "run-config") {
    if (request.method === "GET") {
      const config = await agent.getRunConfig();
      if (config === null) {
        return errorResponse(requestId, 404, "run_not_configured", "The run is not configured.");
      }
      return jsonResponse({ ok: true, config });
    }
    if (request.method === "PUT") {
      const parsed = parseConfigureRunRequest(await readBoundedJson(request));
      if (!parsed.success || parsed.data.config.runId !== route.runId) {
        return errorResponse(requestId, 400, "invalid_request", "The run configuration is invalid.");
      }
      const result = await agent.configureRun(parsed.data);
      if (!result.ok || result.value === null || result.error !== null) {
        if (result.error === null) {
          throw new Error("Run configuration RPC returned an invalid response.");
        }
        const status = result.error.code === "config_conflict" ? 409 : 400;
        return errorResponse(requestId, status, result.error.code, result.error.message);
      }
      return jsonResponse(
        { ok: true, config: result.value.config, disposition: result.value.disposition },
        result.value.disposition === "configured" ? 201 : 200,
      );
    }
    return methodNotAllowed(requestId, ["GET", "PUT"]);
  }

  if (route.kind === "submissions") {
    if (request.method === "GET") {
      const query = parseListSubmissionsQuery(new URL(request.url));
      if (query === null) {
        return errorResponse(requestId, 400, "invalid_query", "The submission query is invalid.");
      }
      const submissions = await agent.listRunSubmissions(
        query.status === undefined
          ? { limit: query.limit }
          : { status: query.status, limit: query.limit },
      );
      return jsonResponse({ ok: true, runId: route.runId, submissions });
    }
    if (request.method === "POST") {
      const parsed = parseSubmitRunRequest(await readBoundedJson(request));
      if (!parsed.success || parsed.data.config.runId !== route.runId) {
        return errorResponse(requestId, 400, "invalid_request", "The submission request is invalid.");
      }
      const result = await agent.submitRun(parsed.data);
      if (!result.ok || result.value === null || result.error !== null) {
        if (result.error === null) throw new Error("Submission RPC returned an invalid response.");
        const status = result.error.code === "config_conflict" ? 409 : 400;
        return errorResponse(requestId, status, result.error.code, result.error.message);
      }
      return jsonResponse(
        { ok: true, runId: route.runId, submission: result.value },
        result.value.accepted ? 202 : 200,
      );
    }
    return methodNotAllowed(requestId, ["GET", "POST"]);
  }

  if (request.method !== "GET" && request.method !== "DELETE") {
    return methodNotAllowed(requestId, allowedMethodsForRoute(route));
  }
  const submission =
    request.method === "DELETE"
      ? await agent.cancelRunSubmission(route.submissionId)
      : await agent.inspectRunSubmission(route.submissionId);
  if (submission === null) {
    return errorResponse(requestId, 404, "submission_not_found", "The submission was not found.");
  }
  return jsonResponse({
    ok: true,
    runId: route.runId,
    submission,
    ...(request.method === "DELETE" ? { cancellationRequested: true } : {}),
  });
}

async function handleMatrixRoute(
  request: Request,
  env: Env,
  route: Extract<ApiRoute, { kind: "matrices" | "matrix" }>,
  requestId: string,
): Promise<Response> {
  if (route.kind === "matrices") {
    if (request.method !== "POST") return methodNotAllowed(requestId, ["POST"]);
    const parsed = MatrixStartRequestSchema.safeParse(await readBoundedJson(request, MAX_MATRIX_REQUEST_BODY_BYTES));
    if (!parsed.success) return errorResponse(requestId, 400, "invalid_matrix_request", "The matrix plan is invalid or model execution was not explicitly confirmed.");
    const instances = await env.EVAL_MATRIX.createBatch([{ id: parsed.data.plan.planId, params: parsed.data }]);
    const status = await instances[0]?.status();
    return jsonResponse({ ok: true, planId: parsed.data.plan.planId, workflow: publicWorkflowStatus(status) }, 202);
  }

  if (request.method === "GET") {
    const instance = await env.EVAL_MATRIX.get(route.planId);
    return jsonResponse({ ok: true, planId: route.planId, workflow: publicWorkflowStatus(await instance.status()) });
  }
  if (request.method !== "DELETE") return methodNotAllowed(requestId, ["GET", "DELETE"]);
  const parsed = MatrixPlanRequestSchema.safeParse(await readBoundedJson(request, MAX_MATRIX_REQUEST_BODY_BYTES));
  if (!parsed.success || parsed.data.plan.planId !== route.planId) {
    return errorResponse(requestId, 400, "invalid_matrix_request", "Cancellation requires the matching immutable plan.");
  }
  const instance = await env.EVAL_MATRIX.get(route.planId);
  await instance.terminate();
  let childCancellations = 0;
  await Promise.all(parsed.data.plan.envelopes.map(async (envelope) => {
    const agent = await resolveAgent(env, envelope.manifest.runId);
    const active = await agent.listRunSubmissions({ status: ["pending", "running"], limit: 100 });
    await Promise.all(active.map(async (submission) => {
      await agent.cancelRunSubmission(submission.submissionId);
      childCancellations += 1;
    }));
  }));
  return jsonResponse({ ok: true, planId: route.planId, cancellationRequested: true, childCancellations });
}

function publicWorkflowStatus(status: unknown): unknown {
  if (typeof status !== "object" || status === null) return { status: "unknown" };
  const value = status as Record<string, unknown>;
  return {
    status: typeof value["status"] === "string" ? value["status"] : "unknown",
    ...(value["output"] === undefined ? {} : { output: value["output"] }),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const url = new URL(request.url);
    structuredLog("info", "http.request.started", {
      requestId,
      method: request.method,
      path: url.pathname,
    });

    let response: Response;
    try {
      const route = matchApiRoute(url.pathname);
      if (route === null) {
        response = errorResponse(requestId, 404, "not_found", "The requested endpoint was not found.");
      } else if (route.kind === "service-health") {
        response =
          request.method === "GET"
            ? jsonResponse({
                ok: true,
                service: "seedspec-eval-worker",
                harnessVersion: HARNESS_VERSION,
                timestamp: new Date().toISOString(),
              })
            : methodNotAllowed(requestId, ["GET"]);
      } else {
        const authentication = authenticateRequest(request, readApiToken(env));
        if (authentication === "unconfigured") {
          response = errorResponse(
            requestId,
            503,
            "authentication_not_configured",
            "Run routes are disabled until SEEDSPEC_EVAL_API_TOKEN is configured.",
          );
        } else if (authentication !== "authorized") {
          response = errorResponse(
            requestId,
            401,
            "unauthorized",
            "A valid bearer token is required.",
            { "www-authenticate": "Bearer" },
          );
        } else {
          response = route.kind === "matrices" || route.kind === "matrix"
            ? await handleMatrixRoute(request, env, route, requestId)
            : await handleRunRoute(request, env, route, requestId);
        }
      }
    } catch (error) {
      if (error instanceof HttpError) {
        response = errorResponse(requestId, error.status, error.code, error.message);
      } else {
        structuredLog("error", "http.request.failed", {
          requestId,
          method: request.method,
          path: url.pathname,
          errorClass: errorClass(error),
        });
        response = errorResponse(requestId, 500, "internal_error", "The request could not be completed.");
      }
    }

    structuredLog("info", "http.request.finished", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  },
} satisfies ExportedHandler<Env>;
