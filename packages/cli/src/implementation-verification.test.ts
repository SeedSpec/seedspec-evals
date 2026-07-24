import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createRunManifest } from "@seedspec/eval-core";

import {
  darwinVerificationSandboxProfile,
  verifyImplementationCounterfactuals,
  verifyImplementationRun,
} from "./implementation-verification.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("macOS implementation verification sandbox", () => {
  it("allows loopback-bound integration tests while retaining remote network denial", () => {
    const profile = darwinVerificationSandboxProfile("/tmp/seedspec-verifier");

    expect(profile).toContain("(deny network*)");
    expect(profile).toContain("(allow network* (local ip))");
    expect(profile.indexOf("(allow network* (local ip))"))
      .toBeGreaterThan(profile.indexOf("(deny network*)"));
    expect(profile).toContain('(allow file-write* (subpath "/tmp/seedspec-verifier"))');
  });
});

describe("counterfactual implementation verification", () => {
  it("overlays subject tests onto a known-bad candidate and records the required failure", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "seedspec-counterfactual-test-"));
    temporaryDirectories.push(root);
    const runDirectory = resolve(root, "run");
    const realization = resolve(runDirectory, "workspace", "realization");
    const candidate = resolve(root, "known-bad");
    await Promise.all([mkdir(realization, { recursive: true }), mkdir(candidate, { recursive: true })]);
    const manifest = createRunManifest({
      schemaVersion: 1,
      case: { id: "example-case", version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
      target: {
        stage: "implementation",
        authoredInputArtifactId: `artifact_${"f".repeat(64)}`,
      },
      variant: "seedspec-implementation",
      repetition: 0,
      createdAt: "2026-07-24T12:00:00.000Z",
      protocol: { name: "seedspec", version: "0.2.0", revision: `sha256:${"b".repeat(64)}` },
      runner: {
        id: "fixture-runner",
        kind: "agent",
        version: "1.0.0",
        revision: `sha256:${"c".repeat(64)}`,
        environment: { runtime: "node", runtimeVersion: process.version },
      },
      model: { provider: "fixture", modelId: "fixture/model", parameters: {} },
      harness: { name: "fixture-harness", version: "1.0.0", revision: `sha256:${"d".repeat(64)}` },
      tools: [],
      evaluators: [],
      limits: {
        maxTurns: 1,
        maxDurationMs: 60_000,
        maxInputBytes: 1_000_000,
        maxOutputBytes: 1_000_000,
      },
      instructionsDigest: `sha256:${"e".repeat(64)}`,
    });
    await Promise.all([
      writeFile(resolve(runDirectory, "run-manifest.json"), JSON.stringify(manifest), "utf8"),
      writeFile(resolve(realization, "behavior.txt"), "fixed\n", "utf8"),
      writeFile(resolve(candidate, "behavior.txt"), "broken\n", "utf8"),
      writeFile(
        resolve(realization, "behavior.test.mjs"),
        'import { readFileSync } from "node:fs";\nprocess.exit(readFileSync("behavior.txt", "utf8").trim() === "fixed" ? 0 : 1);\n',
        "utf8",
      ),
      writeFile(resolve(realization, "acceptance-report.json"), JSON.stringify({
        schemaVersion: 1,
        verificationCommands: [{
          id: "behavior-test",
          argv: ["node", "behavior.test.mjs"],
          testPaths: ["behavior.test.mjs"],
        }],
        scenarios: [{
          id: "behavior",
          outcome: "pass",
          commandIds: ["behavior-test"],
          evidence: ["behavior.test.mjs"],
        }],
        limitations: [],
      }), "utf8"),
    ]);
    await verifyImplementationRun({
      runDirectory,
      createdAt: "2026-07-24T12:01:00.000Z",
      allowUnsandboxed: process.platform !== "darwin",
    });
    const result = await verifyImplementationCounterfactuals({
      runDirectory,
      candidates: [{ id: "known-bad", path: candidate }],
      createdAt: "2026-07-24T12:02:00.000Z",
      allowUnsandboxed: process.platform !== "darwin",
    });
    expect(result.verification.summary).toEqual({
      distinguishing: 1,
      nonDistinguishing: 0,
      unevaluated: 0,
    });
    expect(result.verification.executions[0]?.rawOutcome).toBe("fail");
    expect(JSON.parse(await readFile(result.path, "utf8"))).toHaveProperty(
      "counterfactualVerificationId",
      result.verification.counterfactualVerificationId,
    );
  });
});
