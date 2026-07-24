#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCaseFile, loadCaseLibrary } from "@seedspec/eval-case-library";
import {
  EvaluationVariantSchema,
  RunIdSchema,
  TraceBodySchema,
  calculateContractGateSummary,
  createTrace,
  parseTrace,
  sha256Hex,
  variantsForStage,
  type EvaluationStage,
  type EvaluationVariant,
} from "@seedspec/eval-core";
import { SubmissionIdSchema } from "@seedspec/eval-harness";
import { Command, InvalidArgumentError } from "commander";

import { ExecutionEnvelopeSchema, ExperimentPlanSchema, type ExecutionEnvelope } from "./contracts.js";
import {
  bundleAuthoredInput,
  bundleGuidanceInput,
  materializeAuthoredInput,
} from "./authored-input.js";
import { CLI_DOCS } from "./docs.js";
import { DEFAULT_MAX_DURATION_MS, parseDurationMs } from "./duration.js";
import {
  buildRubricEvaluationBrief,
  evaluateRunDirectoryDeterministically,
  validateScorecardFile,
} from "./evaluate.js";
import { verifyImplementationRun } from "./implementation-verification.js";
import {
  buildPackageProfileBrief,
  buildRunProfileBrief,
  compareEvaluationProfileFiles,
  finalizeDecisionLedgerFile,
  finalizeEvaluationProfileFile,
  formatEvaluationProfile,
  validateEvaluationProfileFile,
  validateDecisionLedgerFile,
} from "./profile.js";
import { createExperimentPlan } from "./plan.js";
import { createSkillExperimentPlan, SKILL_TREATMENTS } from "./skill-plan.js";
import {
  createImplementationSkillExperimentPlan,
  IMPLEMENTATION_SKILL_TREATMENTS,
  type ImplementationSkillAdapter,
  type ImplementationSkillTreatment,
} from "./implementation-skill-plan.js";
import { runCodexProfileEvaluator } from "./profile-runner.js";
import { runCodexSubject } from "./subject-runner.js";
import { runClaudeSubject } from "./claude-subject-runner.js";
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

const CLI_VERSION = "0.2.0";
const CLI_ENTRY_PATH = fileURLToPath(import.meta.url);
const EVALUATION_REPOSITORY_ROOT = resolve(dirname(CLI_ENTRY_PATH), "../../..");
const DEFAULT_DESKTOP_RUNNER_ROOT = resolve(EVALUATION_REPOSITORY_ROOT, "../..", "agent-eval-runs");
const SEEDSPEC_CLI_ENTRY = resolve(EVALUATION_REPOSITORY_ROOT, "../seedspec/packages/cli/bin/seedspec.js");
const SHAPE_SOLUTION_INTENT_SKILL = resolve(EVALUATION_REPOSITORY_ROOT, "../seedspec/skills/shape-solution-intent/SKILL.md");
const IMPLEMENT_STATEFUL_WORKFLOWS_SKILL = resolve(
  EVALUATION_REPOSITORY_ROOT,
  "skills/implement-stateful-workflows/SKILL.md",
);
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
  .option("--protocol-version <version>", "frozen SeedSpec protocol package version", "0.2.0")
  .option("--max-steps <count>", "maximum Think steps per turn", parsePositiveInteger, 6)
  .option("--max-duration <duration>", "maximum wall-clock time per run (for example 30m or 1h)", parseDurationMs, DEFAULT_MAX_DURATION_MS)
  .option("--authored-input <directory>", "authored workspace to content-address and deliver to implementation runners")
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
    maxDuration: number;
    authoredInput?: string;
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
    const authoredInput = options.authoredInput === undefined
      ? undefined
      : await bundleAuthoredInput(options.authoredInput);
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
      maxDurationMs: options.maxDuration,
      ...(authoredInput === undefined
        ? {}
        : { authoredInput }),
    });
    const defaultPath = `runs/${createdAt.replaceAll(/[:.]/g, "-")}-${plan.planId.slice(0, 17)}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    output({ ok: true, planId: plan.planId, runs: plan.envelopes.length, path: outPath },
      `Planned ${String(plan.envelopes.length)} model run${plan.envelopes.length === 1 ? "" : "s"} across ${String(variants.length)} evaluation variant${variants.length === 1 ? "" : "s"} in ${outPath}.\nNo model was called. Review the plan, then submit an envelope with --confirm-model-execution.`);
  });

experiment.command("skill-plan")
  .description("Create a controlled same-output authoring-skill treatment matrix.")
  .option("--root <directory>", "case library root", "cases")
  .option("--case <id...>", "case IDs to include", ["sparse-neighborhood-tool-lending"])
  .requiredOption("--model <model...>", "AI Gateway model slug(s)")
  .option("--repetitions <count>", "runs per case/model/treatment", parsePositiveInteger, 1)
  .option("--gateway <id>", "Cloudflare AI Gateway ID", "seedspec-evals")
  .option("--protocol-version <version>", "frozen SeedSpec protocol package version", "0.2.0")
  .option("--max-steps <count>", "maximum Think steps per turn", parsePositiveInteger, 8)
  .option("--max-duration <duration>", "maximum wall-clock time per run (for example 30m or 1h)", parseDurationMs, DEFAULT_MAX_DURATION_MS)
  .option("--skill <file>", "package-scoped SKILL.md to deliver in controlled treatments", SHAPE_SOLUTION_INTENT_SKILL)
  .option("--out <file>", "plan output path")
  .action(async (options: {
    root: string;
    case: string[];
    model: string[];
    repetitions: number;
    gateway: string;
    protocolVersion: string;
    maxSteps: number;
    maxDuration: number;
    skill: string;
    out?: string;
  }) => {
    const allCases = await loadCaseLibrary(resolve(options.root));
    const selected = allCases.filter((entry) => options.case.includes(entry.case.id));
    const missing = options.case.filter((id) => !selected.some((entry) => entry.case.id === id));
    if (missing.length > 0) throw new Error(`Unknown case IDs: ${missing.join(", ")}`);
    const createdAt = new Date().toISOString();
    const plan = await createSkillExperimentPlan({
      cases: selected,
      models: options.model,
      repetitions: options.repetitions,
      gatewayId: options.gateway,
      protocolVersion: options.protocolVersion,
      createdAt,
      maxSteps: options.maxSteps,
      maxDurationMs: options.maxDuration,
      skillPath: resolve(options.skill),
    });
    const defaultPath = `runs/${createdAt.replaceAll(/[:.]/g, "-")}-skill-${plan.planId.slice(0, 17)}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    output({ ok: true, planId: plan.planId, runs: plan.envelopes.length, treatments: SKILL_TREATMENTS, path: outPath },
      `Planned ${String(plan.envelopes.length)} controlled authoring-skill runs across ${String(SKILL_TREATMENTS.length)} same-output treatments in ${outPath}.\nNo model was called. Generate isolated runner kits before execution.`);
  });

experiment.command("implementation-skill-plan")
  .description("Create a controlled same-package implementation-skill treatment matrix.")
  .option("--root <directory>", "case library root", "cases")
  .option("--case <id...>", "case IDs to include", ["sparse-neighborhood-tool-lending"])
  .requiredOption("--model <model...>", "AI Gateway model slug(s)")
  .requiredOption("--authored-input <directory>", "completed authored package to freeze for every implementation treatment")
  .option("--repetitions <count>", "runs per case/model/treatment", parsePositiveInteger, 1)
  .option("--gateway <id>", "Cloudflare AI Gateway ID", "seedspec-evals")
  .option("--protocol-version <version>", "frozen SeedSpec protocol package version", "0.2.0")
  .option("--max-steps <count>", "maximum Think steps per turn", parsePositiveInteger, 8)
  .option("--max-duration <duration>", "maximum wall-clock time per run (for example 30m or 1h)", parseDurationMs, DEFAULT_MAX_DURATION_MS)
  .option("--skill <file>", "package-scoped implementation SKILL.md to deliver in the controlled treatment", IMPLEMENT_STATEFUL_WORKFLOWS_SKILL)
  .option("--treatment <id...>", "treatments to plan: no-guidance, embedded-guidance, or skill-guidance")
  .option("--skill-treatment-id <id>", "comparison label for the skill-guidance arm", "skill-guidance")
  .option(
    "--skill-adapter <adapter>",
    "none, gstack-plan-eng-review, gstack-engineering-suite, or compound-engineering-core-loop",
    parseImplementationSkillAdapter,
    "none",
  )
  .option("--skill-source-repository <url>", "upstream repository recorded in the immutable manifest")
  .option("--skill-source-revision <revision>", "upstream commit recorded in the immutable manifest")
  .option("--skill-license <license>", "upstream license identifier recorded in the immutable manifest")
  .option("--out <file>", "plan output path")
  .action(async (options: {
    root: string;
    case: string[];
    model: string[];
    authoredInput: string;
    repetitions: number;
    gateway: string;
    protocolVersion: string;
    maxSteps: number;
    maxDuration: number;
    skill: string;
    treatment?: string[];
    skillTreatmentId: string;
    skillAdapter: ImplementationSkillAdapter;
    skillSourceRepository?: string;
    skillSourceRevision?: string;
    skillLicense?: string;
    out?: string;
  }) => {
    const allCases = await loadCaseLibrary(resolve(options.root));
    const selected = allCases.filter((entry) => options.case.includes(entry.case.id));
    const missing = options.case.filter((id) => !selected.some((entry) => entry.case.id === id));
    if (missing.length > 0) throw new Error(`Unknown case IDs: ${missing.join(", ")}`);
    const createdAt = new Date().toISOString();
    const authoredInput = await bundleAuthoredInput(options.authoredInput);
    const skillPath = resolve(options.skill);
    const skillSource = await readFile(skillPath, "utf8");
    const skillId = skillNameFromSource(skillSource);
    const guidanceInput = await bundleGuidanceInput(dirname(skillPath), skillId);
    const treatments = parseImplementationSkillTreatments(options.treatment);
    const plan = await createImplementationSkillExperimentPlan({
      cases: selected,
      models: options.model,
      repetitions: options.repetitions,
      gatewayId: options.gateway,
      protocolVersion: options.protocolVersion,
      createdAt,
      maxSteps: options.maxSteps,
      maxDurationMs: options.maxDuration,
      skillPath,
      guidanceInput,
      authoredInput,
      treatments,
      skillTreatmentId: options.skillTreatmentId,
      skillAdapter: options.skillAdapter,
      ...(options.skillSourceRepository === undefined
        ? {}
        : { skillSourceRepository: options.skillSourceRepository }),
      ...(options.skillSourceRevision === undefined
        ? {}
        : { skillSourceRevision: options.skillSourceRevision }),
      ...(options.skillLicense === undefined ? {} : { skillLicense: options.skillLicense }),
    });
    const defaultPath = `runs/${createdAt.replaceAll(/[:.]/g, "-")}-implementation-skill-${plan.planId.slice(0, 17)}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    output(
      {
        ok: true,
        planId: plan.planId,
        runs: plan.envelopes.length,
        treatments: plan.envelopes.map(({ manifest }) => manifest.configuration?.["treatmentId"]),
        authoredInputArtifactId: authoredInput.artifactId,
        guidanceInputArtifactId: guidanceInput.artifactId,
        path: outPath,
      },
      `Planned ${String(plan.envelopes.length)} controlled implementation-skill runs against one frozen authored package across ${String(treatments.length)} treatment${treatments.length === 1 ? "" : "s"} in ${outPath}.\nNo model was called. Generate isolated runner kits before execution.`,
    );
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
      treatment: typeof manifest.configuration?.["treatmentId"] === "string"
        ? manifest.configuration["treatmentId"]
        : undefined,
    }));
    output({ ok: true, planId: plan.planId, runs }, [
      `Plan ${plan.planId}:`,
      ...runs.map((run) => `- ${run.runId} — ${run.caseId} / ${run.treatment ?? run.variant} / ${run.model} / repetition ${String(run.repetition)}`),
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
    await materializeSkillExperimentGuidance(envelope, directory);
    if (envelope.submission.config.authoredInput !== undefined) {
      await materializeAuthoredInput(envelope.submission.config.authoredInput, resolve(directory, "input", "authored"), { readOnly: true });
    }
    if (envelope.submission.config.guidanceInput !== undefined) {
      await materializeAuthoredInput(envelope.submission.config.guidanceInput, resolve(directory, "guidance"), { readOnly: true });
    }
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

runner.command("codex-run")
  .description("Run and capture one isolated Codex subject from a prepared runner kit.")
  .argument("<run-directory>", "isolated Codex runner directory")
  .option("--codex <file>", "Codex CLI executable", "codex")
  .option("--reasoning-effort <effort>", "Codex reasoning effort", "high")
  .option("--confirm-model-execution", "explicitly authorize the subject model call")
  .action(async (runDirectory: string, options: {
    codex: string;
    reasoningEffort: string;
    confirmModelExecution?: boolean;
  }) => {
    if (options.confirmModelExecution !== true) {
      throw new Error("Subject model execution was not started. Review the runner handoff, then re-run with --confirm-model-execution.");
    }
    const result = await runCodexSubject({
      runDirectory,
      evaluationRepositoryRoot: EVALUATION_REPOSITORY_ROOT,
      codexExecutable: options.codex,
      reasoningEffort: options.reasoningEffort,
    });
    if (result.run.status !== "succeeded") {
      throw new Error(`Captured subject run ${result.run.subjectRunId} failed. Evidence: ${result.path}`);
    }
    output({
      ok: true,
      subjectRunId: result.run.subjectRunId,
      runId: result.run.runId,
      traceId: result.run.trace?.traceId,
      path: result.path,
    }, `Captured subject run ${result.run.subjectRunId}.\nTrace: ${result.run.trace?.traceId ?? "unavailable"}\nSubject evidence: ${result.path}`);
  });

runner.command("claude-run")
  .description("Run and capture one isolated Claude Code subject from a prepared runner kit.")
  .argument("<run-directory>", "isolated Claude Code runner directory")
  .option("--claude <file>", "Claude Code CLI executable", "claude")
  .option("--confirm-model-execution", "explicitly authorize the subject model call")
  .action(async (runDirectory: string, options: {
    claude: string;
    confirmModelExecution?: boolean;
  }) => {
    if (options.confirmModelExecution !== true) {
      throw new Error("Subject model execution was not started. Review the runner handoff, then re-run with --confirm-model-execution.");
    }
    const result = await runClaudeSubject({
      runDirectory,
      evaluationRepositoryRoot: EVALUATION_REPOSITORY_ROOT,
      claudeExecutable: options.claude,
    });
    if (result.run.status !== "succeeded") {
      throw new Error(`Captured subject run ${result.run.subjectRunId} failed. Evidence: ${result.path}`);
    }
    output({
      ok: true,
      subjectRunId: result.run.subjectRunId,
      runId: result.run.runId,
      traceId: result.run.trace?.traceId,
      path: result.path,
    }, `Captured subject run ${result.run.subjectRunId}.\nTrace: ${result.run.trace?.traceId ?? "unavailable"}\nSubject evidence: ${result.path}`);
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

const decisionLedger = program.command("decision-ledger")
  .description("Finalize and validate observable implementation decision ledgers.");

decisionLedger.command("finalize")
  .argument("<draft>", "decision ledger body JSON without ledgerId")
  .option("--out <file>", "final content-addressed ledger output")
  .action(async (draft: string, options: { out?: string }) => {
    const result = await finalizeDecisionLedgerFile({
      draft,
      ...(options.out === undefined ? {} : { out: options.out }),
    });
    output({ ok: true, ledgerId: result.ledger.ledgerId, runId: result.ledger.runId, path: result.path },
      `Finalized observable decision ledger ${result.ledger.ledgerId} with ${String(result.ledger.entries.length)} entries at ${result.path}.`);
  });

decisionLedger.command("validate")
  .argument("<ledger>", "final content-addressed decision ledger JSON")
  .action(async (file: string) => {
    const ledger = await validateDecisionLedgerFile(file);
    output({ ok: true, ledgerId: ledger.ledgerId, runId: ledger.runId, entries: ledger.entries.length },
      `Validated decision ledger ${ledger.ledgerId}: ${String(ledger.entries.length)} observable material decision record${ledger.entries.length === 1 ? "" : "s"}.`);
  });

const implementation = program.command("implementation")
  .description("Verify implementation evidence without changing the realization.");

implementation.command("verify")
  .argument("<run-directory>", "completed isolated implementation run directory")
  .option("--confirm-code-execution", "authorize execution of the realization's declared local verification commands")
  .option("--allow-unsandboxed", "allow execution only when an external disposable sandbox is already in place")
  .action(async (runDirectory: string, options: {
    confirmCodeExecution?: boolean;
    allowUnsandboxed?: boolean;
  }) => {
    if (options.confirmCodeExecution !== true) {
      throw new Error(
        "Implementation code was not executed. Review the declared local verification commands, "
        + "then re-run with --confirm-code-execution.",
      );
    }
    const result = await verifyImplementationRun({
      runDirectory,
      createdAt: new Date().toISOString(),
      allowUnsandboxed: options.allowUnsandboxed === true,
    });
    output(
      {
        ok: true,
        runId: result.verification.runId,
        verificationId: result.verification.verificationId,
        commands: result.verification.commands,
        path: result.path,
      },
      [
        `Executed ${String(result.verification.commands.length)} declared local verification command${result.verification.commands.length === 1 ? "" : "s"}.`,
        ...result.verification.commands.map((command) =>
          `- ${command.id}: ${command.outcome}${command.exitCode === null ? "" : ` (exit ${String(command.exitCode)})`}`),
        `Evidence: ${result.path}`,
      ].join("\n"),
    );
  });

const evaluate = program.command("evaluate").description("Profile or score completed evidence without changing evaluated output.");

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
      assessmentScope: result.scorecard.assessmentScope,
      contractGate: result.scorecard.gate,
      artifactManifestPath: result.artifactManifestPath,
      scorecardPath: result.scorecardPath,
    }, `Contract/integrity gate ${result.scorecard.gate?.status ?? "incomplete"} for ${result.scorecard.runId} (${result.scorecard.variant}): ${String(result.scorecard.gate?.passed ?? 0)} passed, ${String(result.scorecard.gate?.failed ?? 0)} failed, ${String(result.scorecard.gate?.unevaluated ?? 0)} unevaluated.\nThis is not an implementation-quality score.\nArtifacts: ${result.artifactManifestPath}\nContract evidence: ${result.scorecardPath}\nNo model was called.`);
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
      evaluationRepositoryRoot: EVALUATION_REPOSITORY_ROOT,
      evaluationCliEntry: CLI_ENTRY_PATH,
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
    if (scorecard.kind === "deterministic") {
      const gate = scorecard.gate ?? calculateContractGateSummary(scorecard.checks);
      output({
        ok: true,
        runId: scorecard.runId,
        variant: scorecard.variant,
        kind: scorecard.kind,
        assessmentScope: scorecard.assessmentScope,
        contractGate: gate,
      }, `Validated contract/integrity evidence for ${scorecard.runId} (${scorecard.variant}): ${gate.status}; ${String(gate.passed)} passed, ${String(gate.failed)} failed, ${String(gate.unevaluated)} unevaluated.\nThis is not an implementation-quality score.`);
      return;
    }
    output({ ok: true, runId: scorecard.runId, variant: scorecard.variant, kind: scorecard.kind, summary: scorecard.summary },
      `Validated rubric scorecard for ${scorecard.runId} (${scorecard.variant}): ${String(scorecard.summary.earned)}/${String(scorecard.summary.possible)}.`);
  });

evaluate.command("package-profile-brief")
  .argument("<package-path>", "SeedSpec package to profile without changing it")
  .requiredOption("--runner <runner>", "codex or claude-code", parseDesktopRunner)
  .requiredOption("--judge-model <model>", "exact evaluator model identifier")
  .option("--seedspec-cli <file>", "frozen SeedSpec CLI entrypoint", "../seedspec/packages/cli/bin/seedspec.js")
  .option("--out <file>", "handoff output path outside the package")
  .option("--stdout", "print the complete evaluator brief")
  .action(async (packagePath: string, options: {
    runner: DesktopRunner;
    judgeModel: string;
    seedspecCli: string;
    out?: string;
    stdout?: boolean;
  }) => {
    const result = await buildPackageProfileBrief({
      packagePath,
      runner: options.runner,
      judgeModel: options.judgeModel,
      seedSpecCli: options.seedspecCli,
      evaluationRepositoryRoot: EVALUATION_REPOSITORY_ROOT,
      evaluationCliEntry: CLI_ENTRY_PATH,
      ...(options.out === undefined ? {} : { out: options.out }),
    });
    output({ ok: true, ...result }, options.stdout === true
      ? result.brief
      : `Prepared a read-only package profiling handoff at ${result.path}. The subject identity is ${result.subjectPath}. No model was called.`);
  });

evaluate.command("profile-brief")
  .argument("<run-directory>", "completed run directory")
  .requiredOption("--runner <runner>", "codex or claude-code", parseDesktopRunner)
  .requiredOption("--judge-model <model>", "exact evaluator model identifier")
  .option("--reasoning-effort <effort>", "requested evaluator reasoning effort", "high")
  .option("--root <directory>", "case library root", "cases")
  .option("--seedspec-cli <file>", "frozen SeedSpec CLI entrypoint", "../seedspec/packages/cli/bin/seedspec.js")
  .option("--out <file>", "handoff output path")
  .option("--stdout", "print the complete evaluator brief")
  .action(async (runDirectory: string, options: {
    runner: DesktopRunner;
    judgeModel: string;
    reasoningEffort: string;
    root: string;
    seedspecCli: string;
    out?: string;
    stdout?: boolean;
  }) => {
    const result = await buildRunProfileBrief({
      runDirectory,
      runner: options.runner,
      judgeModel: options.judgeModel,
      reasoningEffort: options.reasoningEffort,
      evaluationRepositoryRoot: EVALUATION_REPOSITORY_ROOT,
      evaluationCliEntry: CLI_ENTRY_PATH,
      caseRoot: options.root,
      seedSpecCli: options.seedspecCli,
      ...(options.out === undefined ? {} : { out: options.out }),
    });
    output({ ok: true, ...result }, options.stdout === true
      ? result.brief
      : `Prepared a descriptive run-profiling handoff at ${result.path}. No model was called.`);
  });

evaluate.command("profile-finalize")
  .argument("<draft>", "evaluation profile body JSON without profileId")
  .option("--out <file>", "final content-addressed profile output")
  .option("--evidence <file>", "content-addressed profile evidence envelope")
  .action(async (draft: string, options: { out?: string; evidence?: string }) => {
    const result = await finalizeEvaluationProfileFile({
      draft,
      ...(options.out === undefined ? {} : { out: options.out }),
      ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
    });
    output({ ok: true, profileId: result.profile.profileId, path: result.path },
      `Finalized descriptive evaluation profile ${result.profile.profileId} at ${result.path}.`);
  });

evaluate.command("profile")
  .argument("<profile>", "final content-addressed evaluation profile JSON")
  .action(async (file: string) => {
    const profile = await validateEvaluationProfileFile(file);
    output({ ok: true, profileId: profile.profileId, summary: profile.summary }, formatEvaluationProfile(profile));
  });

evaluate.command("profile-compare")
  .description("Compare descriptive profiles over their case's shared axes without scoring them.")
  .argument("<profiles...>", "two or more finalized evaluation profile JSON files")
  .option("--root <directory>", "case library root", "cases")
  .option("--out <file>", "content-addressed comparison JSON output")
  .action(async (files: string[], options: { root: string; out?: string }) => {
    const result = await compareEvaluationProfileFiles({
      files,
      caseRoot: options.root,
      createdAt: new Date().toISOString(),
      ...(options.out === undefined ? {} : { out: options.out }),
    });
    output({
      ok: true,
      comparisonId: result.comparison.comparisonId,
      path: result.path,
      markdownPath: result.markdownPath,
    }, `Compared ${String(files.length)} profiles over shared case axes.\nJSON: ${result.path}\nReadable report: ${result.markdownPath}\nNo aggregate score or winner was produced.`);
  });

evaluate.command("profile-run")
  .description("Run and capture a Codex profile evaluator from a prepared compact handoff.")
  .argument("<run-directory>", "completed subject run containing profile-evidence.json and its handoff")
  .option("--codex <file>", "Codex CLI executable", "codex")
  .option("--confirm-model-execution", "explicitly authorize the evaluator model call")
  .action(async (runDirectory: string, options: { codex: string; confirmModelExecution?: boolean }) => {
    if (options.confirmModelExecution !== true) {
      throw new Error("Evaluator model execution was not started. Review the profile handoff, then re-run with --confirm-model-execution.");
    }
    const result = await runCodexProfileEvaluator({ runDirectory, codexExecutable: options.codex });
    if (result.run.status !== "succeeded") {
      throw new Error(`Captured evaluator run ${result.run.evaluatorRunId} failed. Evidence: ${result.path}`);
    }
    output({ ok: true, evaluatorRunId: result.run.evaluatorRunId, profileId: result.run.profileId, path: result.path },
      `Captured evaluator run ${result.run.evaluatorRunId}.\nProfile: ${result.run.profileId ?? "unavailable"}\nEvaluator evidence: ${result.path}`);
  });

program.command("compare")
  .description("Compare like-for-like scorecards across evaluation variants.")
  .argument("<scorecards...>", "two or more canonical scorecard JSON files")
  .option("--baseline <variant>", "baseline evaluation variant", "raw-source")
  .option("--out <file>", "comparison report output path")
  .action(async (files: string[], options: { baseline: string; out?: string }) => {
    const baseline = EvaluationVariantSchema.parse(options.baseline);
    const scorecards = await Promise.all(files.map(validateScorecardFile));
    if (scorecards.some(({ kind }) => kind === "deterministic")) {
      throw new Error(
        "Contract/integrity gates cannot be ranked by weighted totals. Compare technical quality profiles or a predeclared independent rubric instead.",
      );
    }
    const report = createVariantComparison({ scorecards, baselineVariant: baseline, createdAt: new Date().toISOString() });
    const defaultPath = `runs/variant-comparison-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`;
    const outPath = resolve(options.out ?? defaultPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    output({ ok: true, path: outPath, report }, `Compared ${String(scorecards.length)} ${report.scorecardKind} scorecards against ${report.baseline.variant}.\nReport: ${outPath}\nNo model was called.`);
  });

program.command("docs")
  .argument("[topic]", "architecture, lifecycle, labs, profiles, cli, or safety", "cli")
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

function parseImplementationSkillTreatments(
  values: string[] | undefined,
): ImplementationSkillTreatment[] {
  const selected = values ?? [...IMPLEMENTATION_SKILL_TREATMENTS];
  const allowed = new Set<string>(IMPLEMENTATION_SKILL_TREATMENTS);
  const invalid = selected.filter((value) => !allowed.has(value));
  if (invalid.length > 0) {
    throw new InvalidArgumentError(`unknown implementation-skill treatment: ${invalid.join(", ")}`);
  }
  if (new Set(selected).size !== selected.length) {
    throw new InvalidArgumentError("implementation-skill treatments must be unique");
  }
  return selected as ImplementationSkillTreatment[];
}

function parseImplementationSkillAdapter(value: string): ImplementationSkillAdapter {
  if (
    value !== "none"
    && value !== "gstack-plan-eng-review"
    && value !== "gstack-engineering-suite"
    && value !== "compound-engineering-core-loop"
  ) {
    throw new InvalidArgumentError(
      "must be none, gstack-plan-eng-review, gstack-engineering-suite, or compound-engineering-core-loop",
    );
  }
  return value;
}

function skillNameFromSource(source: string): string {
  const match = /^---\s*\n[\s\S]*?^name:\s*([a-z0-9-]+)\s*$[\s\S]*?^---\s*$/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("Implementation-skill input must declare a lowercase hyphenated frontmatter name.");
  }
  return match[1];
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

async function materializeSkillExperimentGuidance(
  envelope: ExecutionEnvelope,
  directory: string,
): Promise<void> {
  if (envelope.submission.config.guidanceInput !== undefined) return;
  const treatment = envelope.manifest.configuration?.["treatmentId"];
  if (treatment !== "skill-guidance" && treatment !== "skill-and-audit") return;
  const expectedDigest = envelope.manifest.configuration?.["skillDigest"];
  const selectedSkillId = envelope.manifest.configuration?.["skillId"];
  const source = envelope.submission.metadata?.["skillSource"];
  if (typeof selectedSkillId !== "string" || !/^[a-z0-9-]+$/.test(selectedSkillId)) {
    throw new Error("Skill forward-test guidance has an invalid skill ID.");
  }
  if (typeof source !== "string") {
    throw new Error("Skill forward-test plan does not contain its content-addressed skill source.");
  }
  const actualDigest = `sha256:${sha256Hex(source)}`;
  if (typeof expectedDigest !== "string" || expectedDigest !== actualDigest) {
    throw new Error(`Skill forward-test guidance digest mismatch: expected ${typeof expectedDigest === "string" ? expectedDigest : "<invalid>"}, found ${actualDigest}.`);
  }
  const target = resolve(directory, "guidance", selectedSkillId, "SKILL.md");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, { encoding: "utf8", flag: "wx" });
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
