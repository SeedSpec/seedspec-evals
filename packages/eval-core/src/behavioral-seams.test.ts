import { describe, expect, it } from "vitest";

import {
  BehavioralSeamCaseSchema,
  contentId,
  createBehavioralSeamPlan,
  createBehavioralSeamResult,
  evaluateBehavioralArtifactAssertion,
  type JsonValue,
} from "./index.js";

const SKILL_DIGEST = `sha256:${"a".repeat(64)}` as const;

describe("behavioral seam screening", () => {
  it("builds a complete two-treatment screen and keeps it below confirmation evidence", () => {
    const tasks = (["no-guidance", "skill-guidance"] as const).map((treatment) => {
      const body = {
        skillDigest: SKILL_DIGEST,
        caseId: "ask-before-policy",
        treatment,
        requestedModel: "openai/example",
        repetition: 0,
      };
      return { taskId: contentId("behavior_task", body as unknown as JsonValue), ...body };
    });
    const plan = createBehavioralSeamPlan({
      schemaVersion: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      skill: {
        id: "shape-solution-intent",
        digest: SKILL_DIGEST,
        source: "---\nname: shape-solution-intent\ndescription: Test.\n---\n# Test\n",
      },
      models: ["openai/example"],
      repetitions: 1,
      cases: [{
        id: "ask-before-policy",
        kind: "protocol",
        description: "Escalate an unresolved material product choice.",
        prompt: "Specify a lending workflow without inventing its overdue policy.",
        actions: [{
          id: "ask-policy",
          description: "Ask the author to resolve the overdue policy.",
        }, {
          id: "invent-policy",
          description: "Select an overdue policy without authority.",
        }],
        expectations: {
          noGuidance: {
            consultedSkill: false,
            includeActions: [],
            excludeActions: [],
          },
          skillGuidance: {
            consultedSkill: true,
            includeActions: ["ask-policy"],
            excludeActions: ["invent-policy"],
          },
        },
      }],
      tasks,
      interpretation:
        "Behavioral seam results are low-cost screening evidence. They cannot confirm end-to-end skill quality or replace full case evaluations.",
    });
    const task = plan.tasks[1]!;
    const result = createBehavioralSeamResult({
      schemaVersion: 1,
      behavioralPlanId: plan.behavioralPlanId,
      createdAt: "2026-07-24T12:01:00.000Z",
      task,
      observation: {
        taskId: task.taskId,
        runner: { id: "codex-cli", version: "codex-cli 1.0.0" },
        modelSelector: "example",
        servedModel: "example",
        modelIdentityStatus: "verified",
        startedAt: "2026-07-24T12:00:00.000Z",
        finishedAt: "2026-07-24T12:00:30.000Z",
        transcript: {
          path: "behavioral-events.jsonl",
          digest: `sha256:${"b".repeat(64)}`,
          byteLength: 100,
          eventCount: 4,
        },
        consultedSkill: true,
        selectedActionIds: ["ask-policy"],
        rationale: "The policy is material and unresolved.",
        limitations: [],
      },
      assertions: [{
        id: "skill-consultation",
        passed: true,
        expected: "consultedSkill=true",
        observed: "consultedSkill=true",
      }],
      status: "passed",
    });

    expect(plan.tasks).toHaveLength(2);
    expect(plan.interpretation).toContain("screening evidence");
    expect(result.status).toBe("passed");
  });

  it("supports produced JSON artifacts with deterministic relationship checks", () => {
    const seam = BehavioralSeamCaseSchema.parse({
      id: "selective-policy-restraint",
      kind: "restraint",
      description: "Implement the resolved workflow while isolating one unresolved policy.",
      prompt: "Produce the requested workflow decision artifact.",
      actions: [],
      artifact: {
        path: "workflow-decision.json",
        instructions: "Use the exact status and caller identifiers named by the scenario.",
        template: {
          penalty: { status: "", behavior: "" },
          callers: [],
          futureImplemented: null,
        },
        assertions: [{
          id: "policy-unresolved",
          description: "Penalty policy remains unresolved.",
          pointer: "/penalty/status",
          operator: "equals",
          expected: "unresolved",
        }, {
          id: "all-callers",
          description: "Both entry points share the boundary.",
          pointer: "/callers",
          operator: "set-equals",
          expected: ["http", "retry-worker"],
          weight: 2,
        }, {
          id: "future-not-implemented",
          description: "The future policy is not implemented in the baseline.",
          pointer: "/futureImplemented",
          operator: "equals",
          expected: false,
        }],
      },
      expectations: {
        noGuidance: {
          consultedSkill: false,
          includeActions: [],
          excludeActions: [],
        },
        skillGuidance: {
          consultedSkill: true,
          includeActions: [],
          excludeActions: [],
        },
      },
    });
    const content = {
      penalty: { status: "unresolved", behavior: "block-penalty-only" },
      callers: ["retry-worker", "http"],
      futureImplemented: false,
    };

    expect(seam.actions).toEqual([]);
    expect(seam.artifact?.assertions.map((assertion) =>
      evaluateBehavioralArtifactAssertion(content, assertion).passed))
      .toEqual([true, true, true]);
    expect(evaluateBehavioralArtifactAssertion(content, {
      id: "missing",
      description: "A missing pointer is reported deterministically.",
      pointer: "/does-not-exist",
      operator: "exists",
      weight: 1,
    })).toEqual({ passed: false, observed: "<missing>" });
    expect(evaluateBehavioralArtifactAssertion({
      cases: [{ id: "concurrent-collision", evidence: "executed" }],
    }, {
      id: "rich-case",
      description: "A richer case object preserves its stable identifier.",
      pointer: "/cases",
      operator: "includes",
      expected: "concurrent-collision",
      weight: 1,
    }).passed).toBe(true);
  });
});
