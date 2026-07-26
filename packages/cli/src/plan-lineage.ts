import {
  contentId,
  stableJson,
  type JsonValue,
} from "@seedspec/eval-core";
import {
  ExperimentPlanSchema,
  type ExperimentPlan,
} from "@seedspec/eval-harness";

export function attachSkillRevisionLineage(options: {
  candidate: ExperimentPlan;
  previous: ExperimentPlan;
  hypothesis: string;
}): ExperimentPlan {
  const candidate = ExperimentPlanSchema.parse(options.candidate);
  const previous = ExperimentPlanSchema.parse(options.previous);
  const hypothesis = options.hypothesis.trim();
  if (hypothesis.length === 0) {
    throw new Error("A paired skill-revision plan requires a predeclared revision hypothesis.");
  }

  const previousGroups = groupComparableRuns(previous);
  const candidateGroups = groupComparableRuns(candidate);
  const pairs: Array<{
    pairId: `pair_${string}`;
    previousRunId: string;
    candidateRunId: string;
  }> = [];

  for (const [key, candidateRunIds] of candidateGroups) {
    const previousRunIds = previousGroups.get(key);
    if (previousRunIds === undefined) {
      throw new Error(
        `Previous plan ${previous.planId} has no comparable arm for ${describeComparisonKey(key)}.`,
      );
    }
    if (previousRunIds.length !== candidateRunIds.length) {
      throw new Error(
        `Paired arm ${describeComparisonKey(key)} has ${String(previousRunIds.length)} previous run(s) `
        + `but ${String(candidateRunIds.length)} candidate run(s).`,
      );
    }
    for (const [index, candidateRunId] of candidateRunIds.entries()) {
      const previousRunId = previousRunIds[index]!;
      const body = { previousRunId, candidateRunId };
      pairs.push({
        pairId: contentId("pair", body),
        ...body,
      });
    }
  }

  const lineage = {
    relation: "skill-revision" as const,
    previousPlanId: previous.planId,
    hypothesis,
    pairs,
  };
  const body = {
    createdAt: candidate.createdAt,
    envelopes: candidate.envelopes,
    lineage,
  };
  return ExperimentPlanSchema.parse({
    schemaVersion: 1,
    planId: contentId("plan", body as unknown as JsonValue),
    ...body,
  });
}

function groupComparableRuns(plan: ExperimentPlan): Map<string, string[]> {
  const groups = new Map<string, Array<{ repetition: number; runId: string }>>();
  for (const { manifest } of plan.envelopes) {
    const key = stableJson({
      case: manifest.case,
      target: manifest.target,
      variant: manifest.variant,
      protocol: manifest.protocol,
      runner: manifest.runner,
      model: manifest.model,
      guidanceDelivery: manifest.configuration?.["guidanceDelivery"] ?? null,
      skillAdapter: manifest.configuration?.["skillAdapter"] ?? null,
    } as unknown as JsonValue);
    const values = groups.get(key) ?? [];
    values.push({ repetition: manifest.repetition, runId: manifest.runId });
    groups.set(key, values);
  }
  return new Map(
    [...groups].map(([key, values]) => [
      key,
      values
        .toSorted((left, right) => left.repetition - right.repetition)
        .map(({ runId }) => runId),
    ]),
  );
}

function describeComparisonKey(key: string): string {
  const parsed = JSON.parse(key) as {
    case?: { id?: unknown; version?: unknown };
    target?: { stage?: unknown };
    model?: { modelId?: unknown };
    guidanceDelivery?: unknown;
  };
  return [
    `${String(parsed.case?.id)}@${String(parsed.case?.version)}`,
    String(parsed.target?.stage),
    String(parsed.model?.modelId),
    String(parsed.guidanceDelivery),
  ].join(" / ");
}
