#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadCaseFile, loadCaseLibrary } from "@seedspec/eval-case-library";
import { RunIdSchema, type EvaluationStage } from "@seedspec/eval-core";
import { SubmissionIdSchema } from "@seedspec/eval-harness";
import { Command, InvalidArgumentError } from "commander";

import { ExecutionEnvelopeSchema, ExperimentPlanSchema, type ExecutionEnvelope } from "./contracts.js";
import { CLI_DOCS } from "./docs.js";
import { createExperimentPlan } from "./plan.js";
import { cancelRemoteSubmission, inspectRemoteRun, submitEnvelope } from "./remote.js";

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
