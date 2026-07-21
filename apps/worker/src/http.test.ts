import { describe, expect, it } from "vitest";

import {
  authenticateRequest,
  allowedMethodsForRoute,
  matchApiRoute,
  parseListSubmissionsQuery,
  readBoundedJson,
} from "./http.js";

const RUN_ID = `run_${"b".repeat(64)}`;

describe("Worker HTTP helpers", () => {
  it("matches stable run and submission routes", () => {
    expect(matchApiRoute(`/v1/runs/${RUN_ID}/config`)).toEqual({
      kind: "run-config",
      runId: RUN_ID,
    });
    const submissionRoute = matchApiRoute(`/v1/runs/${RUN_ID}/submissions/submission-1`);
    expect(submissionRoute).toEqual({
      kind: "submission",
      runId: RUN_ID,
      submissionId: "submission-1",
    });
    expect(submissionRoute === null ? [] : allowedMethodsForRoute(submissionRoute)).toEqual([
      "GET",
      "DELETE",
    ]);
    expect(matchApiRoute("/v1/runs/not-a-run/config")).toBeNull();
    expect(matchApiRoute(`/v1/runs/${RUN_ID}/trace`)).toEqual({ kind: "run-trace", runId: RUN_ID });
    const planId = `plan_${"c".repeat(64)}`;
    expect(matchApiRoute("/v1/matrices")).toEqual({ kind: "matrices" });
    expect(matchApiRoute(`/v1/matrices/${planId}`)).toEqual({ kind: "matrix", planId });
  });

  it("validates and defaults submission listing queries", () => {
    expect(parseListSubmissionsQuery(new URL("https://example.test/"))).toEqual({ limit: 50 });
    expect(
      parseListSubmissionsQuery(new URL("https://example.test/?status=running&limit=10")),
    ).toEqual({ status: "running", limit: 10 });
    expect(parseListSubmissionsQuery(new URL("https://example.test/?limit=1000"))).toBeNull();
  });

  it("reads a bounded JSON request body", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    await expect(readBoundedJson(request)).resolves.toEqual({ ok: true });
  });

  it("requires an exact bearer token and fails closed without configuration", () => {
    const token = "a-secure-evaluation-token-that-is-long-enough";
    expect(authenticateRequest(new Request("https://example.test/"), null)).toBe("unconfigured");
    expect(authenticateRequest(new Request("https://example.test/"), token)).toBe("missing");
    expect(authenticateRequest(new Request("https://example.test/", {
      headers: { authorization: "Bearer wrong-token" },
    }), token)).toBe("invalid");
    expect(authenticateRequest(new Request("https://example.test/", {
      headers: { authorization: `Bearer ${token}` },
    }), token)).toBe("authorized");
  });

  it("rejects lookalike JSON media types", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "content-type": "application/jsonp" },
      body: "{}",
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      code: "unsupported_media_type",
      status: 415,
    });
  });

  it("rejects malformed UTF-8", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])]),
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      code: "invalid_utf8",
      status: 400,
    });
  });
});
