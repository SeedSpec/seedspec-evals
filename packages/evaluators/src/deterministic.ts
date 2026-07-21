import {
  ScorecardSchema,
  calculateDeterministicSummary,
  createRunnableCaseView,
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
  checks.push(...requiredDeliverablesExist(input));
  checks.push(...declaredDeterministicChecks(input, adapterMap));

  const summary = calculateDeterministicSummary(checks);
  return ScorecardSchema.parse({
    schemaVersion: 1,
    id: "deterministic-contract",
    runId: input.manifest.runId,
    case: input.manifest.case,
    stage: input.stage,
    createdAt: input.createdAt,
    evaluator: {
      id: "seedspec-eval-deterministic",
      kind: "deterministic",
      version: "0.1.0-alpha.1",
    },
    kind: "deterministic",
    summary,
    checks,
  }) as DeterministicScorecard;
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
  const view = createRunnableCaseView(input.evaluationCase, input.stage);
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
  const stage = input.stage === "authorship" ? input.evaluationCase.authorship : input.evaluationCase.implementation;
  if (stage === undefined) return [];
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
    .filter((criterion) => criterion.stage === input.stage && criterion.measure.kind === "deterministic")
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
