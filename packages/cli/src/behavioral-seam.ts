import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";

import {
  BehavioralExecutionContractSchema,
  BehavioralSeamCaseSchema,
  BehavioralSeamObservationSchema,
  BehavioralSeamPlanSchema,
  contentId,
  createBehavioralSeamPlan,
  createBehavioralSeamResult,
  evaluateBehavioralArtifactAssertion,
  parseBehavioralSeamPlan,
  parseBehavioralSeamResult,
  sha256Hex,
  type BehavioralArtifactAssertion,
  type BehavioralSeamPlan,
  type BehavioralSeamResult,
  type JsonValue,
} from "@seedspec/eval-core";
import { parseDocument } from "yaml";
import { z } from "zod";

import {
  claudeModelSelector,
  parseClaudeCodeEvents,
  spawnClaudeProcessCaptured,
} from "./claude-subject-runner.js";
import { codexModelSelector } from "./profile-runner.js";
import { darwinVerificationSandboxProfile } from "./implementation-verification.js";
import {
  parseCodexSubjectEvents,
  spawnCodexProcessCaptured,
} from "./subject-runner.js";

const SuiteInputSchema = z.strictObject({
  execution: BehavioralExecutionContractSchema,
  cases: z.array(BehavioralSeamCaseSchema).min(1).max(256),
});

export async function createBehavioralSeamPlanFile(options: {
  skill: string;
  suite: string;
  models: readonly string[];
  repetitions: number;
  createdAt: string;
  caseIds?: readonly string[];
  out?: string;
}): Promise<{ plan: BehavioralSeamPlan; path: string }> {
  const skillPath = resolve(options.skill);
  const suitePath = resolve(options.suite);
  const source = await readFile(skillPath, "utf8");
  const skill = {
    id: skillName(source),
    digest: `sha256:${sha256Hex(source)}` as const,
    source,
  };
  const suite = SuiteInputSchema.parse(
    parseStructuredDocument(await readFile(suitePath, "utf8"), suitePath),
  );
  const requestedCaseIds = options.caseIds;
  if (requestedCaseIds !== undefined && new Set(requestedCaseIds).size !== requestedCaseIds.length) {
    throw new Error("Behavioral seam case selection must be unique.");
  }
  const selectedCases = requestedCaseIds === undefined
    ? suite.cases
    : requestedCaseIds.map((caseId) => {
        const seam = suite.cases.find(({ id }) => id === caseId);
        if (seam === undefined) throw new Error(`Behavioral seam case not found in suite: ${caseId}`);
        return seam;
      });
  if (selectedCases.length === 0) {
    throw new Error("Behavioral seam plan requires at least one selected case.");
  }
  const tasks = [];
  for (const requestedModel of options.models) {
    for (const seam of selectedCases) {
      for (const treatment of ["no-guidance", "skill-guidance"] as const) {
        for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
          const body = {
            skillDigest: skill.digest,
            caseId: seam.id,
            treatment,
            requestedModel,
            repetition,
          };
          tasks.push({
            taskId: contentId("behavior_task", body as unknown as JsonValue),
            ...body,
          });
        }
      }
    }
  }
  const plan = createBehavioralSeamPlan({
    schemaVersion: 2,
    createdAt: options.createdAt,
    skill,
    models: [...options.models],
    repetitions: options.repetitions,
    execution: suite.execution,
    cases: selectedCases,
    tasks,
    interpretation:
      "Behavioral seam results are low-cost screening evidence. They cannot confirm end-to-end skill quality or replace full case evaluations.",
  });
  const defaultOut = `runs/${options.createdAt.replaceAll(/[:.]/g, "-")}-behavioral-${plan.behavioralPlanId.slice(0, 27)}.json`;
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { plan, path };
}

export async function buildBehavioralSeamBrief(options: {
  plan: string;
  taskId: string;
  out: string;
}): Promise<{ plan: BehavioralSeamPlan; path: string; draftPath: string }> {
  const planPath = resolve(options.plan);
  const plan = parseBehavioralSeamPlan(
    JSON.parse(await readFile(planPath, "utf8")) as unknown,
  );
  const task = plan.tasks.find(({ taskId }) => taskId === options.taskId);
  if (task === undefined) throw new Error(`Behavioral task not found in plan: ${options.taskId}`);
  const seam = plan.cases.find(({ id }) => id === task.caseId);
  if (seam === undefined) throw new Error(`Behavioral seam case not found: ${task.caseId}`);
  const directory = resolve(options.out);
  const path = resolve(directory, "handoff.md");
  const draftPath = resolve(directory, "behavioral-observation-draft.json");
  const actionLines = seam.actions.map(({ id, description }) => `- \`${id}\`: ${description}`);
  const artifactPath = seam.artifact === undefined
    ? undefined
    : resolve(directory, seam.artifact.path);
  const artifactTemplate = seam.artifact?.template;
  const brief = [
    "# SeedSpec behavioral-seam screen",
    "",
    `Requested subject model: \`${task.requestedModel}\``,
    `Treatment: \`${task.treatment}\``,
    "",
    "This is a deliberately small behavioral screen. Respond to the scenario, record only observable choices, and do not inspect the source plan because it contains hidden expectations.",
    "",
    ...(task.treatment === "skill-guidance"
      ? [
          `Read \`guidance/${plan.skill.id}/SKILL.md\` completely before responding and set \`consultedSkill\` to true.`,
        ]
      : [
          "No skill guidance is available in this treatment. Use ordinary judgment and set `consultedSkill` to false.",
        ]),
    "",
    "## Scenario",
    "",
    seam.prompt,
    "",
    ...(actionLines.length === 0
      ? []
      : [
          "## Observable action vocabulary",
          "",
          ...actionLines,
          "",
          "Select every action you actually took or would take. Do not select actions merely because they sound desirable.",
          "",
        ]),
    ...(seam.artifact === undefined
      ? []
      : [
          "## Produced artifact",
          "",
          `Complete \`${seam.artifact.path}\` as the concrete artifact for this scenario.`,
          seam.artifact.format === "text"
            ? "Preserve its declared module interface and replace the placeholder implementation."
            : "Preserve its JSON structure and field names. Replace placeholders with explicit decisions and evidence mappings.",
          seam.artifact.instructions,
          "The evaluator will apply hidden deterministic contract checks to the relationships in this artifact.",
          "",
        ]),
    "## Finish",
    "",
    ...(seam.artifact === undefined
      ? []
      : [`Complete \`${seam.artifact.path}\` before finishing.`, ""]),
    `Separately update \`${draftPath}\` with the actions you actually selected and your concise rationale. Do not add artifact evidence or execution identity fields; the captured runner owns those fields and finalization.`,
  ].join("\n");
  const preparedAt = new Date().toISOString();
  const observation = {
    taskId: task.taskId,
    runner: { id: "codex-cli", version: "RECORD_CAPTURED_RUNNER_VERSION" },
    modelSelector: task.requestedModel,
    modelIdentityStatus: "unverified",
    startedAt: preparedAt,
    finishedAt: preparedAt,
    transcript: {
      path: "behavioral-events.jsonl",
      digest: `sha256:${"0".repeat(64)}`,
      byteLength: 1,
      eventCount: 1,
    },
    consultedSkill: task.treatment === "skill-guidance",
    selectedActionIds: [],
    rationale: "Replace with a concise account of the observed behavioral choices.",
    limitations: ["No served-model receipt has been recorded yet."],
  };
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path, `${brief}\n`, { encoding: "utf8", flag: "wx" }),
    writeFile(draftPath, `${JSON.stringify(observation, null, 2)}\n`, { encoding: "utf8", flag: "wx" }),
    ...(artifactTemplate === undefined || artifactPath === undefined
      ? []
      : [
          mkdir(dirname(artifactPath), { recursive: true }).then(() =>
            writeFile(
              artifactPath,
              formatBehavioralArtifactTemplate(
                artifactTemplate,
                seam.artifact?.format ?? "json",
              ),
              { encoding: "utf8", flag: "wx" },
            )),
        ]),
    ...(task.treatment === "skill-guidance"
      ? [writeGuidanceFile(directory, plan.skill.id, plan.skill.source)]
      : []),
  ]);
  return { plan, path, draftPath };
}

export async function finalizeBehavioralSeamResultFile(options: {
  draft: string;
  plan: string;
  createdAt: string;
  out?: string;
}): Promise<{ result: BehavioralSeamResult; path: string }> {
  const draftPath = resolve(options.draft);
  const plan = BehavioralSeamPlanSchema.parse(
    JSON.parse(await readFile(resolve(options.plan), "utf8")) as unknown,
  );
  let observation = BehavioralSeamObservationSchema.parse(
    JSON.parse(await readFile(draftPath, "utf8")) as unknown,
  );
  const transcriptPath = resolve(dirname(draftPath), observation.transcript.path);
  const transcript = await readFile(transcriptPath);
  const transcriptDigest = digestBuffer(transcript);
  if (transcriptDigest !== observation.transcript.digest
    || transcript.byteLength !== observation.transcript.byteLength) {
    throw new Error("Behavioral observation transcript does not match its captured digest and length.");
  }
  const transcriptLines = transcript.toString("utf8").split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  for (const line of transcriptLines) JSON.parse(line);
  if (transcriptLines.length !== observation.transcript.eventCount) {
    throw new Error("Behavioral observation event count does not match its JSONL transcript.");
  }
  const task = plan.tasks.find(({ taskId }) => taskId === observation.taskId);
  if (task === undefined) throw new Error("Observation task is not present in the behavioral plan.");
  const seam = plan.cases.find(({ id }) => id === task.caseId);
  if (seam === undefined) throw new Error("Behavioral plan lacks the task's seam case.");
  const actionIds = new Set(seam.actions.map(({ id }) => id));
  if (new Set(observation.selectedActionIds).size !== observation.selectedActionIds.length) {
    throw new Error("Observed action IDs must be unique.");
  }
  for (const actionId of observation.selectedActionIds) {
    if (!actionIds.has(actionId)) throw new Error(`Observation selected unknown action ${actionId}.`);
  }
  if (seam.artifact !== undefined) {
    const capturedArtifact = await captureBehavioralArtifact(
      resolve(dirname(draftPath), seam.artifact.path),
      seam.artifact.path,
      seam.artifact.format ?? "json",
    );
    if (observation.artifact !== undefined
      && JSON.stringify(observation.artifact) !== JSON.stringify(capturedArtifact)) {
      throw new Error("Behavioral artifact evidence does not match the produced artifact.");
    }
    observation = BehavioralSeamObservationSchema.parse({
      ...observation,
      artifact: capturedArtifact,
    });
  } else if (observation.artifact !== undefined) {
    throw new Error("Observation claims an artifact that its behavioral case did not request.");
  }

  const expectation = task.treatment === "skill-guidance"
    ? seam.expectations.skillGuidance
    : seam.expectations.noGuidance;
  const actionAssertions = [{
    id: "skill-consultation",
    passed: observation.consultedSkill === expectation.consultedSkill,
    expected: `consultedSkill=${String(expectation.consultedSkill)}`,
    observed: `consultedSkill=${String(observation.consultedSkill)}`,
  }, ...expectation.includeActions.map((actionId) => ({
    id: `includes-${actionId}`,
    passed: observation.selectedActionIds.includes(actionId),
    expected: `selectedActionIds includes ${actionId}`,
    observed: observation.selectedActionIds.join(", ") || "<none>",
  })), ...expectation.excludeActions.map((actionId) => ({
    id: `excludes-${actionId}`,
    passed: !observation.selectedActionIds.includes(actionId),
    expected: `selectedActionIds excludes ${actionId}`,
    observed: observation.selectedActionIds.join(", ") || "<none>",
  }))];
  let artifactAssertions: Array<{
    id: string;
    passed: boolean;
    expected: string;
    observed: string;
  }> = [];
  let qualityContracts: readonly { weight: number }[] = [];
  let qualityResults: readonly { passed: boolean }[] = [];
  if (seam.artifact?.probe !== undefined) {
    const probeResults = await runBehavioralArtifactProbe(
      dirname(draftPath),
      seam.artifact.path,
      seam.artifact.probe,
    );
    artifactAssertions = probeResults.map((result) => ({
      id: `artifact-${result.id}`,
      passed: result.passed,
      expected: result.description,
      observed: result.observed,
    }));
    qualityContracts = seam.artifact.probe.assertions;
    qualityResults = artifactAssertions;
  } else if (seam.artifact !== undefined) {
    artifactAssertions = [{
      id: "artifact-json-valid",
      passed: observation.artifact?.parseStatus === "valid",
      expected: `${seam.artifact.path} contains valid JSON`,
      observed: observation.artifact?.parseStatus ?? "<missing>",
    }, ...seam.artifact.assertions.map((assertion) => {
      const evaluated = observation.artifact?.parseStatus === "valid"
        && observation.artifact.content !== undefined
        ? evaluateBehavioralArtifactAssertion(observation.artifact.content, assertion)
        : { passed: false, observed: "<unavailable>" };
      return {
        id: `artifact-${assertion.id}`,
        passed: evaluated.passed,
        expected: `${assertion.description} (${formatArtifactExpectation(assertion)})`,
        observed: evaluated.observed,
      };
    })];
    qualityContracts = seam.artifact.assertions;
    qualityResults = artifactAssertions.slice(1);
  }
  const assertions = [...actionAssertions, ...artifactAssertions];
  const qualityScore = seam.artifact === undefined
    ? undefined
    : weightedArtifactScore(qualityContracts, qualityResults);
  const status = observation.modelIdentityStatus === "mismatch"
    ? "inconclusive" as const
    : assertions.every(({ passed }) => passed)
      ? "passed" as const
      : "failed" as const;
  const result = createBehavioralSeamResult({
    schemaVersion: 1,
    behavioralPlanId: plan.behavioralPlanId,
    createdAt: options.createdAt,
    task,
    observation,
    assertions,
    ...(qualityScore === undefined ? {} : { qualityScore }),
    status,
  });
  const defaultOut = draftPath.endsWith("-draft.json")
    ? draftPath.replace(/-draft\.json$/, ".json")
    : resolve(dirname(draftPath), "behavioral-result.json");
  const path = resolve(options.out ?? defaultOut);
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { result, path };
}

export async function runCapturedBehavioralSeam(options: {
  directory: string;
  plan: string;
  runner: "codex" | "claude-code";
  executable: string;
  reasoningEffort: string;
  maxDurationMs: number;
}): Promise<{ result: BehavioralSeamResult; path: string }> {
  const directory = resolve(options.directory);
  const planPath = resolve(options.plan);
  const plan = parseBehavioralSeamPlan(
    JSON.parse(await readFile(planPath, "utf8")) as unknown,
  );
  const draftPath = resolve(directory, "behavioral-observation-draft.json");
  const initial = JSON.parse(await readFile(draftPath, "utf8")) as { taskId?: unknown };
  if (typeof initial.taskId !== "string") {
    throw new Error("Behavioral observation draft does not identify its task.");
  }
  const task = plan.tasks.find(({ taskId }) => taskId === initial.taskId);
  if (task === undefined) throw new Error("Behavioral observation task is not present in the plan.");
  const seam = plan.cases.find(({ id }) => id === task.caseId);
  if (seam === undefined) throw new Error("Behavioral observation case is not present in the plan.");

  const eventsPath = resolve(directory, "behavioral-events.jsonl");
  const stderrPath = resolve(directory, "behavioral-stderr.log");
  const finalPath = resolve(directory, "behavioral-final.md");
  const requestedModel = task.requestedModel;
  const startedAt = new Date().toISOString();
  const prompt = [
    "Read handoff.md completely.",
    "Perform only the small behavioral screen it describes.",
    ...(seam.artifact === undefined
      ? []
      : [`Complete ${seam.artifact.path}; leaving its template placeholders unchanged is not a completed screen.`]),
    "Update behavioral-observation-draft.json with your selectedActionIds, consultedSkill, rationale, and honest limitations.",
    "Do not inspect files outside this screen directory and do not attempt to find evaluator expectations.",
  ].join(" ");

  let events: Buffer;
  let stderr: Buffer;
  let finalMessage: Buffer;
  let exitCode: number;
  let timedOut: boolean;
  let eventCount: number;
  let usage: ReturnType<typeof parseCodexSubjectEvents>["usage"]
    | ReturnType<typeof parseClaudeCodeEvents>["usage"];
  let modelSelector: string;
  let servedModel: string | undefined;
  let modelIdentityStatus: "verified" | "unverified" | "mismatch";
  let runner: { id: "codex-cli" | "claude-code-cli"; version: string };

  if (options.runner === "codex") {
    modelSelector = codexModelSelector(requestedModel);
    runner = {
      id: "codex-cli",
      version: execFileSync(options.executable, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      }).trim(),
    };
    const execution = await spawnCodexProcessCaptured(
      options.executable,
      [
        "exec",
        "--json",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--color", "never",
        "--sandbox", "workspace-write",
        "--cd", directory,
        "--model", modelSelector,
        "--config", `model_reasoning_effort=${JSON.stringify(options.reasoningEffort)}`,
        "--output-last-message", finalPath,
        prompt,
      ],
      directory,
      options.maxDurationMs,
    );
    const parsed = parseCodexSubjectEvents(execution.stdout.toString("utf8"));
    events = execution.stdout;
    stderr = execution.stderr;
    finalMessage = await readFile(finalPath).catch(() => Buffer.from("", "utf8"));
    exitCode = execution.exitCode;
    timedOut = execution.timedOut;
    eventCount = parsed.eventCount;
    usage = parsed.usage;
    modelIdentityStatus = "unverified";
  } else {
    modelSelector = claudeModelSelector(requestedModel);
    runner = {
      id: "claude-code-cli",
      version: execFileSync(options.executable, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      }).trim(),
    };
    const allowedTools = "Read,Write,Edit";
    const execution = await spawnClaudeProcessCaptured(
      options.executable,
      [
        "--print",
        prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--model", modelSelector,
        "--tools", allowedTools,
        "--allowedTools", allowedTools,
        "--permission-mode", "dontAsk",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--mcp-config", "{\"mcpServers\":{}}",
        "--no-session-persistence",
        "--disable-slash-commands",
      ],
      directory,
      options.maxDurationMs,
    );
    const parsed = parseClaudeCodeEvents(execution.stdout.toString("utf8"));
    events = Buffer.from(parsed.sanitizedJsonl, "utf8");
    stderr = execution.stderr;
    finalMessage = Buffer.from(parsed.finalMessage, "utf8");
    exitCode = execution.exitCode;
    timedOut = execution.timedOut;
    eventCount = parsed.eventCount;
    usage = parsed.usage;
    servedModel = parsed.model;
    modelIdentityStatus = servedModel === undefined
      ? "unverified"
      : servedModel === modelSelector
        ? "verified"
        : "mismatch";
  }
  const finishedAt = new Date().toISOString();
  await Promise.all([
    writeFile(eventsPath, events, { flag: "wx" }),
    writeFile(stderrPath, stderr, { flag: "wx" }),
    writeFile(finalPath, finalMessage),
  ]);
  if (events.byteLength === 0 || eventCount === 0) {
    throw new Error("Behavioral runner produced no captured provider events.");
  }

  const observed = JSON.parse(await readFile(draftPath, "utf8")) as Record<string, unknown>;
  delete observed["artifact"];
  if (seam.actions.length === 0) observed["selectedActionIds"] = [];
  const limitations = Array.isArray(observed["limitations"])
    ? observed["limitations"].map(String)
    : [];
  const artifact = seam.artifact === undefined
    ? undefined
    : await captureBehavioralArtifact(
        resolve(directory, seam.artifact.path),
        seam.artifact.path,
        seam.artifact.format ?? "json",
      );
  const observation = BehavioralSeamObservationSchema.parse({
    ...observed,
    taskId: task.taskId,
    runner,
    modelSelector,
    ...(servedModel === undefined ? { servedModel: undefined } : { servedModel }),
    modelIdentityStatus,
    startedAt,
    finishedAt,
    transcript: {
      path: "behavioral-events.jsonl",
      digest: digestBuffer(events),
      byteLength: events.byteLength,
      eventCount,
    },
    usage,
    ...(artifact === undefined ? {} : { artifact }),
    limitations: [
      ...limitations,
      ...(timedOut ? [`Runner reached the ${String(options.maxDurationMs)} ms duration limit.`] : []),
    ],
  });
  await writeFile(draftPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
  if (exitCode !== 0 || timedOut) {
    throw new Error(
      `Behavioral subject execution failed with exit code ${String(exitCode)}${timedOut ? " after timing out" : ""}. Captured evidence remains in ${directory}.`,
    );
  }
  return finalizeBehavioralSeamResultFile({
    draft: draftPath,
    plan: planPath,
    createdAt: finishedAt,
    out: resolve(directory, "behavioral-result.json"),
  });
}

export async function summarizeBehavioralSeamResults(
  files: readonly string[],
): Promise<{
  results: BehavioralSeamResult[];
  groups: Array<{
    caseId: string;
    treatment: string;
    requestedModel: string;
    n: number;
    passed: number;
    failed: number;
    inconclusive: number;
    verifiedModelIdentity: number;
    passRate: number;
    qualityScore?: {
      n: number;
      mean: number;
      median: number;
      perfect: number;
    };
    usage: {
      providerReported: number;
      totalTokens?: { sum: number; median: number };
      inputTokens?: { sum: number; median: number };
      cachedInputTokens?: { sum: number; median: number };
      outputTokens?: { sum: number; median: number };
      costUsd?: { sum: number; median: number };
    };
    durationMs: { median: number };
  }>;
  treatmentEffects: Array<{
    caseId: string;
    requestedModel: string;
    pairedN: number;
    scoreDeltaMedian: number;
    skillWins: number;
    ties: number;
    noGuidanceWins: number;
  }>;
}> {
  const loaded = await Promise.all(files.map(async (file) => {
    const path = resolve(file);
    const result = parseBehavioralSeamResult(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
    let usage = result.observation.usage;
    if (usage === undefined) {
      const transcript = await readFile(
        resolve(dirname(path), result.observation.transcript.path),
        "utf8",
      );
      usage = result.observation.runner.id === "codex-cli"
        ? parseCodexSubjectEvents(transcript).usage
        : parseClaudeCodeEvents(transcript).usage;
    }
    return { result, usage };
  }));
  const results = loaded.map(({ result }) => result);
  if (results.length === 0) throw new Error("At least one behavioral result is required.");
  if (new Set(results.map(({ behavioralPlanId }) => behavioralPlanId)).size !== 1) {
    throw new Error("Behavioral summaries require results from one immutable plan.");
  }
  const grouped = new Map<string, typeof loaded>();
  for (const entry of loaded) {
    const { result } = entry;
    const key = [
      result.task.caseId,
      result.task.treatment,
      result.task.requestedModel,
    ].join("\0");
    const entries = grouped.get(key) ?? [];
    entries.push(entry);
    grouped.set(key, entries);
  }
  const treatmentEffects = pairedArtifactEffects(results);
  return {
    results,
    groups: [...grouped].map(([key, entries]) => {
      const [caseId, treatment, requestedModel] = key.split("\0") as [string, string, string];
      const passed = entries.filter(({ result }) => result.status === "passed").length;
      const providerUsage = entries.flatMap(({ usage }) =>
        usage.capture === "provider-reported" ? [usage] : []);
      const totalTokens = providerUsage.flatMap((usage) =>
        usage.totalTokens === undefined ? [] : [usage.totalTokens]);
      const inputTokens = providerUsage.flatMap((usage) =>
        usage.inputTokens === undefined ? [] : [usage.inputTokens]);
      const cachedInputTokens = providerUsage.flatMap((usage) =>
        usage.cachedInputTokens === undefined ? [] : [usage.cachedInputTokens]);
      const outputTokens = providerUsage.flatMap((usage) =>
        usage.outputTokens === undefined ? [] : [usage.outputTokens]);
      const costs = providerUsage.flatMap((usage) =>
        usage.costUsd === undefined ? [] : [usage.costUsd]);
      const durations = entries.map(({ result }) =>
        Date.parse(result.observation.finishedAt) - Date.parse(result.observation.startedAt));
      const qualityScores = entries.flatMap(({ result }) =>
        result.qualityScore === undefined ? [] : [result.qualityScore]);
      return {
        caseId,
        treatment,
        requestedModel,
        n: entries.length,
        passed,
        failed: entries.filter(({ result }) => result.status === "failed").length,
        inconclusive: entries.filter(({ result }) => result.status === "inconclusive").length,
        verifiedModelIdentity: entries.filter(
          ({ result }) => result.observation.modelIdentityStatus === "verified",
        ).length,
        passRate: passed / entries.length,
        ...(qualityScores.length === 0
          ? {}
          : {
              qualityScore: {
                n: qualityScores.length,
                mean: qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length,
                median: numericMedian(qualityScores),
                perfect: qualityScores.filter((value) => value === 1).length,
              },
            }),
        usage: {
          providerReported: providerUsage.length,
          ...(totalTokens.length === 0
            ? {}
            : {
                totalTokens: {
                  sum: totalTokens.reduce((sum, value) => sum + value, 0),
                  median: numericMedian(totalTokens),
                },
              }),
          ...(inputTokens.length === 0
            ? {}
            : {
                inputTokens: {
                  sum: inputTokens.reduce((sum, value) => sum + value, 0),
                  median: numericMedian(inputTokens),
                },
              }),
          ...(cachedInputTokens.length === 0
            ? {}
            : {
                cachedInputTokens: {
                  sum: cachedInputTokens.reduce((sum, value) => sum + value, 0),
                  median: numericMedian(cachedInputTokens),
                },
              }),
          ...(outputTokens.length === 0
            ? {}
            : {
                outputTokens: {
                  sum: outputTokens.reduce((sum, value) => sum + value, 0),
                  median: numericMedian(outputTokens),
                },
              }),
          ...(costs.length === 0
            ? {}
            : {
                costUsd: {
                  sum: costs.reduce((sum, value) => sum + value, 0),
                  median: numericMedian(costs),
                },
              }),
        },
        durationMs: { median: numericMedian(durations) },
      };
    }).toSorted((left, right) =>
      `${left.caseId}\0${left.treatment}\0${left.requestedModel}`
        .localeCompare(`${right.caseId}\0${right.treatment}\0${right.requestedModel}`)),
    treatmentEffects,
  };
}

function pairedArtifactEffects(results: readonly BehavioralSeamResult[]): Array<{
  caseId: string;
  requestedModel: string;
  pairedN: number;
  scoreDeltaMedian: number;
  skillWins: number;
  ties: number;
  noGuidanceWins: number;
}> {
  const pairs = new Map<string, Partial<Record<"no-guidance" | "skill-guidance", number>>>();
  for (const result of results) {
    if (result.qualityScore === undefined) continue;
    const key = [
      result.task.caseId,
      result.task.requestedModel,
      String(result.task.repetition),
    ].join("\0");
    const pair = pairs.get(key) ?? {};
    pair[result.task.treatment] = result.qualityScore;
    pairs.set(key, pair);
  }
  const grouped = new Map<string, number[]>();
  for (const [key, pair] of pairs) {
    if (pair["no-guidance"] === undefined || pair["skill-guidance"] === undefined) continue;
    const [caseId, requestedModel] = key.split("\0") as [string, string];
    const groupKey = `${caseId}\0${requestedModel}`;
    const deltas = grouped.get(groupKey) ?? [];
    deltas.push(pair["skill-guidance"] - pair["no-guidance"]);
    grouped.set(groupKey, deltas);
  }
  return [...grouped].map(([key, deltas]) => {
    const [caseId, requestedModel] = key.split("\0") as [string, string];
    return {
      caseId,
      requestedModel,
      pairedN: deltas.length,
      scoreDeltaMedian: numericMedian(deltas),
      skillWins: deltas.filter((delta) => delta > 0).length,
      ties: deltas.filter((delta) => delta === 0).length,
      noGuidanceWins: deltas.filter((delta) => delta < 0).length,
    };
  }).toSorted((left, right) =>
    `${left.caseId}\0${left.requestedModel}`
      .localeCompare(`${right.caseId}\0${right.requestedModel}`));
}

function numericMedian(values: readonly number[]): number {
  const sorted = [...values].toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

async function captureBehavioralArtifact(
  path: string,
  relativePath: string,
  format: "json" | "text",
): Promise<{
  path: string;
  digest: `sha256:${string}`;
  byteLength: number;
  parseStatus: "valid" | "invalid";
  content?: JsonValue;
}> {
  const bytes = await readFile(path).catch(() => Buffer.from("", "utf8"));
  if (format === "text") {
    return {
      path: relativePath,
      digest: digestBuffer(bytes),
      byteLength: bytes.byteLength,
      parseStatus: "valid",
      content: bytes.toString("utf8"),
    };
  }
  try {
    const content = JSON.parse(bytes.toString("utf8")) as JsonValue;
    return {
      path: relativePath,
      digest: digestBuffer(bytes),
      byteLength: bytes.byteLength,
      parseStatus: "valid",
      content,
    };
  } catch {
    return {
      path: relativePath,
      digest: digestBuffer(bytes),
      byteLength: bytes.byteLength,
      parseStatus: "invalid",
    };
  }
}

function weightedArtifactScore(
  contracts: readonly { weight: number }[],
  results: readonly { passed: boolean }[],
): number {
  const availableWeight = contracts.reduce((sum, assertion) => sum + assertion.weight, 0);
  const passedWeight = contracts.reduce(
    (sum, assertion, index) => sum + (results[index]?.passed === true ? assertion.weight : 0),
    0,
  );
  return passedWeight / availableWeight;
}

function formatBehavioralArtifactTemplate(
  template: unknown,
  format: "json" | "text",
): string {
  if (format === "text") {
    if (typeof template !== "string") {
      throw new Error("Text behavioral artifact templates must be strings.");
    }
    return template.endsWith("\n") ? template : `${template}\n`;
  }
  return `${JSON.stringify(template, null, 2)}\n`;
}

export async function runBehavioralArtifactProbe(
  sourceDirectory: string,
  artifactPath: string,
  probe: {
    source: string;
    timeoutMs: number;
    assertions: readonly {
      id: string;
      description: string;
      weight: number;
    }[];
  },
): Promise<Array<{
  id: string;
  description: string;
  passed: boolean;
  observed: string;
}>> {
  if (process.platform !== "darwin") {
    throw new Error(
      "Executable behavioral artifact probes require the macOS verification sandbox.",
    );
  }
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "seedspec-behavioral-probe-"));
  const targetArtifact = resolve(temporaryRoot, artifactPath);
  const evaluatorPath = resolve(temporaryRoot, "__behavioral-probe.mjs");
  try {
    await mkdir(dirname(targetArtifact), { recursive: true });
    await cp(resolve(sourceDirectory, artifactPath), targetArtifact);
    await writeFile(evaluatorPath, probe.source, "utf8");
    let stdout = "";
    try {
      stdout = execFileSync(
        "/usr/bin/sandbox-exec",
        [
          "-p",
          darwinVerificationSandboxProfile(temporaryRoot),
          process.execPath,
          evaluatorPath,
        ],
        {
          cwd: temporaryRoot,
          encoding: "utf8",
          timeout: probe.timeoutMs,
          maxBuffer: 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            PATH: process.env["PATH"] ?? "",
            LANG: "C.UTF-8",
            HOME: temporaryRoot,
            TMPDIR: temporaryRoot,
            CI: "1",
          },
        },
      );
    } catch (error) {
      const observed = artifactProbeFailure(error);
      return probe.assertions.map((assertion) => ({
        id: assertion.id,
        description: assertion.description,
        passed: false,
        observed,
      }));
    }
    const output = z.strictObject({
      assertions: z.array(z.strictObject({
        id: z.string(),
        passed: z.boolean(),
        observed: z.string().max(4_000),
      })).max(256),
    }).parse(JSON.parse(stdout) as unknown);
    const byId = new Map(output.assertions.map((assertion) => [assertion.id, assertion]));
    if (byId.size !== probe.assertions.length
      || probe.assertions.some(({ id }) => !byId.has(id))) {
      throw new Error("Behavioral artifact probe output does not match its declared assertion IDs.");
    }
    return probe.assertions.map((assertion) => {
      const observed = byId.get(assertion.id)!;
      return {
        id: assertion.id,
        description: assertion.description,
        passed: observed.passed,
        observed: observed.observed,
      };
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function artifactProbeFailure(error: unknown): string {
  if (typeof error !== "object" || error === null) return `probe failed: ${String(error)}`;
  const record = error as {
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  const detail = [record.stderr, record.stdout, record.message]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return `probe failed: ${(detail ?? "unknown execution failure").slice(0, 3_980)}`;
}

function formatArtifactExpectation(assertion: BehavioralArtifactAssertion): string {
  const expected = assertion.expected === undefined
    ? ""
    : ` ${JSON.stringify(assertion.expected)}`;
  return `${assertion.pointer || "<root>"} ${assertion.operator}${expected}`;
}

async function writeGuidanceFile(directory: string, skillId: string, source: string): Promise<void> {
  const path = resolve(directory, "guidance", skillId, "SKILL.md");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, { encoding: "utf8", flag: "wx" });
}

function skillName(source: string): string {
  const match = /^---\s*\n[\s\S]*?^name:\s*([a-z0-9-]+)\s*$[\s\S]*?^---\s*$/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error("Behavioral seam skill must declare a lowercase hyphenated frontmatter name.");
  }
  return match[1];
}

function digestBuffer(value: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseStructuredDocument(source: string, path: string): unknown {
  if (extname(path).toLowerCase() === ".json") return JSON.parse(source) as unknown;
  const document = parseDocument(source, {
    prettyErrors: true,
    schema: "core",
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map(({ message }) => message).join("; "));
  }
  return document.toJS({ maxAliasCount: 0 }) as unknown;
}
