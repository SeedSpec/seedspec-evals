import { resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { describe, expect, it } from "vitest";

import { createExperimentPlan } from "./plan.js";
import { ExperimentPlanSchema } from "./contracts.js";
import { buildDesktopBrief, buildDesktopManifest } from "./runner-brief.js";

describe("createExperimentPlan", () => {
  it("creates one isolated run for every standard authorship variant", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const plan = await createExperimentPlan({
      cases: cases.slice(0, 1),
      stage: "authorship",
      variants: ["source-only", "seedspec-scaffold", "seedspec-guided-authoring"],
      models: ["openai/gpt-5.6-sol"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });

    expect(plan.envelopes.map(({ manifest }) => manifest.variant)).toEqual([
      "source-only",
      "seedspec-scaffold",
      "seedspec-guided-authoring",
    ]);
    const control = plan.envelopes[0]!;
    expect(control.submission.config.untrustedMaterial).not.toContain("SeedSpec");
    expect(control.submission.config.trustedInstructions.join(" ")).not.toContain("SeedSpec");
    expect(control.manifest.tools.map(({ name }) => name)).toEqual([
      "think-workspace",
      "seedspec-simulated-author",
    ]);
    const desktopManifest = buildDesktopManifest(control, "codex");
    const desktopBrief = buildDesktopBrief(control, desktopManifest, "codex", "runs/source-only");
    expect(desktopBrief).not.toMatch(/seedspec/i);
  });

  it("keeps hidden expectations and simulated answers out of model material", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      variants: ["seedspec-guided-authoring"],
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });

    const envelope = plan.envelopes[0];
    expect(envelope).toBeDefined();
    const material = envelope?.submission.config.untrustedMaterial ?? "";
    expect(material).not.toContain("hostile-instruction-rejected");
    expect(material).not.toContain("An operator invites residents");
    expect(envelope?.submission.config.simulatedAuthorResponses["membership-boundary"])
      .toContain("operator invites residents");
  });

  it("creates distinct content-addressed runs for model and repetition changes", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.slice(0, 1);
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      variants: ["seedspec-guided-authoring"],
      models: ["@cf/moonshotai/kimi-k2.6", "openai/gpt-4.1-mini"],
      repetitions: 2,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
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
      variants: ["seedspec-guided-authoring"],
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
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
      variants: ["seedspec-guided-authoring"],
      models: ["openai/gpt-5.4"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.3",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });
    const envelope = plan.envelopes[0]!;
    const manifest = buildDesktopManifest(envelope, "codex");
    const brief = buildDesktopBrief(envelope, manifest, "codex", "runs/parity-codex");

    expect(manifest.runId).not.toBe(envelope.manifest.runId);
    expect(manifest.configuration?.["sourceRunId"]).toBe(envelope.manifest.runId);
    expect(manifest.runner.id).toBe("codex-desktop");
    expect(manifest.tools.map((entry) => entry.name)).toEqual([
      "desktop-agent-workspace",
      "seedspec-simulated-author",
      "seedspec-cli",
    ]);
    expect(brief).toContain("author answer runs/parity-codex/source-envelope.json");
    expect(brief).toContain("runs/parity-codex/trace-draft.json");
    expect(brief).not.toContain(envelope.submission.config.simulatedAuthorResponses["due-date-policy"] ?? "not-present");
  });
});
