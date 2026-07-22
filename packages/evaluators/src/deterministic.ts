import {
  ScorecardSchema,
  calculateDeterministicSummary,
  createRunnableCaseView,
  appliesToVariant,
  type ArtifactEvidence,
  type ArtifactManifest,
  type DeterministicCheckResult,
  type DeterministicScorecard,
  type EvaluationCase,
  type EvaluationStage,
  type RunManifest,
} from "@seedspec/eval-core";

export interface DeterministicCheckContext {
  readonly manifest: RunManifest;
  readonly evaluationCase: EvaluationCase;
  readonly artifacts: ArtifactManifest;
  readonly stage: EvaluationStage;
}

export interface DeterministicAdapterResult {
  readonly outcome: "pass" | "fail" | "not-applicable";
  readonly message?: string;
  readonly evidence?: readonly ArtifactEvidence[];
}

export interface DeterministicCheckAdapter {
  readonly id: string;
  readonly description: string;
  evaluate(context: DeterministicCheckContext, target: unknown): DeterministicAdapterResult;
}

export interface DeterministicEvaluationInput extends DeterministicCheckContext {
  readonly createdAt: string;
  readonly adapters?: readonly DeterministicCheckAdapter[];
}

export function evaluateDeterministically(input: DeterministicEvaluationInput): DeterministicScorecard {
  const checks: DeterministicCheckResult[] = [];
  const adapterMap = new Map(input.adapters?.map((adapter) => [adapter.id, adapter]) ?? []);

  checks.push(caseMatchesManifest(input));
  checks.push(hiddenExpectationsAreIsolated(input));
  checks.push(...authoringStateIsExcluded(input));
  checks.push(...requiredDeliverablesExist(input));
  checks.push(...declaredDeterministicChecks(input, adapterMap));
  checks.push(...declaredHiddenChecks(input, adapterMap));

  const summary = calculateDeterministicSummary(checks);
  return ScorecardSchema.parse({
    schemaVersion: 1,
    id: "deterministic-contract",
    runId: input.manifest.runId,
    case: input.manifest.case,
    stage: input.stage,
    variant: input.manifest.variant,
    createdAt: input.createdAt,
    evaluator: {
      id: "seedspec-eval-deterministic",
      kind: "deterministic",
      version: "0.1.0-alpha.2",
    },
    kind: "deterministic",
    summary,
    checks,
  }) as DeterministicScorecard;
}

function authoringStateIsExcluded(input: DeterministicCheckContext): DeterministicCheckResult[] {
  if (input.stage !== "authorship" || ["raw-source", "markdown-authored"].includes(input.manifest.variant)) return [];
  const stateNames = new Set([
    "open-questions.yaml",
    "open-questions.yml",
    "authoring-state.json",
    "authoring-state.yaml",
    "sources.yaml",
    "workspace.yaml",
  ]);
  const leaked = input.artifacts.artifacts
    .filter(({ kind }) => kind === "authored-package")
    .map(({ path }) => path)
    .filter((path) => path.startsWith(".seedspec-authoring/") || stateNames.has(path));
  return [{
    id: "authoring-state-excluded",
    description: "Temporary authoring state and unresolved-work queues stay outside the distributable package.",
    outcome: leaked.length === 0 ? "pass" : "fail",
    weight: 1,
    message: leaked.length === 0
      ? "No temporary authoring-state path occurs in the authored package."
      : `Temporary authoring-state paths occur in the package: ${leaked.join(", ")}`,
    evidence: input.artifacts.artifacts
      .filter(({ path }) => leaked.includes(path))
      .map(({ artifactId, path }) => ({ artifactId, path })),
  }];
}

function declaredHiddenChecks(
  input: DeterministicCheckContext,
  adapters: ReadonlyMap<string, DeterministicCheckAdapter>,
): DeterministicCheckResult[] {
  return input.evaluationCase.hiddenExpectations
    .filter((expectation) =>
      expectation.stage === input.stage &&
      expectation.evaluation.kind === "deterministic" &&
      appliesToVariant(expectation.variants, input.manifest.variant))
    .map((expectation) => {
      if (expectation.evaluation.kind !== "deterministic") throw new Error("unreachable");
      const adapter = adapters.get(expectation.evaluation.check);
      if (adapter === undefined) {
        return {
          id: `hidden-${expectation.id}`,
          description: expectation.description,
          outcome: "not-applicable" as const,
          weight: expectation.severity === "critical" ? 3 : expectation.severity === "major" ? 2 : 1,
          message: `No deterministic adapter is registered for ${expectation.evaluation.check}.`,
          evidence: [],
        };
      }
      const result = adapter.evaluate(input, expectation.evaluation.target);
      return {
        id: `hidden-${expectation.id}`,
        description: expectation.description,
        outcome: result.outcome,
        weight: expectation.severity === "critical" ? 3 : expectation.severity === "major" ? 2 : 1,
        ...(result.message === undefined ? {} : { message: result.message }),
        evidence: [...(result.evidence ?? [])],
      };
    });
}

function caseMatchesManifest(input: DeterministicCheckContext): DeterministicCheckResult {
  const matches = input.manifest.case.id === input.evaluationCase.id &&
    input.manifest.case.version === input.evaluationCase.version &&
    input.manifest.target.stage === input.stage;
  return {
    id: "case-manifest-consistency",
    description: "The case, version, and stage match the immutable run manifest.",
    outcome: matches ? "pass" : "fail",
    weight: 1,
    message: matches ? "Case identity and stage agree." : "Case identity, version, or stage differs.",
    evidence: [],
  };
}

function hiddenExpectationsAreIsolated(input: DeterministicCheckContext): DeterministicCheckResult {
  const view = createRunnableCaseView(input.evaluationCase, input.stage, input.manifest.variant);
  const serialized = JSON.stringify(view);
  const leakedIds = input.evaluationCase.hiddenExpectations
    .filter((expectation) => expectation.stage === input.stage)
    .map((expectation) => expectation.id)
    .filter((id) => serialized.includes(id));
  return {
    id: "hidden-expectations-isolated",
    description: "The runner-facing case projection excludes hidden evaluation expectations.",
    outcome: leakedIds.length === 0 ? "pass" : "fail",
    weight: 2,
    message: leakedIds.length === 0
      ? "No hidden expectation identifiers occur in the runner-facing projection."
      : `Leaked hidden expectation identifiers: ${leakedIds.join(", ")}`,
    evidence: [],
  };
}

function requiredDeliverablesExist(input: DeterministicCheckContext): DeterministicCheckResult[] {
  const stage = createRunnableCaseView(input.evaluationCase, input.stage, input.manifest.variant);
  const artifactPaths = input.artifacts.artifacts.map((artifact) => artifact.path);

  return stage.deliverables.filter((deliverable) => deliverable.required).map((deliverable) => {
    if (deliverable.path === undefined) {
      return {
        id: `deliverable-${deliverable.id}`,
        description: deliverable.description,
        outcome: "not-applicable" as const,
        weight: 1,
        message: "The required deliverable has no path, so existence needs a case-specific adapter.",
        evidence: [],
      };
    }

    const present = artifactPaths.some((artifactPath) =>
      artifactPath === deliverable.path || artifactPath.startsWith(`${deliverable.path}/`),
    );
    return {
      id: `deliverable-${deliverable.id}`,
      description: deliverable.description,
      outcome: present ? "pass" as const : "fail" as const,
      weight: 1,
      message: present
        ? `Artifact inventory contains ${deliverable.path}.`
        : `Artifact inventory does not contain ${deliverable.path}.`,
      evidence: [],
    };
  });
}

function declaredDeterministicChecks(
  input: DeterministicCheckContext,
  adapters: ReadonlyMap<string, DeterministicCheckAdapter>,
): DeterministicCheckResult[] {
  return input.evaluationCase.successCriteria
    .filter((criterion) => criterion.stage === input.stage && appliesToVariant(criterion.variants, input.manifest.variant))
    .filter((criterion) => criterion.measure.kind === "deterministic")
    .map((criterion) => {
      if (criterion.measure.kind !== "deterministic") throw new Error("unreachable");
      const adapter = adapters.get(criterion.measure.check);
      if (adapter === undefined) {
        return {
          id: `criterion-${criterion.id}`,
          description: criterion.description,
          outcome: "not-applicable" as const,
          weight: 1,
          message: `No deterministic adapter is registered for ${criterion.measure.check}.`,
          evidence: [],
        };
      }

      const result = adapter.evaluate(input, criterion.measure.target);
      return {
        id: `criterion-${criterion.id}`,
        description: adapter.description,
        outcome: result.outcome,
        weight: 1,
        ...(result.message === undefined ? {} : { message: result.message }),
        evidence: [...(result.evidence ?? [])],
      };
    });
}
