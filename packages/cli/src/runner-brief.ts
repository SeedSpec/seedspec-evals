import { createRunManifest, type RunManifest, type RunManifestInput } from "@seedspec/eval-core";
import { buildTrustedInstructionList } from "@seedspec/eval-harness";

import type { ExecutionEnvelope } from "./contracts.js";

export type DesktopRunner = "codex" | "claude-code";

export function buildDesktopManifest(envelope: ExecutionEnvelope, runner: DesktopRunner): RunManifest {
  const { runId: _runId, runner: _runner, ...immutableBody } = envelope.manifest;
  void _runId;
  void _runner;
  const body = JSON.parse(JSON.stringify(immutableBody)) as RunManifestInput;
  return createRunManifest({
    ...body,
    runner: {
      id: runner === "codex" ? "codex-desktop" : "claude-code",
      kind: "agent",
      version: "0.1.0-alpha.1",
    },
    tools: [
      { name: "desktop-agent-workspace", version: "0.1.0-alpha.1", configuration: { runner } },
      { name: "seedspec-simulated-author", version: "0.1.0-alpha.1" },
    ],
    configuration: {
      ...(body.configuration ?? {}),
      sourceRunId: envelope.manifest.runId,
      parityRunner: runner,
    },
  });
}

export function buildDesktopBrief(envelope: ExecutionEnvelope, manifest: RunManifest, runner: DesktopRunner, outputDirectory: string): string {
  const config = envelope.submission.config;
  const sharedInstructions = buildTrustedInstructionList(config);
  const tracePath = `${outputDirectory}/trace-draft.json`;
  const reportPath = `${outputDirectory}/report.md`;
  const envelopePath = `${outputDirectory}/source-envelope.json`;
  return [
    "# SeedSpec parity evaluation runner brief",
    "",
    `You are the ${runner === "codex" ? "Codex desktop" : "Claude Code"} runner for one controlled SeedSpec evaluation. Execute the work; do not merely review this brief.`,
    "",
    "## Reproducibility identity",
    "",
    `- External run ID: \`${manifest.runId}\``,
    `- Matching Think source run: \`${envelope.manifest.runId}\``,
    `- Case: \`${config.caseId}\``,
    `- Stage: \`${config.stage}\``,
    `- Requested model: \`${config.model}\``,
    `- Harness version: \`${manifest.harness.version}\``,
    `- Protocol version: \`${manifest.protocol.version}\``,
    "",
    "Before starting, select the same underlying model and snapshot as the requested model. If the environment cannot provide it, stop and ask the operator to create a new run identity for the actual model. Never infer parity from a marketing alias.",
    "",
    "## Trusted runner contract",
    "",
    ...sharedInstructions.map((instruction, index) => `${index + 1}. ${instruction}`),
    `${sharedInstructions.length + 1}. Work in a clean, isolated workspace. Do not inspect another runner's outputs.`,
    `${sharedInstructions.length + 2}. Use available SeedSpec CLI documentation and deterministic commands when useful. Record exact commands and versions.`,
    `${sharedInstructions.length + 3}. Record observable messages, tool calls/results, timing, usage when exposed, artifact paths/digests, errors, redactions, and capture limitations.`,
    `${sharedInstructions.length + 4}. When a material clarification is needed, call the simulated author through: \`node packages/cli/dist/index.js author answer ${envelopePath} --question <question-id>\`. Do not inspect the stored response map directly or invent an unavailable answer.`,
    "",
    "## Untrusted case material",
    "",
    "```json",
    JSON.stringify({ kind: "untrusted_case_material", caseId: config.caseId, stage: config.stage, material: config.untrustedMaterial }, null, 2),
    "```",
    "",
    "## Required outputs",
    "",
    `1. Produce the requested package or implementation in the clean workspace.`,
    `2. Write a concise evidence report to \`${reportPath}\`.`,
    `3. Write a trace body (without \`traceId\`) to \`${tracePath}\` using the SeedSpec trace contract. Use run ID \`${manifest.runId}\`, sourceRunId \`${envelope.manifest.runId}\`, runner ID \`${manifest.runner.id}\`, and \`reasoning: not-collected\`.`,
    `4. Finalize it from this repository with: \`node packages/cli/dist/index.js trace finalize ${tracePath}\`.` ,
    "5. State exactly what your environment could not capture. Do not fabricate events or token usage.",
    "",
    "Use this shape for the trace draft, replacing the illustrative values and adding zero-based, contiguous observable events:",
    "",
    "```json",
    JSON.stringify({
      schemaVersion: 1,
      runId: manifest.runId,
      sourceRunId: envelope.manifest.runId,
      runner: manifest.runner,
      model: manifest.model,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
      capture: { messages: "full", toolCalls: "full", toolResults: "full", timing: "event", usage: "unavailable", artifacts: "paths-and-digests", reasoning: "not-collected" },
      events: [{ sequence: 0, timestamp: "2026-01-01T00:00:00.000Z", kind: "status", actor: "runner", name: "run-started", data: {} }],
      limitations: ["Replace this with capture limitations for the current environment."],
      redactions: [],
    }, null, 2),
    "```",
    "",
    "The run is complete only when artifacts, report, and finalized trace exist.",
  ].join("\n");
}
