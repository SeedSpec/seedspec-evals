import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  JsonValueSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  stableJson,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluatorUsageSchema } from "./evaluator-runs.js";

export const BehavioralSeamTreatmentSchema = z.enum(["no-guidance", "skill-guidance"]);

export const BehavioralDependencyModeSchema = z.enum(["live", "frozen", "simulated"]);

export const BehavioralDependencyBindingSchema = z.enum([
  "in-process",
  "network",
  "mcp",
  "cli",
  "filesystem",
  "browser",
]);

export const BehavioralDependencySchema = z.strictObject({
  id: IdentifierSchema,
  mode: BehavioralDependencyModeSchema,
  binding: BehavioralDependencyBindingSchema,
  behavior: z.string().trim().min(1).max(4_000),
  source: z.string().trim().min(1).max(2_000),
  effects: z.enum(["read-only", "isolated-mutation"]),
  reset: z.string().trim().min(1).max(2_000).optional(),
  treatments: z.array(BehavioralSeamTreatmentSchema).min(1).max(2),
}).superRefine((dependency, context) => {
  if (new Set(dependency.treatments).size !== dependency.treatments.length) {
    context.addIssue({
      code: "custom",
      message: "dependency treatments must be unique",
      path: ["treatments"],
    });
  }
  if (dependency.mode === "live" && dependency.effects !== "read-only") {
    context.addIssue({
      code: "custom",
      message: "live dependencies must be read-only; simulate mutations instead",
      path: ["effects"],
    });
  }
  if (dependency.effects === "isolated-mutation" && dependency.reset === undefined) {
    context.addIssue({
      code: "custom",
      message: "isolated mutation dependencies require a reset contract",
      path: ["reset"],
    });
  }
});

export const BehavioralRuntimeSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("active-entrypoint"),
    target: z.string().trim().min(1).max(2_000),
    preservedBehavior: z.string().trim().min(1).max(4_000),
  }),
  z.strictObject({
    mode: z.literal("reconstruction"),
    target: z.string().trim().min(1).max(2_000),
    preservedBehavior: z.string().trim().min(1).max(4_000),
    unsupportedBehavior: z.string().trim().min(1).max(4_000),
  }),
]);

export const BehavioralExecutionContractSchema = z.strictObject({
  runtime: BehavioralRuntimeSchema,
  dependencies: z.array(BehavioralDependencySchema).min(1).max(64),
}).superRefine((execution, context) => {
  const dependencyIds = execution.dependencies.map(({ id }) => id);
  if (new Set(dependencyIds).size !== dependencyIds.length) {
    context.addIssue({
      code: "custom",
      message: "behavioral execution dependency IDs must be unique",
      path: ["dependencies"],
    });
  }
  for (const treatment of BehavioralSeamTreatmentSchema.options) {
    if (!execution.dependencies.some((dependency) => dependency.treatments.includes(treatment))) {
      context.addIssue({
        code: "custom",
        message: `behavioral execution must declare at least one dependency for ${treatment}`,
        path: ["dependencies"],
      });
    }
  }
});

export const BehavioralSeamDesignSchema = z.strictObject({
  capability: z.string().trim().min(1).max(4_000),
  necessity: z.string().trim().min(1).max(4_000),
  success: z.string().trim().min(1).max(4_000),
});

const BehavioralExpectationSchema = z.strictObject({
  consultedSkill: z.boolean(),
  includeActions: z.array(IdentifierSchema).max(64),
  excludeActions: z.array(IdentifierSchema).max(64),
});

export const BehavioralArtifactAssertionSchema = z.strictObject({
  id: IdentifierSchema,
  description: z.string().trim().min(1).max(4_000),
  pointer: z.string().max(1_024).refine(
    (pointer) => pointer === "" || pointer.startsWith("/"),
    "must be an RFC 6901 JSON pointer",
  ),
  operator: z.enum([
    "equals",
    "not-equals",
    "includes",
    "excludes",
    "set-equals",
    "exists",
    "absent",
    "array-length-at-least",
    "array-length-at-most",
  ]),
  expected: JsonValueSchema.optional(),
  weight: z.number().int().positive().max(100).default(1),
}).superRefine((assertion, context) => {
  const forbidsExpected = assertion.operator === "exists" || assertion.operator === "absent";
  if (forbidsExpected && assertion.expected !== undefined) {
    context.addIssue({
      code: "custom",
      message: `${assertion.operator} assertions cannot declare expected`,
      path: ["expected"],
    });
  }
  if (!forbidsExpected && assertion.expected === undefined) {
    context.addIssue({
      code: "custom",
      message: `${assertion.operator} assertions require expected`,
      path: ["expected"],
    });
  }
  if ((assertion.operator === "array-length-at-least"
      || assertion.operator === "array-length-at-most")
    && (!Number.isInteger(assertion.expected) || (assertion.expected as number) < 0)) {
    context.addIssue({
      code: "custom",
      message: `${assertion.operator} expected must be a nonnegative integer`,
      path: ["expected"],
    });
  }
  if (assertion.operator === "set-equals"
    && (!Array.isArray(assertion.expected)
      || assertion.expected.some((value) => typeof value !== "string"))) {
    context.addIssue({
      code: "custom",
      message: "set-equals expected must be an array of strings",
      path: ["expected"],
    });
  }
});

const BehavioralArtifactProbeSchema = z.strictObject({
  source: z.string().min(1).max(128 * 1024),
  timeoutMs: z.number().int().positive().max(120_000).default(10_000),
  assertions: z.array(z.strictObject({
    id: IdentifierSchema,
    description: z.string().trim().min(1).max(4_000),
    weight: z.number().int().positive().max(100).default(1),
  })).min(1).max(256),
});

const BehavioralArtifactContractSchema = z.strictObject({
  path: SafeRelativePathSchema,
  instructions: z.string().trim().min(1).max(8_000),
  template: JsonValueSchema,
  format: z.enum(["json", "text"]).optional(),
  assertions: z.array(BehavioralArtifactAssertionSchema).max(256),
  probe: BehavioralArtifactProbeSchema.optional(),
}).superRefine((artifact, context) => {
  const ids = artifact.assertions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "behavioral artifact assertion IDs must be unique",
      path: ["assertions"],
    });
  }
  const format = artifact.format ?? "json";
  if (format === "json" && (artifact.assertions.length === 0 || artifact.probe !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "JSON artifacts require path assertions and cannot declare an executable probe",
      path: ["assertions"],
    });
  }
  if (format === "text"
    && (typeof artifact.template !== "string"
      || artifact.assertions.length !== 0
      || artifact.probe === undefined)) {
    context.addIssue({
      code: "custom",
      message: "text artifacts require a string template and executable probe only",
      path: ["probe"],
    });
  }
  if (artifact.probe !== undefined) {
    const probeIds = artifact.probe.assertions.map(({ id }) => id);
    if (new Set(probeIds).size !== probeIds.length) {
      context.addIssue({
        code: "custom",
        message: "behavioral artifact probe assertion IDs must be unique",
        path: ["probe", "assertions"],
      });
    }
  }
});

export const BehavioralSeamCaseSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.enum(["activation", "restraint", "protocol", "fallback"]),
  description: z.string().trim().min(1).max(4_000),
  design: BehavioralSeamDesignSchema,
  prompt: z.string().trim().min(1).max(16_000),
  actions: z.array(z.strictObject({
    id: IdentifierSchema,
    description: z.string().trim().min(1).max(4_000),
  })).max(64),
  artifact: BehavioralArtifactContractSchema.optional(),
  expectations: z.strictObject({
    noGuidance: BehavioralExpectationSchema,
    skillGuidance: BehavioralExpectationSchema,
  }),
}).superRefine((seam, context) => {
  if (seam.artifact === undefined && seam.actions.length < 2) {
    context.addIssue({
      code: "custom",
      message: "action-only behavioral seams require at least two actions",
      path: ["actions"],
    });
  }
  const actionIds = seam.actions.map(({ id }) => id);
  if (new Set(actionIds).size !== actionIds.length) {
    context.addIssue({ code: "custom", message: "action IDs must be unique", path: ["actions"] });
  }
  const allowed = new Set(actionIds);
  for (const [key, expectation] of Object.entries(seam.expectations)) {
    const overlap = expectation.includeActions.filter((id) => expectation.excludeActions.includes(id));
    if (overlap.length > 0) {
      context.addIssue({
        code: "custom",
        message: `expected and forbidden actions overlap: ${overlap.join(", ")}`,
        path: ["expectations", key],
      });
    }
    for (const actionId of [...expectation.includeActions, ...expectation.excludeActions]) {
      if (!allowed.has(actionId)) {
        context.addIssue({
          code: "custom",
          message: `expectation references unknown action ${actionId}`,
          path: ["expectations", key],
        });
      }
    }
  }
});

export const BehavioralSeamTaskSchema = z
  .strictObject({
    taskId: z.string().regex(/^behavior_task_[a-f0-9]{64}$/),
    skillDigest: Sha256DigestSchema,
    caseId: IdentifierSchema,
    treatment: BehavioralSeamTreatmentSchema,
    requestedModel: z.string().trim().min(1).max(256),
    repetition: z.number().int().nonnegative().max(1_000_000),
  })
  .superRefine((task, context) => {
    const { taskId, ...body } = task;
    const expected = contentId("behavior_task", body as unknown as JsonValue);
    if (taskId !== expected) {
      context.addIssue({
        code: "custom",
        message: "taskId does not match behavioral task content",
        path: ["taskId"],
      });
    }
  });

export const BehavioralSeamPlanBodySchema = z.strictObject({
  schemaVersion: z.literal(2),
  createdAt: IsoTimestampSchema,
  skill: z.strictObject({
    id: IdentifierSchema,
    digest: Sha256DigestSchema,
    source: z.string().min(1).max(512 * 1024),
  }),
  models: z.array(z.string().trim().min(1).max(256)).min(1).max(64),
  repetitions: z.number().int().positive().max(100),
  execution: BehavioralExecutionContractSchema,
  cases: z.array(BehavioralSeamCaseSchema).min(1).max(256),
  tasks: z.array(BehavioralSeamTaskSchema).min(1).max(100_000),
  interpretation: z.literal(
    "Behavioral seam results are low-cost screening evidence. They cannot confirm end-to-end skill quality or replace full case evaluations.",
  ),
}).superRefine((plan, context) => {
  if (new Set(plan.models).size !== plan.models.length) {
    context.addIssue({ code: "custom", message: "models must be unique", path: ["models"] });
  }
  const caseIds = plan.cases.map(({ id }) => id);
  if (new Set(caseIds).size !== caseIds.length) {
    context.addIssue({ code: "custom", message: "behavioral seam case IDs must be unique", path: ["cases"] });
  }
  const expectedTasks = plan.models.length * plan.repetitions * plan.cases.length * 2;
  if (plan.tasks.length !== expectedTasks) {
    context.addIssue({
      code: "custom",
      message: `behavioral seam plan must contain the complete treatment matrix (${String(expectedTasks)} tasks)`,
      path: ["tasks"],
    });
  }
  const expectedKeys = new Set<string>();
  for (const model of plan.models) {
    for (const seam of plan.cases) {
      for (const treatment of BehavioralSeamTreatmentSchema.options) {
        for (let repetition = 0; repetition < plan.repetitions; repetition += 1) {
          expectedKeys.add(`${seam.id}\0${treatment}\0${model}\0${String(repetition)}`);
        }
      }
    }
  }
  for (const [index, task] of plan.tasks.entries()) {
    const key = `${task.caseId}\0${task.treatment}\0${task.requestedModel}\0${String(task.repetition)}`;
    if (task.skillDigest !== plan.skill.digest || !expectedKeys.delete(key)) {
      context.addIssue({
        code: "custom",
        message: "behavioral task is duplicated or outside the declared matrix",
        path: ["tasks", index],
      });
    }
  }
});

const BehavioralSeamPlanDataSchema = BehavioralSeamPlanBodySchema.safeExtend({
  behavioralPlanId: z.string().regex(/^behavioral_plan_[a-f0-9]{64}$/),
}).superRefine((plan, context) => {
  const { behavioralPlanId, ...body } = plan;
  const parsed = BehavioralSeamPlanBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("behavioral_plan", parsed.data as unknown as JsonValue);
  if (behavioralPlanId !== expected) {
    context.addIssue({
      code: "custom",
      message: `behavioralPlanId does not match plan content; expected ${expected}`,
      path: ["behavioralPlanId"],
    });
  }
});

export const BehavioralSeamPlanSchema =
  BehavioralSeamPlanDataSchema.transform((value) => deepFreeze(value));
export type BehavioralSeamPlan =
  DeepReadonly<z.infer<typeof BehavioralSeamPlanDataSchema>>;

export function createBehavioralSeamPlan(
  input: z.input<typeof BehavioralSeamPlanBodySchema>,
): BehavioralSeamPlan {
  const body = BehavioralSeamPlanBodySchema.parse(input);
  return BehavioralSeamPlanSchema.parse({
    ...body,
    behavioralPlanId: contentId("behavioral_plan", body as unknown as JsonValue),
  });
}

export function parseBehavioralSeamPlan(input: unknown): BehavioralSeamPlan {
  return BehavioralSeamPlanSchema.parse(input);
}

const BehavioralArtifactObservationSchema = z.strictObject({
  path: SafeRelativePathSchema,
  digest: Sha256DigestSchema,
  byteLength: z.number().int().nonnegative().max(512 * 1024),
  parseStatus: z.enum(["valid", "invalid"]),
  content: JsonValueSchema.optional(),
}).superRefine((artifact, context) => {
  if (artifact.parseStatus === "valid" && artifact.content === undefined) {
    context.addIssue({
      code: "custom",
      message: "a valid artifact observation requires parsed content",
      path: ["content"],
    });
  }
  if (artifact.parseStatus === "invalid" && artifact.content !== undefined) {
    context.addIssue({
      code: "custom",
      message: "an invalid artifact observation cannot claim parsed content",
      path: ["content"],
    });
  }
});

export const BehavioralSeamObservationSchema = z.strictObject({
  taskId: z.string().regex(/^behavior_task_[a-f0-9]{64}$/),
  runner: z.strictObject({
    id: z.enum(["codex-cli", "claude-code-cli"]),
    version: z.string().trim().min(1).max(256),
  }),
  modelSelector: z.string().trim().min(1).max(256),
  servedModel: z.string().trim().min(1).max(256).optional(),
  modelIdentityStatus: z.enum(["verified", "unverified", "mismatch"]),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema,
  transcript: z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
    byteLength: z.number().int().positive(),
    eventCount: z.number().int().positive(),
  }),
  usage: EvaluatorUsageSchema.optional(),
  consultedSkill: z.boolean(),
  selectedActionIds: z.array(IdentifierSchema).max(64),
  artifact: BehavioralArtifactObservationSchema.optional(),
  rationale: z.string().trim().min(1).max(8_000),
  limitations: z.array(z.string().trim().min(1).max(4_000)).max(64),
}).superRefine((observation, context) => {
  if (Date.parse(observation.finishedAt) < Date.parse(observation.startedAt)) {
    context.addIssue({
      code: "custom",
      message: "behavioral observation cannot finish before it starts",
      path: ["finishedAt"],
    });
  }
  if (observation.modelIdentityStatus === "unverified" && observation.servedModel !== undefined) {
    context.addIssue({
      code: "custom",
      message: "an unverified observation cannot claim a served model",
      path: ["servedModel"],
    });
  }
  if (observation.modelIdentityStatus === "verified"
    && observation.servedModel !== observation.modelSelector) {
    context.addIssue({
      code: "custom",
      message: "verified observation requires matching selector and served model",
      path: ["servedModel"],
    });
  }
  if (observation.modelIdentityStatus === "mismatch"
    && (observation.servedModel === undefined
      || observation.servedModel === observation.modelSelector)) {
    context.addIssue({
      code: "custom",
      message: "mismatch observation requires a different served model",
      path: ["servedModel"],
    });
  }
});

export const BehavioralSeamResultBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  behavioralPlanId: z.string().regex(/^behavioral_plan_[a-f0-9]{64}$/),
  createdAt: IsoTimestampSchema,
  task: BehavioralSeamTaskSchema,
  observation: BehavioralSeamObservationSchema,
  assertions: z.array(z.strictObject({
    id: IdentifierSchema,
    passed: z.boolean(),
    expected: z.string().trim().min(1).max(4_000),
    observed: z.string().trim().min(1).max(4_000),
  })).min(1).max(256),
  qualityScore: z.number().min(0).max(1).optional(),
  status: z.enum(["passed", "failed", "inconclusive"]),
}).superRefine((result, context) => {
  if (result.observation.taskId !== result.task.taskId) {
    context.addIssue({
      code: "custom",
      message: "observation does not match the behavioral task",
      path: ["observation", "taskId"],
    });
  }
  const expectedStatus = result.observation.modelIdentityStatus === "mismatch"
    ? "inconclusive"
    : result.assertions.every(({ passed }) => passed)
      ? "passed"
      : "failed";
  if (result.status !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: `behavioral result status does not match evidence; expected ${expectedStatus}`,
      path: ["status"],
    });
  }
  const artifactAssertions = result.assertions.filter(({ id }) =>
    id === "artifact-json-valid" || id.startsWith("artifact-"));
  if (artifactAssertions.length === 0 && result.qualityScore !== undefined) {
    context.addIssue({
      code: "custom",
      message: "qualityScore requires artifact assertions",
      path: ["qualityScore"],
    });
  }
});

const BehavioralSeamResultDataSchema = BehavioralSeamResultBodySchema.safeExtend({
  behavioralResultId: z.string().regex(/^behavioral_result_[a-f0-9]{64}$/),
}).superRefine((result, context) => {
  const { behavioralResultId, ...body } = result;
  const parsed = BehavioralSeamResultBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("behavioral_result", parsed.data as unknown as JsonValue);
  if (behavioralResultId !== expected) {
    context.addIssue({
      code: "custom",
      message: `behavioralResultId does not match result content; expected ${expected}`,
      path: ["behavioralResultId"],
    });
  }
});

export const BehavioralSeamResultSchema =
  BehavioralSeamResultDataSchema.transform((value) => deepFreeze(value));
export type BehavioralSeamResult =
  DeepReadonly<z.infer<typeof BehavioralSeamResultDataSchema>>;

export function createBehavioralSeamResult(
  input: z.input<typeof BehavioralSeamResultBodySchema>,
): BehavioralSeamResult {
  const body = BehavioralSeamResultBodySchema.parse(input);
  return BehavioralSeamResultSchema.parse({
    ...body,
    behavioralResultId: contentId("behavioral_result", body as unknown as JsonValue),
  });
}

export function parseBehavioralSeamResult(input: unknown): BehavioralSeamResult {
  return BehavioralSeamResultSchema.parse(input);
}

export type BehavioralArtifactAssertion =
  DeepReadonly<z.infer<typeof BehavioralArtifactAssertionSchema>>;
type ReadonlyJsonValue = DeepReadonly<JsonValue>;

export function evaluateBehavioralArtifactAssertion(
  content: JsonValue,
  assertion: BehavioralArtifactAssertion,
): { passed: boolean; observed: string } {
  const resolved = resolveJsonPointer(content, assertion.pointer);
  const expected = assertion.expected;
  switch (assertion.operator) {
    case "exists":
      return { passed: resolved.found, observed: displayJsonPointerValue(resolved) };
    case "absent":
      return { passed: !resolved.found, observed: displayJsonPointerValue(resolved) };
    case "equals":
      return {
        passed: resolved.found && jsonEqual(resolved.value, expected),
        observed: displayJsonPointerValue(resolved),
      };
    case "not-equals":
      return {
        passed: resolved.found && !jsonEqual(resolved.value, expected),
        observed: displayJsonPointerValue(resolved),
      };
    case "includes":
      return {
        passed: resolved.found
          && Array.isArray(resolved.value)
          && resolved.value.some((value) => artifactArrayValueMatches(value, expected)),
        observed: displayJsonPointerValue(resolved),
      };
    case "excludes":
      return {
        passed: resolved.found
          && Array.isArray(resolved.value)
          && !resolved.value.some((value) => artifactArrayValueMatches(value, expected)),
        observed: displayJsonPointerValue(resolved),
      };
    case "set-equals": {
      const observed = resolved.value;
      const expectedValues = expected as readonly string[];
      const passed = resolved.found
        && Array.isArray(observed)
        && observed.every((value) => typeof value === "string")
        && new Set(observed).size === observed.length
        && observed.length === expectedValues.length
        && expectedValues.every((value) => observed.includes(value));
      return { passed, observed: displayJsonPointerValue(resolved) };
    }
    case "array-length-at-least":
      return {
        passed: resolved.found
          && Array.isArray(resolved.value)
          && resolved.value.length >= (expected as number),
        observed: displayJsonPointerValue(resolved),
      };
    case "array-length-at-most":
      return {
        passed: resolved.found
          && Array.isArray(resolved.value)
          && resolved.value.length <= (expected as number),
        observed: displayJsonPointerValue(resolved),
      };
  }
}

function resolveJsonPointer(
  content: JsonValue,
  pointer: string,
): { found: boolean; value?: JsonValue } {
  if (pointer === "") return { found: true, value: content };
  let current: JsonValue = content;
  for (const encodedSegment of pointer.slice(1).split("/")) {
    const segment = encodedSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index]!;
      continue;
    }
    if (typeof current !== "object" || current === null
      || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }
    current = current[segment]!;
  }
  return { found: true, value: current };
}

function displayJsonPointerValue(resolved: { found: boolean; value?: ReadonlyJsonValue }): string {
  return resolved.found && resolved.value !== undefined
    ? JSON.stringify(resolved.value)
    : "<missing>";
}

function jsonEqual(
  left: ReadonlyJsonValue | undefined,
  right: ReadonlyJsonValue | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
}

function artifactArrayValueMatches(
  observed: ReadonlyJsonValue,
  expected: ReadonlyJsonValue | undefined,
): boolean {
  if (jsonEqual(observed, expected)) return true;
  if (typeof expected === "string"
    && typeof observed === "object"
    && observed !== null
    && !Array.isArray(observed)) {
    return (observed as { readonly [key: string]: ReadonlyJsonValue })["id"] === expected;
  }
  return false;
}
