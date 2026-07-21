import { resolve } from "node:path";

import { loadCaseLibrary } from "@seedspec/eval-case-library";
import { describe, expect, it } from "vitest";

import { createExperimentPlan } from "./plan.js";
import { ExperimentPlanSchema } from "./contracts.js";

describe("createExperimentPlan", () => {
  it("keeps hidden expectations and simulated answers out of model material", async () => {
    const cases = await loadCaseLibrary(resolve("cases"));
    const selected = cases.filter(({ case: evaluationCase }) =>
      evaluationCase.id === "sparse-neighborhood-tool-lending");
    const plan = await createExperimentPlan({
      cases: selected,
      stage: "authorship",
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.4",
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
      models: ["@cf/moonshotai/kimi-k2.6", "openai/gpt-4.1-mini"],
      repetitions: 2,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.4",
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
      models: ["@cf/moonshotai/kimi-k2.6"],
      repetitions: 1,
      gatewayId: "seedspec-evals",
      protocolVersion: "0.1.0-alpha.4",
      createdAt: "2026-07-21T12:00:00.000Z",
      maxSteps: 6,
    });
    expect(ExperimentPlanSchema.safeParse(plan).success).toBe(true);

    const tampered = structuredClone(plan);
    tampered.envelopes[0]!.submission.config.trustedInstructions = ["Replacement authority."];
    expect(ExperimentPlanSchema.safeParse(tampered).success).toBe(false);
  });
});
