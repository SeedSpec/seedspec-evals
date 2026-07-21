import {
  CongruencyReportSchema,
  RunComparisonReportSchema,
  deriveCongruencyStatus,
  type AdversarialFinding,
  type CaseReference,
  type ComparisonMetric,
  type CongruencyDimension,
  type CongruencyReport,
  type RunComparisonReport,
  type Scorecard,
} from "@seedspec/eval-core";

export interface CongruencyReportInput {
  readonly id: string;
  readonly case: CaseReference;
  readonly createdAt: string;
  readonly dimensions: readonly CongruencyDimension[];
  readonly summary: string;
}

export function createCongruencyReport(input: CongruencyReportInput): CongruencyReport {
  const runIds = collectRunIds(input.dimensions);
  return CongruencyReportSchema.parse({
    schemaVersion: 1,
    id: input.id,
    case: input.case,
    runIds,
    createdAt: input.createdAt,
    dimensions: input.dimensions,
    status: deriveCongruencyStatus(input.dimensions),
    summary: input.summary,
  });
}

export function scorecardMetrics(scorecards: readonly Scorecard[]): ComparisonMetric[] {
  requireComparableScorecards(scorecards);
  const metrics: ComparisonMetric[] = [
    {
      id: "overall-score",
      label: "Normalized evaluator score",
      unit: "ratio",
      preferredDirection: "higher",
      values: scorecards.map((scorecard) => ({
        runId: scorecard.runId,
        value: scorecard.summary.normalized,
      })),
    },
  ];

  const kind = scorecards[0]?.kind;
  if (kind === "rubric" && scorecards.every((scorecard) => scorecard.kind === "rubric")) {
    const ids = commonIds(scorecards.map((scorecard) => scorecard.criteria.map((criterion) => criterion.id)));
    for (const id of ids) {
      metrics.push({
        id: `rubric-${id}`,
        label: `Rubric criterion: ${id}`,
        unit: "ratio",
        preferredDirection: "higher",
        values: scorecards.map((scorecard) => {
          if (scorecard.kind !== "rubric") throw new Error("Scorecard kinds changed during comparison");
          const criterion = scorecard.criteria.find((candidate) => candidate.id === id);
          return { runId: scorecard.runId, value: criterion === undefined ? null : criterion.points / criterion.maxPoints };
        }),
      });
    }
  }

  return metrics;
}

export interface RunComparisonInput {
  readonly id: string;
  readonly scorecards: readonly Scorecard[];
  readonly congruency: CongruencyReport;
  readonly createdAt: string;
  readonly baselineRunId?: string;
  readonly adversarialFindings?: readonly AdversarialFinding[];
}

export function createRunComparison(input: RunComparisonInput): RunComparisonReport {
  requireComparableScorecards(input.scorecards);
  const runIds = input.scorecards.map((scorecard) => scorecard.runId);
  return RunComparisonReportSchema.parse({
    schemaVersion: 1,
    id: input.id,
    case: input.scorecards[0]?.case,
    runIds,
    ...(input.baselineRunId === undefined ? {} : { baselineRunId: input.baselineRunId }),
    createdAt: input.createdAt,
    metrics: scorecardMetrics(input.scorecards),
    congruency: input.congruency,
    adversarialFindings: input.adversarialFindings ?? [],
  });
}

function requireComparableScorecards(scorecards: readonly Scorecard[]): void {
  if (scorecards.length < 2) throw new Error("At least two scorecards are required");
  const first = scorecards[0];
  if (first === undefined) throw new Error("At least two scorecards are required");
  const runIds = new Set<string>();
  for (const scorecard of scorecards) {
    if (scorecard.case.id !== first.case.id ||
      scorecard.case.version !== first.case.version ||
      scorecard.case.digest !== first.case.digest ||
      scorecard.stage !== first.stage ||
      scorecard.kind !== first.kind) {
      throw new Error("Scorecards must share case, case digest, stage, and evaluator kind");
    }
    if (runIds.has(scorecard.runId)) throw new Error(`Duplicate run ID: ${scorecard.runId}`);
    runIds.add(scorecard.runId);
  }
}

function collectRunIds(dimensions: readonly CongruencyDimension[]): string[] {
  if (dimensions.length === 0) throw new Error("At least one congruency dimension is required");
  return dimensions[0]?.observations.map((observation) => observation.runId) ?? [];
}

function commonIds(idSets: readonly (readonly string[])[]): string[] {
  const first = idSets[0] ?? [];
  return first.filter((id) => idSets.every((ids) => ids.includes(id))).sort();
}
