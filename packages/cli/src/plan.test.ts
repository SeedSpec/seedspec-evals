import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { afterEach, describe, expect, it } from "vitest";

import { createExperimentPlan } from "./plan.js";
import { createSkillExperimentPlan, SKILL_TREATMENTS } from "./skill-plan.js";
import {
  createImplementationSkillExperimentPlan,
  IMPLEMENTATION_SKILL_TREATMENTS,
} from "./implementation-skill-plan.js";
import { bundleAuthoredInput, bundleGuidanceInput } from "./authored-input.js";
import { ExperimentPlanSchema } from "./contracts.js";
import { buildDesktopBrief, buildDesktopManifest } from "./runner-brief.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

async function authoredInputFixture(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "seedspec-plan-authored-input-"));
  temporaryDirectories.push(directory);
  await mkdir(resolve(directory, "definition"));
  await Promise.all([
    writeFile(resolve(directory, "seedspec.yaml"), [
      "seedspec: 0.1",
      "id: test.tool-lending",
      "version: 0.1.0",
      "kind: application",
      "definition: definition/application.md",
      "",
    ].join("\n"), "utf8"),
    writeFile(resolve(directory, "definition/application.md"), "# Neighborhood tool lending\n", "utf8"),
  ]);
  return directory;
}

async function authoringSkillFixture(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "seedspec-plan-authoring-skill-"));
  temporaryDirectories.push(directory);
  const skillPath = resolve(directory, "SKILL.md");
  await writeFile(skillPath, [
    "---",
    "name: shape-solution-intent",
    "description: Shape rough source material into explicit agent-ready intent.",
    "---",
    "# Shape solution intent",
    "",
    "Clarify outcomes, boundaries, consequential decisions, and distinguishing evidence.",
    "",
  ].join("\n"), "utf8");
  return skillPath;
}

describe("createExperimentPlan", () => {
  it("creates a same-package implementation skill matrix without leaking the separate skill to controls", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const authoredInput = await bundleAuthoredInput(await authoredInputFixture());
    const guidanceInput = await bundleGuidanceInput(
      resolve("skills/implement-stateful-workflows"),
      "implement-stateful-workflows",
    );
    const plan = await createImplementationSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 8,
      skillPath: resolve("skills/implement-stateful-workflows/SKILL.md"),
      guidanceInput,
      authoredInput,
    });

    expect(plan.envelopes).toHaveLength(IMPLEMENTATION_SKILL_TREATMENTS.length);
    expect(plan.envelopes.map(({ manifest }) => manifest.configuration?.["treatmentId"]))
      .toEqual(IMPLEMENTATION_SKILL_TREATMENTS);
    expect(plan.envelopes.every(({ manifest }) => manifest.target.stage === "implementation")).toBe(true);
    expect(new Set(plan.envelopes.map(({ submission }) => submission.config.authoredInput?.artifactId)))
      .toEqual(new Set([authoredInput.artifactId]));

    const control = plan.envelopes[0]!;
    expect(control.submission.metadata?.["skillSource"]).toBeUndefined();
    expect(control.submission.config.trustedInstructions.join("\n")).not.toContain("# Implement Stateful Workflows");

    const embedded = plan.envelopes[1]!;
    expect(embedded.submission.metadata?.["skillSource"]).toBeUndefined();
    expect(embedded.submission.config.trustedInstructions.join("\n")).toContain("# Implement Stateful Workflows");

    const skillEnvelope = plan.envelopes[2]!;
    expect(skillEnvelope.submission.metadata?.["skillSource"]).toBeUndefined();
    expect(skillEnvelope.submission.config.guidanceInput?.artifactId).toBe(guidanceInput.artifactId);
    const manifest = buildDesktopManifest(skillEnvelope, "codex");
    const brief = buildDesktopBrief(skillEnvelope, manifest, "codex");
    expect(manifest.tools.map(({ name }) => name)).toContain("implement-stateful-workflows");
    expect(brief).toContain("Guidance treatment: `skill-guidance`");
    expect(brief).toContain("before implementation");
    expect(brief).not.toContain("before authoring");
  });

  it("freezes a multi-file gstack plan review as one labeled skill treatment", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const authoredInput = await bundleAuthoredInput(await authoredInputFixture());
    const skillDirectory = await mkdtemp(resolve(tmpdir(), "seedspec-gstack-skill-"));
    temporaryDirectories.push(skillDirectory);
    await mkdir(resolve(skillDirectory, "sections"));
    await Promise.all([
      writeFile(resolve(skillDirectory, "SKILL.md"), [
        "---",
        "name: plan-eng-review",
        "version: 1.0.0",
        "description: Engineering plan review.",
        "---",
        "# Plan Review Mode",
        "Read sections/review-sections.md.",
        "",
      ].join("\n"), "utf8"),
      writeFile(
        resolve(skillDirectory, "sections/review-sections.md"),
        "# Review Sections\n\nReview architecture, code quality, tests, and performance.\n",
        "utf8",
      ),
    ]);
    const guidanceInput = await bundleGuidanceInput(skillDirectory, "plan-eng-review");
    const plan = await createImplementationSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-23T12:00:00.000Z",
      maxSteps: 8,
      skillPath: resolve(skillDirectory, "SKILL.md"),
      guidanceInput,
      authoredInput,
      treatments: ["skill-guidance"],
      skillTreatmentId: "gstack-plan-eng-review",
      skillAdapter: "gstack-plan-eng-review",
      skillSourceRepository: "https://github.com/garrytan/gstack",
      skillSourceRevision: "abc123",
      skillLicense: "MIT",
    });

    expect(plan.envelopes).toHaveLength(1);
    const envelope = plan.envelopes[0]!;
    expect(envelope.manifest.configuration).toMatchObject({
      treatmentId: "gstack-plan-eng-review",
      guidanceDelivery: "skill-guidance",
      skillAdapter: "gstack-plan-eng-review",
      skillSourceRevision: "abc123",
      guidanceInputArtifactId: guidanceInput.artifactId,
    });
    expect(envelope.submission.config.guidanceInput?.files.map(({ path }) => path)).toEqual([
      "plan-eng-review/SKILL.md",
      "plan-eng-review/sections/review-sections.md",
    ]);
    const manifest = buildDesktopManifest(envelope, "codex");
    const brief = buildDesktopBrief(envelope, manifest, "codex");
    expect(manifest.tools.map(({ name }) => name)).toContain("plan-eng-review");
    expect(brief).toContain("Guidance treatment: `gstack-plan-eng-review`");
    expect(brief).toContain("guidance/plan-eng-review/SKILL.md");
    expect(brief).toContain("workspace/realization/TECHNICAL_PLAN.md");
  });

  it("freezes a coordinated Compound Engineering suite as one labeled treatment", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const authoredInput = await bundleAuthoredInput(await authoredInputFixture());
    const suiteDirectory = await mkdtemp(resolve(tmpdir(), "seedspec-compound-suite-"));
    temporaryDirectories.push(suiteDirectory);
    await mkdir(resolve(suiteDirectory, "members/ce-plan"), { recursive: true });
    await mkdir(resolve(suiteDirectory, "members/ce-work"), { recursive: true });
    await Promise.all([
      writeFile(resolve(suiteDirectory, "SKILL.md"), [
        "---",
        "name: compound-engineering-core-loop",
        "version: 0.1.0",
        "description: Coordinated engineering suite.",
        "---",
        "# Core loop",
        "",
      ].join("\n"), "utf8"),
      writeFile(
        resolve(suiteDirectory, "members/ce-plan/SKILL.md"),
        "---\nname: ce-plan\ndescription: Plan implementation.\n---\n# Plan\n",
        "utf8",
      ),
      writeFile(
        resolve(suiteDirectory, "members/ce-work/SKILL.md"),
        "---\nname: ce-work\ndescription: Execute implementation.\n---\n# Work\n",
        "utf8",
      ),
    ]);
    const guidanceInput = await bundleGuidanceInput(
      suiteDirectory,
      "compound-engineering-core-loop",
    );
    const plan = await createImplementationSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-23T13:00:00.000Z",
      maxSteps: 8,
      skillPath: resolve(suiteDirectory, "SKILL.md"),
      guidanceInput,
      authoredInput,
      treatments: ["skill-guidance"],
      skillTreatmentId: "compound-engineering-core-loop",
      skillAdapter: "compound-engineering-core-loop",
      skillSourceRepository: "https://github.com/EveryInc/compound-engineering-plugin",
      skillSourceRevision: "def456",
      skillLicense: "MIT",
    });

    const envelope = plan.envelopes[0]!;
    expect(envelope.manifest.configuration).toMatchObject({
      treatmentId: "compound-engineering-core-loop",
      skillAdapter: "compound-engineering-core-loop",
      skillSourceRevision: "def456",
      guidanceInputArtifactId: guidanceInput.artifactId,
    });
    expect(envelope.submission.config.guidanceInput?.files.map(({ path }) => path)).toEqual([
      "compound-engineering-core-loop/SKILL.md",
      "compound-engineering-core-loop/members/ce-plan/SKILL.md",
      "compound-engineering-core-loop/members/ce-work/SKILL.md",
    ]);
    const manifest = buildDesktopManifest(envelope, "codex");
    const brief = buildDesktopBrief(envelope, manifest, "codex");
    expect(manifest.tools.map(({ name }) => name)).toContain("compound-engineering-core-loop");
    expect(brief).toContain("Guidance treatment: `compound-engineering-core-loop`");
    expect(brief).toContain("ce-plan");
    expect(brief).toContain("ce-code-review");
    expect(brief).toContain("workspace/realization/SUITE_EXECUTION.md");
  });

  it("adapts a gstack engineering suite without enabling release mutations", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const authoredInput = await bundleAuthoredInput(await authoredInputFixture());
    const suiteDirectory = await mkdtemp(resolve(tmpdir(), "seedspec-gstack-suite-"));
    temporaryDirectories.push(suiteDirectory);
    await writeFile(resolve(suiteDirectory, "SKILL.md"), [
      "---",
      "name: gstack-engineering-suite",
      "version: 0.1.0",
      "description: Coordinated gstack suite.",
      "---",
      "# gstack suite",
      "",
    ].join("\n"), "utf8");
    const guidanceInput = await bundleGuidanceInput(suiteDirectory, "gstack-engineering-suite");
    const plan = await createImplementationSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-23T14:00:00.000Z",
      maxSteps: 8,
      skillPath: resolve(suiteDirectory, "SKILL.md"),
      guidanceInput,
      authoredInput,
      treatments: ["skill-guidance"],
      skillTreatmentId: "gstack-engineering-suite",
      skillAdapter: "gstack-engineering-suite",
    });

    const envelope = plan.envelopes[0]!;
    const brief = buildDesktopBrief(envelope, buildDesktopManifest(envelope, "codex"), "codex");
    expect(brief).toContain("plan-eng-review");
    expect(brief).toContain("conditional qa");
    expect(brief).toContain("Stop before release mutation");
    expect(brief).toContain("workspace/realization/SUITE_EXECUTION.md");
  });

  it("creates a same-output skill treatment matrix with identical author access", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const skillPath = await authoringSkillFixture();
    const plan = await createSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 8,
      skillPath,
    });

    expect(plan.envelopes).toHaveLength(SKILL_TREATMENTS.length);
    expect(plan.envelopes.map(({ manifest }) => manifest.configuration?.["treatmentId"]))
      .toEqual(SKILL_TREATMENTS);
    expect(new Set(plan.envelopes.map(({ manifest }) => manifest.variant)))
      .toEqual(new Set(["seedspec-guided"]));
    expect(plan.envelopes.every(({ submission }) =>
      Object.keys(submission.config.simulatedAuthorResponses).length === 3)).toBe(true);

    const skillEnvelope = plan.envelopes.find(({ manifest }) =>
      manifest.configuration?.["treatmentId"] === "skill-guidance")!;
    const skillManifest = buildDesktopManifest(skillEnvelope, "codex");
    const skillBrief = buildDesktopBrief(skillEnvelope, skillManifest, "codex");
    expect(skillManifest.tools.map(({ name }) => name)).toContain("shape-solution-intent");
    expect(skillManifest.tools.find(({ name }) => name === "seedspec-cli")?.configuration?.["guidedAudit"])
      .toBe(false);
    expect(skillBrief).toContain("guidance/shape-solution-intent/SKILL.md");

    const combinedEnvelope = plan.envelopes.find(({ manifest }) =>
      manifest.configuration?.["treatmentId"] === "skill-and-audit")!;
    const combinedManifest = buildDesktopManifest(combinedEnvelope, "codex");
    expect(combinedManifest.tools.find(({ name }) => name === "seedspec-cli")?.configuration?.["guidedAudit"])
      .toBe(true);
  });

  it("uses the selected skill identity and case kind instead of hardcoded intent guidance", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "kestrel-warehouse-transfer");
    const plan = await createSkillExperimentPlan({
      cases: selected,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-22T12:00:00.000Z",
      maxSteps: 8,
      skillPath: resolve("skills/specify-kestrel-transfers/SKILL.md"),
    });

    const skillEnvelope = plan.envelopes.find(({ manifest }) =>
      manifest.configuration?.["treatmentId"] === "skill-guidance")!;
    const manifest = buildDesktopManifest(skillEnvelope, "codex");
    const brief = buildDesktopBrief(skillEnvelope, manifest, "codex");
    expect(skillEnvelope.manifest.configuration?.["skillId"]).toBe("specify-kestrel-transfers");
    expect(skillEnvelope.submission.metadata?.["skillSource"]).toContain("Kestrel Transfer API 3.2");
    expect(manifest.tools.map(({ name }) => name)).toContain("specify-kestrel-transfers");
    expect(brief).toContain("guidance/specify-kestrel-transfers/SKILL.md");
    expect(brief).toContain("valid SeedSpec workflow package");
    expect(brief).not.toContain("guidance/shape-solution-intent/SKILL.md");
  });

  it("creates one isolated run for every standard authorship variant", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "authorship",
      variants: ["raw-source", "markdown-authored", "seedspec-minimal", "seedspec-guided", "seedspec-restructured"],
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });

    expect(plan.envelopes.map(({ manifest }) => manifest.variant)).toEqual([
      "raw-source",
      "markdown-authored",
      "seedspec-minimal",
      "seedspec-guided",
      "seedspec-restructured",
    ]);
    const control = plan.envelopes[0]!;
    expect(control.submission.config.untrustedMaterial).not.toContain("SeedSpec");
    expect(control.submission.config.trustedInstructions.join(" ")).not.toContain("SeedSpec");
    expect(control.manifest.tools.map(({ name }) => name)).toEqual([
      "think-workspace",
    ]);
    expect(control.submission.config.simulatedAuthorResponses).toEqual({});
    const desktopManifest = buildDesktopManifest(control, "codex");
    const desktopBrief = buildDesktopBrief(control, desktopManifest, "codex");
    expect(desktopBrief).not.toMatch(/seedspec/i);
  });

  it("defaults to fifteen minutes and content-addresses a configured duration", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const common = {
      cases: cases.slice(0, 1),
      stage: "authorship" as const,
      variants: ["seedspec-guided"] as const,
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    };
    const defaultPlan = await createExperimentPlan(common);
    const configuredPlan = await createExperimentPlan({
      ...common,
      maxDurationMs: 90_000,
    });

    expect(defaultPlan.envelopes[0]!.manifest.limits.maxDurationMs).toBe(15 * 60 * 1000);
    expect(configuredPlan.envelopes[0]!.manifest.limits.maxDurationMs).toBe(90_000);
    expect(configuredPlan.envelopes[0]!.manifest.runId)
      .not.toBe(defaultPlan.envelopes[0]!.manifest.runId);
  });

  it("keeps hidden expectations and simulated answers out of model material", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      variants: ["seedspec-guided"],
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });

    const envelope = plan.envelopes[0];
    expect(envelope).toBeDefined();
    const material = envelope?.submission.config.untrustedMaterial ?? "";
    expect(material).not.toContain("hostile-instruction-rejected");
    expect(material).not.toContain("An operator invites residents");
    expect(material).not.toContain("Core borrower and lender tasks must be usable");
    expect(material).not.toContain("explicit-lifecycle");
    expect(envelope?.submission.config.simulatedAuthorResponses["membership-boundary"])
      .toContain("operator invites residents");
  });

  it("creates distinct content-addressed runs for model and repetition changes", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.slice(0, 1);
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      variants: ["seedspec-guided"],
      models: ["@cf/moonshotai/kimi-k2.6", "openai/gpt-4.1-mini"],
      repetitions: 2,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });

    const ids = plan.envelopes.map(({ manifest }) => manifest.runId);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("rejects plan or execution-input tampering", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "authorship",
      variants: ["seedspec-guided"],
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });
    expect(ExperimentPlanSchema.safeParse(plan).success).toBe(true);

    const tampered = structuredClone(plan);
    tampered.envelopes[0]!.submission.config.trustedInstructions = ["Replacement authority."];
    expect(ExperimentPlanSchema.safeParse(tampered).success).toBe(false);
  });

  it("derives a runner-specific desktop manifest and agent-readable handoff", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "authorship",
      variants: ["seedspec-guided"],
      models: ["openai/gpt-5.4"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.5",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });
    const envelope = plan.envelopes[0]!;
    const manifest = buildDesktopManifest(envelope, "codex");
    const brief = buildDesktopBrief(envelope, manifest, "codex");

    expect(manifest.runId).not.toBe(envelope.manifest.runId);
    expect(manifest.configuration?.["sourceRunId"]).toBe(envelope.manifest.runId);
    expect(manifest.runner.id).toBe("codex-desktop");
    expect(manifest.tools.map((entry) => entry.name)).toEqual([
      "desktop-agent-workspace",
      "seedspec-simulated-author",
      "seedspec-cli",
    ]);
    expect(brief).toContain("runner-control.mjs answer --question");
    expect(brief).toContain("trace-draft.json");
    expect(brief).toContain("explicit CLI or API model selection is authoritative");
    expect(brief).toContain("snapshot as unavailable when none is exposed");
    expect(brief).not.toContain(envelope.submission.config.simulatedAuthorResponses["due-date-policy"] ?? "not-present");
  });
});
