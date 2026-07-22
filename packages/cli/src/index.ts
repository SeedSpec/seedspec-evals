#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCaseFile, loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  EvaluationVariantSchema,
  RunIdSchema,
  TraceBodySchema,
  createTrace,
  parseTrace,
  variantsForStage,
  type EvaluationStage,
  type EvaluationVariant,
} from "@seedspec/eval-core";
import { SubmissionIdSchema } from "@seedspec/eval-harness";
import { Command, InvalidArgumentError } from "commander";

import { ExecutionEnvelopeSchema, ExperimentPlanSchema, type ExecutionEnvelope } from "./contracts.js";
import { CLI_DOCS } from "./docs.js";
import {
  buildRubricEvaluationBrief,
  evaluateRunDirectoryDeterministically,
  validateScorecardFile,
} from "./evaluate.js";
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
import {
  answerDesktopAuthorQuestion,
  assertEmptyRunnerDirectory,
  assertExternalRunnerDirectory,
  createDesktopControl,
  desktopRunnerWrapper,
  finalizeDesktopRunner,
  preflightDesktopRunner,
} from "./runner-control.js";
import { createVariantComparison } from "@seedspec/evaluators";

const CLI_VERSION = "0.1.0-alpha.1";
const CLI_ENTRY_PATH = fileURLToPath(import.meta.url);
const EVALUATION_REPOSITORY_ROOT = resolve(dirname(CLI_ENTRY_PATH), "../../..");
const DEFAULT_DESKTOP_RUNNER_ROOT = resolve(EVALUATION_REPOSITORY_ROOT, "../..", "agent-eval-runs");
const SEEDSPEC_CLI_ENTRY = resolve(EVALUATION_REPOSITORY_ROOT, "../seedspec/packages/cli/bin/seedspec.js");
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
  .option("--variant <variant...>", "evaluation variant(s); defaults to every standard variant for the stage")
  .option("--repetitions <count>", "runs per case/model", parsePositiveInteger, 1)
  .option("--gateway <id>", "Cloudflare AI Gateway ID", "seedspec-evals")
  .option("--protocol-version <version>", "frozen SeedSpec protocol package version", "0.1.0-alpha.3")
  .option("--max-steps <count>", "maximum Think steps per turn", parsePositiveInteger, 6)
  .option("--authored-package-artifact <id>", "authored package artifact for implementation runs")
  .option("--out <file>", "plan output path")
  .action(async (options: {
    root: string;
    case?: string[];
    model: string[];
    stage: EvaluationStage;
    variant?: string[];
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
    const variants = parseVariants(options.variant, options.stage);
    const plan = await createExperimentPlan({
      cases: selected,
      stage: options.stage,
      variants,
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
      `Planned ${String(plan.envelopes.length)} model run${plan.envelopes.length === 1 ? "" : "s"} across ${String(variants.length)} evaluation variant${variants.length === 1 ? "" : "s"} in ${outPath}.\nNo model was called. Review the plan, then submit an envelope with --confirm-model-execution.`);
  });

experiment.command("inspect")
  .argument("<plan>", "experiment plan JSON")
  .action(async (file: string) => {
    const plan = ExperimentPlanSchema.parse(JSON.parse(await readFile(resolve(file), "utf8")) as unknown);
    const runs = plan.envelopes.map(({ manifest }) => ({
      runId: manifest.runId,
      caseId: manifest.case.id,
      stage: manifest.target.stage,
      variant: manifest.variant,
      model: manifest.model.modelId,
      repetition: manifest.repetition,
    }));
    output({ ok: true, planId: plan.planId, runs }, [
      `Plan ${plan.planId}:`,
      ...runs.map((run) => `- ${run.runId} — ${run.caseId} / ${run.variant} / ${run.model} / repetition ${String(run.repetition)}`),
    ].join("\n"));
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
    const outputDirectory = options.out ?? resolve(DEFAULT_DESKTOP_RUNNER_ROOT, manifest.runId);
    const brief = buildDesktopBrief(envelope, manifest, options.runner, {
      seedSpecCliEntry: SEEDSPEC_CLI_ENTRY,
    });
    const directory = resolve(outputDirectory);
    assertExternalRunnerDirectory(directory, EVALUATION_REPOSITORY_ROOT);
    await assertEmptyRunnerDirectory(directory);
    const sourceEnvelope = await createDesktopControl(envelope, manifest);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(resolve(directory, "handoff.md"), `${brief}\n`, "utf8"),
      writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      writeFile(resolve(directory, "source-envelope.json"), `${JSON.stringify(sourceEnvelope, null, 2)}\n`, "utf8"),
      writeFile(resolve(directory, "runner-control.mjs"), desktopRunnerWrapper(CLI_ENTRY_PATH), { encoding: "utf8", mode: 0o700 }),
    ]);
    output(
      { ok: true, runner: options.runner, runId: manifest.runId, sourceRunId: envelope.manifest.runId, path: directory, brief },
      options.stdout === true ? brief : `Prepared a ${options.runner} runner kit in ${directory}. Open that directory as an isolated project, then paste handoff.md into a clean agent task using the requested model.`,
    );
  });

runner.command("preflight")
  .argument("<run-directory>", "isolated desktop runner directory")
  .action(async (runDirectory: string) => {
    const result = await preflightDesktopRunner(runDirectory, EVALUATION_REPOSITORY_ROOT);
    const message = [
      result.ready ? "READY — isolated runner preflight passed." : "NOT READY — do not begin this evaluation run.",
      ...result.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} ${check.id}: ${check.message}`),
    ].join("\n");
    output({ ok: result.ready, ...result }, message);
    if (!result.ready) process.exitCode = 1;
  });

runner.command("finalize")
  .argument("<run-directory>", "completed isolated desktop runner directory")
  .action(async (runDirectory: string) => {
    const result = await finalizeDesktopRunner(runDirectory);
    output(
      { ok: true, ...result },
      [
        `Finalized observable trace ${result.traceId} at ${result.tracePath}.`,
        result.normalizedPaths.length === 0
          ? "Evidence sidecars were already in their canonical locations."
          : `Normalized misplaced evidence sidecars: ${result.normalizedPaths.join(", ")}.`,
      ].join("\n"),
    );
  });

const author = program.command("author").description("Expose pre-declared simulated author responses one question at a time.");

author.command("answer")
  .argument("<runner-source-envelope>", "runner-safe source envelope generated by runner brief")
  .requiredOption("--question <id>", "exact pre-declared question ID")
  .action(async (file: string, options: { question: string }) => {
    const response = await answerDesktopAuthorQuestion(file, options.question);
    const answered = response.answered;
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

const evaluate = program.command("evaluate").description("Score completed run evidence without changing evaluated output.");

evaluate.command("deterministic")
  .argument("<run-directory>", "completed desktop run directory")
  .option("--root <directory>", "case library root", "cases")
  .option("--seedspec-cli <file>", "frozen SeedSpec CLI entrypoint", "../seedspec/packages/cli/bin/seedspec.js")
  .action(async (runDirectory: string, options: { root: string; seedspecCli: string }) => {
    const result = await evaluateRunDirectoryDeterministically({
      runDirectory,
      caseRoot: options.root,
      seedSpecCli: options.seedspecCli,
      createdAt: new Date().toISOString(),
    });
    output({
      ok: true,
      runId: result.scorecard.runId,
      variant: result.scorecard.variant,
      score: result.scorecard.summary,
      artifactManifestPath: result.artifactManifestPath,
      scorecardPath: result.scorecardPath,
    }, `Deterministic evaluation completed for ${result.scorecard.runId} (${result.scorecard.variant}): ${String(result.scorecard.summary.earned)}/${String(result.scorecard.summary.possible)}.\nArtifacts: ${result.artifactManifestPath}\nScorecard: ${result.scorecardPath}\nNo model was called.`);
  });

evaluate.command("rubric-brief")
  .argument("<run-directory>", "completed run directory")
  .requiredOption("--runner <runner>", "codex or claude-code", parseDesktopRunner)
  .requiredOption("--judge-model <model>", "exact model identifier for the independent judge")
  .option("--root <directory>", "case library root", "cases")
  .option("--out <file>", "handoff output path")
  .option("--stdout", "print the complete evaluator brief")
  .action(async (runDirectory: string, options: { runner: DesktopRunner; judgeModel: string; root: string; out?: string; stdout?: boolean }) => {
    const result = await buildRubricEvaluationBrief({
      runDirectory,
      caseRoot: options.root,
      runner: options.runner,
      judgeModel: options.judgeModel,
      ...(options.out === undefined ? {} : { out: options.out }),
    });
    output({ ok: true, path: result.path, brief: result.brief }, options.stdout === true
      ? result.brief
      : `Prepared the independent rubric-evaluation handoff at ${result.path}. No model was called.`);
  });

evaluate.command("scorecard")
  .argument("<scorecard>", "rubric or deterministic scorecard JSON")
  .action(async (file: string) => {
    const scorecard = await validateScorecardFile(file);
    output({ ok: true, runId: scorecard.runId, variant: scorecard.variant, kind: scorecard.kind, summary: scorecard.summary },
      `Validated ${scorecard.kind} scorecard for ${scorecard.runId} (${scorecard.variant}): ${String(scorecard.summary.earned)}/${String(scorecard.summary.possible)}.`);
  });

program.command("compare")
  .description("Compare like-for-like scorecards across evaluation variants.")
  .argument("<scorecards...>", "two or more canonical scorecard JSON files")
  .option("--baseline <variant>", "baseline evaluation variant", "source-only")
  .option("--out <file>", "comparison report output path")
  .action(async (files: string[], options: { baseline: string; out?: string }) => {
    const baseline = EvaluationVariantSchema.parse(options.baseline);
    const scorecards = await Promise.all(files.map(validateScorecardFile));
    const report = createVariantComparison({ scorecards, baselineVariant: baseline, createdAt: new Date().toISOString() });
    const defaultPath = `runs/variant-comparison-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    output({ ok: true, path: outPath, report }, `Compared ${String(scorecards.length)} ${report.scorecardKind} scorecards against ${report.baseline.variant}.\nReport: ${outPath}\nNo model was called.`);
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

function parseVariants(values: string[] | undefined, stage: EvaluationStage): EvaluationVariant[] {
  const selected = values === undefined ? [...variantsForStage(stage)] : values.map((value) => EvaluationVariantSchema.parse(value));
  const invalid = selected.filter((variant) => !variantsForStage(stage).includes(variant));
  if (invalid.length > 0) throw new InvalidArgumentError(`variant does not belong to ${stage}: ${invalid.join(", ")}`);
  if (new Set(selected).size !== selected.length) throw new InvalidArgumentError("variants must be unique");
  return selected;
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
