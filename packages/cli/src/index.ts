#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadCaseFile, loadCaseLibrary } from "@seedspec/eval-case-library";
import { RunIdSchema, TraceBodySchema, createTrace, parseTrace, type EvaluationStage } from "@seedspec/eval-core";
import { SubmissionIdSchema } from "@seedspec/eval-harness";
import { Command, InvalidArgumentError } from "commander";

import { ExecutionEnvelopeSchema, ExperimentPlanSchema, type ExecutionEnvelope } from "./contracts.js";
import { CLI_DOCS } from "./docs.js";
import { createExperimentPlan } from "./plan.js";
import {
  cancelRemoteMatrix,
  cancelRemoteSubmission,
  exportRemoteTrace,
  inspectRemoteMatrix,
  inspectRemoteRun,
  startRemoteMatrix,
  submitEnvelope,
} from "./remote.js";
import { buildDesktopBrief, buildDesktopManifest, type DesktopRunner } from "./runner-brief.js";

const CLI_VERSION = "0.1.0-alpha.1";
const program = new Command();

program
  .name("seedspec-eval")
  .description("Plan, run, and inspect reproducible SeedSpec evaluations.")
  .version(CLI_VERSION)
  .option("--json", "emit machine-readable command output");

const cases = program.command("cases").description("Inspect the committed evaluation case library.");

cases.command("list")
  .option("--root <directory>", "case library root", "cases")
  .action(async (options: { root: string }) => {
    const loaded = await loadCaseLibrary(resolve(options.root));
    output({ ok: true, count: loaded.length, cases: loaded.map((entry) => ({
      id: entry.case.id,
      version: entry.case.version,
      title: entry.case.title,
      mode: entry.case.authorship.mode,
      path: entry.relativePath,
    })) }, `${String(loaded.length)} valid evaluation cases:\n${loaded.map((entry) =>
      `- ${entry.case.id}@${entry.case.version} (${entry.case.authorship.mode}) — ${entry.relativePath}`).join("\n")}`);
  });

cases.command("validate")
  .argument("[case-file]", "case file relative to --root; omit to validate the library")
  .option("--root <directory>", "case library root", "cases")
  .action(async (caseFile: string | undefined, options: { root: string }) => {
    const root = resolve(options.root);
    const loaded = caseFile === undefined ? await loadCaseLibrary(root) : [await loadCaseFile(root, caseFile)];
    output({ ok: true, count: loaded.length, cases: loaded.map((entry) => entry.case.id) },
      `Validated ${String(loaded.length)} case${loaded.length === 1 ? "" : "s"}. No model was called.`);
  });

const experiment = program.command("experiment").description("Create immutable evaluation run manifests.");

experiment.command("plan")
  .option("--root <directory>", "case library root", "cases")
  .option("--case <id...>", "case IDs to include; defaults to all")
  .requiredOption("--model <model...>", "AI Gateway model slug(s)")
  .option("--stage <stage>", "authorship or implementation", parseStage, "authorship")
  .option("--repetitions <count>", "runs per case/model", parsePositiveInteger, 1)
  .option("--gateway <id>", "Cloudflare AI Gateway ID", "seedspec-evals")
  .option("--protocol-version <version>", "SeedSpec protocol version", "0.1.0-alpha.4")
  .option("--max-steps <count>", "maximum Think steps per turn", parsePositiveInteger, 6)
  .option("--authored-package-artifact <id>", "authored package artifact for implementation runs")
  .option("--out <file>", "plan output path")
  .action(async (options: {
    root: string;
    case?: string[];
    model: string[];
    stage: EvaluationStage;
    repetitions: number;
    gateway: string;
    protocolVersion: string;
    maxSteps: number;
    authoredPackageArtifact?: string;
    out?: string;
  }) => {
    const allCases = await loadCaseLibrary(resolve(options.root));
    const selected = options.case === undefined
      ? allCases
      : allCases.filter((entry) => options.case?.includes(entry.case.id) === true);
    const missing = options.case?.filter((id) => !selected.some((entry) => entry.case.id === id)) ?? [];
    if (missing.length > 0) throw new Error(`Unknown case IDs: ${missing.join(", ")}`);
    const createdAt = new Date().toISOString();
    const plan = await createExperimentPlan({
      cases: selected,
      stage: options.stage,
      models: options.model,
      repetitions: options.repetitions,
      gatewayId: options.gateway,
      protocolVersion: options.protocolVersion,
      createdAt,
      maxSteps: options.maxSteps,
      ...(options.authoredPackageArtifact === undefined
        ? {}
        : { authoredPackageArtifactId: options.authoredPackageArtifact }),
    });
    const defaultPath = `runs/${createdAt.replaceAll(/[:.]/g, "-")}-${plan.planId.slice(0, 17)}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    output({ ok: true, planId: plan.planId, runs: plan.envelopes.length, path: outPath },
      `Planned ${String(plan.envelopes.length)} model run${plan.envelopes.length === 1 ? "" : "s"} in ${outPath}.\nNo model was called. Review the plan, then submit an envelope with --confirm-model-execution.`);
  });

const run = program.command("run").description("Submit or inspect Cloudflare Think runs.");

run.command("submit")
  .argument("<plan-or-envelope>", "JSON plan or execution envelope")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .option("--run <run-id>", "select one run from a plan")
  .option("--confirm-model-execution", "explicitly authorize this model call")
  .action(async (file: string, options: { endpoint: string; run?: string; confirmModelExecution?: boolean }) => {
    if (options.confirmModelExecution !== true) {
      throw new Error("Model execution was not started. Re-run with --confirm-model-execution after reviewing the envelope.");
    }
    const input = JSON.parse(await readFile(resolve(file), "utf8")) as unknown;
    const envelope = selectEnvelope(input, options.run);
    const response = await submitEnvelope(options.endpoint, envelope);
    output({ ok: true, runId: envelope.manifest.runId, response },
      `Submitted ${envelope.manifest.runId}. The Think submission was durably accepted or deduplicated; use run status to inspect it.`);
  });

run.command("status")
  .argument("<run-id>")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .option("--submission <id>", "inspect one submission")
  .action(async (runId: string, options: { endpoint: string; submission?: string }) => {
    assertRunId(runId);
    if (options.submission !== undefined && !SubmissionIdSchema.safeParse(options.submission).success) {
      throw new Error("Invalid submission ID.");
    }
    const response = await inspectRemoteRun(options.endpoint, runId, options.submission);
    output({ ok: true, runId, response }, JSON.stringify(response, null, 2));
  });

run.command("cancel")
  .argument("<run-id>")
  .argument("<submission-id>")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .action(async (runId: string, submissionId: string, options: { endpoint: string }) => {
    assertRunId(runId);
    if (!SubmissionIdSchema.safeParse(submissionId).success) throw new Error("Invalid submission ID.");
    const response = await cancelRemoteSubmission(options.endpoint, runId, submissionId);
    output({ ok: true, runId, submissionId, response }, `Cancellation requested for ${submissionId}.`);
  });

run.command("trace")
  .argument("<run-id>")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .option("--out <file>", "trace output path")
  .action(async (runId: string, options: { endpoint: string; out?: string }) => {
    assertRunId(runId);
    const response = await exportRemoteTrace(options.endpoint, runId);
    const trace = extractTrace(response);
    const outPath = resolve(options.out ?? `runs/${runId}/trace.json`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    output({ ok: true, runId, traceId: trace.traceId, path: outPath }, `Exported observable trace ${trace.traceId} to ${outPath}. Hidden reasoning was not collected.`);
  });

const matrix = program.command("matrix").description("Coordinate a reviewed plan through Cloudflare Workflows.");

matrix.command("start")
  .argument("<plan>", "experiment plan JSON")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .option("--confirm-model-execution", "explicitly authorize all model calls in the plan")
  .action(async (file: string, options: { endpoint: string; confirmModelExecution?: boolean }) => {
    if (options.confirmModelExecution !== true) throw new Error("Matrix execution was not started. Review the plan, then re-run with --confirm-model-execution.");
    const plan = ExperimentPlanSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
    const response = await startRemoteMatrix(options.endpoint, plan);
    output({ ok: true, planId: plan.planId, runs: plan.envelopes.length, response }, `Started matrix ${plan.planId} with ${String(plan.envelopes.length)} durable run${plan.envelopes.length === 1 ? "" : "s"}.`);
  });

matrix.command("status")
  .argument("<plan-id>")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .action(async (planId: string, options: { endpoint: string }) => {
    assertPlanId(planId);
    const response = await inspectRemoteMatrix(options.endpoint, planId);
    output({ ok: true, planId, response }, JSON.stringify(response, null, 2));
  });

matrix.command("cancel")
  .argument("<plan>", "matching immutable experiment plan JSON")
  .requiredOption("--endpoint <url>", "deployed or local Worker endpoint")
  .action(async (file: string, options: { endpoint: string }) => {
    const plan = ExperimentPlanSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
    const response = await cancelRemoteMatrix(options.endpoint, plan);
    output({ ok: true, planId: plan.planId, response }, `Cancellation requested for matrix ${plan.planId} and its active child runs.`);
  });

const runner = program.command("runner").description("Prepare parity runs for agent desktop environments.");

runner.command("brief")
  .argument("<plan-or-envelope>", "JSON plan or execution envelope")
  .requiredOption("--runner <runner>", "codex or claude-code", parseDesktopRunner)
  .option("--run <run-id>", "select one run from a plan")
  .option("--out <directory>", "runner kit directory")
  .option("--stdout", "print the complete copy/paste brief")
  .action(async (file: string, options: { runner: DesktopRunner; run?: string; out?: string; stdout?: boolean }) => {
    const input = JSON.parse(await readFile(resolve(file), "utf8")) as unknown;
    const envelope = selectEnvelope(input, options.run);
    const manifest = buildDesktopManifest(envelope, options.runner);
    const outputDirectory = options.out ?? `runs/${manifest.runId}`;
    const brief = buildDesktopBrief(envelope, manifest, options.runner, outputDirectory);
    const directory = resolve(outputDirectory);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(resolve(directory, "handoff.md"), `${brief}\n`, "utf8"),
      writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      writeFile(resolve(directory, "source-envelope.json"), `${JSON.stringify(envelope, null, 2)}\n`, "utf8"),
    ]);
    output(
      { ok: true, runner: options.runner, runId: manifest.runId, sourceRunId: envelope.manifest.runId, path: directory, brief },
      options.stdout === true ? brief : `Prepared a ${options.runner} runner kit in ${directory}. Paste handoff.md into a clean agent task using the requested model.`,
    );
  });

const author = program.command("author").description("Expose pre-declared simulated author responses one question at a time.");

author.command("answer")
  .argument("<plan-or-envelope>", "JSON plan or execution envelope")
  .requiredOption("--question <id>", "exact pre-declared question ID")
  .option("--run <run-id>", "select one run from a plan")
  .action(async (file: string, options: { question: string; run?: string }) => {
    const input = JSON.parse(await readFile(resolve(file), "utf8")) as unknown;
    const envelope = selectEnvelope(input, options.run);
    const responses = envelope.submission.config.simulatedAuthorResponses;
    const answered = Object.prototype.hasOwnProperty.call(responses, options.question);
    const response = { answered, questionId: options.question, answer: answered ? responses[options.question] ?? null : null };
    output({ ok: true, ...response }, answered ? `Simulated author (${options.question}): ${response.answer ?? ""}` : `The simulated author has no pre-declared answer for ${options.question}.`);
  });

const trace = program.command("trace").description("Finalize and validate portable observable run traces.");

trace.command("finalize")
  .argument("<draft>", "trace body JSON without traceId")
  .option("--out <file>", "final trace output; defaults beside the draft")
  .action(async (file: string, options: { out?: string }) => {
    const inputPath = resolve(file);
    const body = TraceBodySchema.parse(JSON.parse(await readFile(inputPath, "utf8")) as unknown);
    const finalized = createTrace(body);
    const defaultOut = inputPath.endsWith("-draft.json") ? inputPath.replace(/-draft\.json$/, ".json") : resolve(dirname(inputPath), "trace.json");
    const outPath = resolve(options.out ?? defaultOut);
    await writeFile(outPath, `${JSON.stringify(finalized, null, 2)}\n`, "utf8");
    output({ ok: true, traceId: finalized.traceId, runId: finalized.runId, path: outPath }, `Finalized observable trace ${finalized.traceId} at ${outPath}.`);
  });

trace.command("validate")
  .argument("<trace>", "final trace JSON")
  .action(async (file: string) => {
    const parsed = parseTrace(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
    output({ ok: true, traceId: parsed.traceId, runId: parsed.runId }, `Validated trace ${parsed.traceId}. Reasoning capture is explicitly ${parsed.capture.reasoning}.`);
  });

program.command("docs")
  .argument("[topic]", "architecture, lifecycle, labs, cli, or safety", "cli")
  .action((topic: string) => {
    const content = CLI_DOCS[topic];
    if (content === undefined) throw new Error(`Unknown docs topic: ${topic}`);
    output({ ok: true, topic, version: CLI_VERSION, content }, content);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const response = { ok: false, error: { code: "EVAL_COMMAND_FAILED", message }, next: [] };
  if (program.opts<{ json?: boolean }>().json === true) {
    process.stderr.write(`${JSON.stringify(response)}\n`);
  } else {
    process.stderr.write(`EVAL_COMMAND_FAILED: ${message}\n`);
  }
  process.exitCode = 1;
});

function output(json: unknown, text: string): void {
  process.stdout.write(`${program.opts<{ json?: boolean }>().json === true ? JSON.stringify(json) : text}\n`);
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError("must be a positive integer");
  return parsed;
}

function parseStage(value: string): EvaluationStage {
  if (value !== "authorship" && value !== "implementation") {
    throw new InvalidArgumentError("must be authorship or implementation");
  }
  return value;
}

function assertRunId(value: string): void {
  if (!RunIdSchema.safeParse(value).success) throw new Error("Invalid run ID.");
}

function assertPlanId(value: string): void {
  if (!/^plan_[a-f0-9]{64}$/.test(value)) throw new Error("Invalid plan ID.");
}

function parseDesktopRunner(value: string): DesktopRunner {
  if (value !== "codex" && value !== "claude-code") throw new InvalidArgumentError("must be codex or claude-code");
  return value;
}

function extractTrace(response: unknown): ReturnType<typeof parseTrace> {
  if (typeof response !== "object" || response === null || !("trace" in response)) throw new Error("Remote trace response is invalid.");
  return parseTrace(response.trace);
}

function selectEnvelope(input: unknown, runId?: string): ExecutionEnvelope {
  const direct = ExecutionEnvelopeSchema.safeParse(input);
  if (direct.success) return direct.data;
  const plan = ExperimentPlanSchema.parse(input);
  if (runId === undefined && plan.envelopes.length !== 1) {
    throw new Error("The plan contains multiple runs; select one with --run <run-id>.");
  }
  const selected = runId === undefined
    ? plan.envelopes[0]
    : plan.envelopes.find((envelope) => envelope.manifest.runId === runId);
  if (selected === undefined) throw new Error(`Run not found in plan: ${runId ?? "<only run>"}`);
  return selected;
}
