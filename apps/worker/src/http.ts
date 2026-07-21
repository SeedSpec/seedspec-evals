import {
  ListSubmissionsQuerySchema,
  RunIdSchema,
  SubmissionIdSchema,
  type ListSubmissionsQuery,
} from "@seedspec/eval-harness";

export const MAX_REQUEST_BODY_BYTES = 384 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type AuthenticationResult = "authorized" | "missing" | "invalid" | "unconfigured";

export function readApiToken(env: unknown): string | null {
  if (typeof env !== "object" || env === null) return null;
  const value = (env as Record<string, unknown>)["SEEDSPEC_EVAL_API_TOKEN"];
  return typeof value === "string" && value.length >= 32 ? value : null;
}

export function authenticateRequest(request: Request, expectedToken: string | null): AuthenticationResult {
  if (expectedToken === null) return "unconfigured";
  const authorization = request.headers.get("authorization");
  if (authorization === null) return "missing";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (match === null) return "invalid";
  return timingSafeEqual(match[1] ?? "", expectedToken) ? "authorized" : "invalid";
}

export type ApiRoute =
  | { kind: "service-health" }
  | { kind: "run-health"; runId: string }
  | { kind: "run-config"; runId: string }
  | { kind: "submissions"; runId: string }
  | { kind: "submission"; runId: string; submissionId: string };

export function allowedMethodsForRoute(route: ApiRoute): string[] {
  switch (route.kind) {
    case "service-health":
    case "run-health":
      return ["GET"];
    case "run-config":
      return ["GET", "PUT"];
    case "submissions":
      return ["GET", "POST"];
    case "submission":
      return ["GET", "DELETE"];
  }
}

export function matchApiRoute(pathname: string): ApiRoute | null {
  if (pathname === "/health" || pathname === "/healthz") return { kind: "service-health" };

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "v1" || segments[1] !== "runs" || segments.length < 4) return null;

  const runId = decodePathSegment(segments[2] ?? "");
  if (!RunIdSchema.safeParse(runId).success) return null;

  if (segments.length === 4 && segments[3] === "health") return { kind: "run-health", runId };
  if (segments.length === 4 && segments[3] === "config") return { kind: "run-config", runId };
  if (segments[3] !== "submissions") return null;
  if (segments.length === 4) return { kind: "submissions", runId };
  if (segments.length !== 5) return null;

  const submissionId = decodePathSegment(segments[4] ?? "");
  if (!SubmissionIdSchema.safeParse(submissionId).success) return null;
  return { kind: "submission", runId, submissionId };
}

export function parseListSubmissionsQuery(url: URL): ListSubmissionsQuery | null {
  const input: Record<string, string> = {};
  const status = url.searchParams.get("status");
  const limit = url.searchParams.get("limit");
  if (status !== null) input["status"] = status;
  if (limit !== null) input["limit"] = limit;
  const parsed = ListSubmissionsQuerySchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim();
  if (mediaType !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, "body_too_large", "The request body exceeds the size limit.");
  }
  if (request.body === null) throw new HttpError(400, "invalid_json", "A JSON body is required.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel("request body too large");
        throw new HttpError(413, "body_too_large", "The request body exceeds the size limit.");
      }
      try {
        body += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new HttpError(400, "invalid_utf8", "The request body is not valid UTF-8.");
      }
    }
    try {
      body += decoder.decode();
    } catch {
      throw new HttpError(400, "invalid_utf8", "The request body is not valid UTF-8.");
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}
