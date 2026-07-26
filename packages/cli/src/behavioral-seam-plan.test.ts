import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createBehavioralSeamPlanFile } from "./behavioral-seam.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("behavioral seam plan case selection", () => {
  it("plans a complete paired matrix for only the selected cases", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "seedspec-behavioral-plan-"));
    try {
      const result = await createBehavioralSeamPlanFile({
        skill: resolve(REPOSITORY_ROOT, "skills/implement-stateful-workflows/SKILL.md"),
        suite: resolve(
          REPOSITORY_ROOT,
          "suites/behavioral/implement-stateful-workflows-executable.yaml",
        ),
        models: ["openai/gpt-5.6-terra"],
        repetitions: 2,
        createdAt: "2026-07-25T03:00:00.000Z",
        caseIds: [
          "executable-state-outbox-recovery",
          "executable-custody-transfer",
        ],
        out: resolve(directory, "plan.json"),
      });

      expect(result.plan.cases.map(({ id }) => id)).toEqual([
        "executable-state-outbox-recovery",
        "executable-custody-transfer",
      ]);
      expect(result.plan.tasks).toHaveLength(8);
      expect(new Set(result.plan.tasks.map(({ caseId }) => caseId))).toEqual(new Set([
        "executable-state-outbox-recovery",
        "executable-custody-transfer",
      ]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unknown or duplicate case selections", async () => {
    const base = {
      skill: resolve(REPOSITORY_ROOT, "skills/implement-stateful-workflows/SKILL.md"),
      suite: resolve(
        REPOSITORY_ROOT,
        "suites/behavioral/implement-stateful-workflows-executable.yaml",
      ),
      models: ["openai/gpt-5.6-terra"],
      repetitions: 1,
      createdAt: "2026-07-25T03:00:00.000Z",
    };

    await expect(createBehavioralSeamPlanFile({
      ...base,
      caseIds: ["missing-case"],
    })).rejects.toThrow("Behavioral seam case not found in suite");
    await expect(createBehavioralSeamPlanFile({
      ...base,
      caseIds: ["executable-custody-transfer", "executable-custody-transfer"],
    })).rejects.toThrow("Behavioral seam case selection must be unique");
  });
});
