import type { ExecutionEnvelope, ExperimentPlan } from "./contracts.js";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export async function submitEnvelope(endpoint: string, envelope: ExecutionEnvelope): Promise<unknown> {
  return requestJson(
    endpoint,
    `/v1/runs/${encodeURIComponent(envelope.manifest.runId)}/submissions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest: envelope.manifest, ...envelope.submission }),
    },
  );
}

export async function inspectRemoteRun(
  endpoint: string,
  runId: string,
  submissionId?: string,
): Promise<unknown> {
  const path = submissionId === undefined
    ? `/v1/runs/${encodeURIComponent(runId)}/submissions`
    : `/v1/runs/${encodeURIComponent(runId)}/submissions/${encodeURIComponent(submissionId)}`;
  return requestJson(endpoint, path, { method: "GET" });
}

export async function cancelRemoteSubmission(
  endpoint: string,
  runId: string,
  submissionId: string,
): Promise<unknown> {
  return requestJson(
    endpoint,
    `/v1/runs/${encodeURIComponent(runId)}/submissions/${encodeURIComponent(submissionId)}`,
    { method: "DELETE" },
  );
}

export async function exportRemoteTrace(endpoint: string, runId: string): Promise<unknown> {
  return requestJson(endpoint, `/v1/runs/${encodeURIComponent(runId)}/trace`, { method: "GET" });
}

export async function startRemoteMatrix(endpoint: string, plan: ExperimentPlan): Promise<unknown> {
  return requestJson(endpoint, "/v1/matrices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan, confirmModelExecution: true }),
  });
}

export async function inspectRemoteMatrix(endpoint: string, planId: string): Promise<unknown> {
  return requestJson(endpoint, `/v1/matrices/${encodeURIComponent(planId)}`, { method: "GET" });
}

export async function cancelRemoteMatrix(endpoint: string, plan: ExperimentPlan): Promise<unknown> {
  return requestJson(endpoint, `/v1/matrices/${encodeURIComponent(plan.planId)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

async function requestJson(endpoint: string, path: string, init: RequestInit): Promise<unknown> {
  const base = new URL(endpoint);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error("Endpoint must use HTTP or HTTPS.");
  const url = new URL(path, base.href.endsWith("/") ? base : `${base.href}/`);
  const token = process.env["SEEDSPEC_EVAL_API_TOKEN"];
  if (token === undefined || token.length < 32) {
    throw new Error("SEEDSPEC_EVAL_API_TOKEN must be set to submit or inspect remote runs.");
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) {
    throw new Error(`Remote response exceeded ${String(MAX_RESPONSE_BYTES)} bytes.`);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Remote response exceeded ${String(MAX_RESPONSE_BYTES)} bytes.`);
  }
  let body: unknown;
  try {
    body = text.length === 0 ? null : JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Remote returned non-JSON HTTP ${String(response.status)}.`);
  }
  if (!response.ok) {
    throw new Error(`Remote HTTP ${String(response.status)}: ${safeRemoteMessage(body)}`);
  }
  return body;
}

function safeRemoteMessage(body: unknown): string {
  if (!isRecord(body)) return "request failed";
  const error = body["error"];
  if (!isRecord(error)) return "request failed";
  const code = error["code"];
  const message = error["message"];
  return [code, message].filter((value): value is string => typeof value === "string").join(": ") || "request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
