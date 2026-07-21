import {
  HARNESS_VERSION,
  parseConfigureRunRequest,
  parseSubmitRunRequest,
} from "@seedspec/eval-harness";
import { getAgentByName } from "agents";

import type { SeedSpecEvalAgent } from "./agent.js";
import {
  HttpError,
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
  route: Exclude<ApiRoute, { kind: "service-health" }>,
  requestId: string,
): Promise<Response> {
  const agent = await resolveAgent(env, route.runId);

  if (route.kind === "run-health") {
    if (request.method !== "GET") return methodNotAllowed(requestId, ["GET"]);
    const health = await agent.getRunHealth();
    return jsonResponse({ ok: true, health });
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
          response = await handleRunRoute(request, env, route, requestId);
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
