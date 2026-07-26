import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  TECHNICAL_QUALITY_DIMENSIONS,
  createPairedRevisionStatistics,
  parseEvaluationProfile,
  parseSubjectRun,
  type EvaluationProfile,
  type PairedRevisionStatistics,
} from "@seedspec/eval-core";
import { ExperimentPlanSchema } from "@seedspec/eval-harness";

export async function createPairedRevisionStatisticsFile(options: {
  plan: string;
  profiles: readonly string[];
  createdAt: string;
  out?: string;
}): Promise<{ statistics: PairedRevisionStatistics; path: string }> {
  const plan = ExperimentPlanSchema.parse(
    JSON.parse(await readFile(resolve(options.plan), "utf8")) as unknown,
  );
  if (plan.lineage === undefined) {
    throw new Error("Paired revision statistics require a plan with skill-revision lineage.");
  }
  const profilesByRunId = await loadProfilesByRunId(options.profiles);
  const candidateEnvelopes = new Map(
    plan.envelopes.map((envelope) => [envelope.manifest.runId, envelope]),
  );
  const grouped = new Map<string, Array<{
    pairId: string;
    previousRunId: string;
    candidateRunId: string;
    previous?: EvaluationProfile;
    candidate?: EvaluationProfile;
  }>>();
  for (const pair of plan.lineage.pairs) {
    const envelope = candidateEnvelopes.get(pair.candidateRunId);
    if (envelope === undefined) {
      throw new Error(`Paired candidate run is not present in the revision plan: ${pair.candidateRunId}`);
    }
    const guidanceDelivery = typeof envelope.manifest.configuration?.["guidanceDelivery"] === "string"
      ? envelope.manifest.configuration["guidanceDelivery"]
      : envelope.manifest.variant;
    const key = [
      envelope.manifest.case.id,
      guidanceDelivery,
      envelope.manifest.model.modelId,
    ].join("\0");
    const entries = grouped.get(key) ?? [];
    const previous = profilesByRunId.get(pair.previousRunId);
    const candidate = profilesByRunId.get(pair.candidateRunId);
    if (previous !== undefined) {
      assertComparableProfile(previous, {
        caseId: envelope.manifest.case.id,
        caseVersion: envelope.manifest.case.version,
        caseDigest: envelope.manifest.case.digest,
        stage: envelope.manifest.target.stage,
        requestedModel: envelope.manifest.model.modelId,
      });
    }
    if (candidate !== undefined) {
      assertComparableProfile(candidate, {
        caseId: envelope.manifest.case.id,
        caseVersion: envelope.manifest.case.version,
        caseDigest: envelope.manifest.case.digest,
        stage: envelope.manifest.target.stage,
        requestedModel: envelope.manifest.model.modelId,
      });
    }
    entries.push({
      pairId: pair.pairId,
      previousRunId: pair.previousRunId,
      candidateRunId: pair.candidateRunId,
      ...(previous === undefined ? {} : { previous }),
      ...(candidate === undefined ? {} : { candidate }),
    });
    grouped.set(key, entries);
  }

  const groups = [...grouped].map(([key, pairs]) => {
    const [caseId, guidanceDelivery, requestedModel] =
      key.split("\0") as [string, string, string];
    const complete = pairs.filter(
      (pair): pair is typeof pair & { previous: EvaluationProfile; candidate: EvaluationProfile } =>
        pair.previous !== undefined && pair.candidate !== undefined,
    );
    const verifiedModelPairs = complete.filter(({ previous, candidate }) =>
      previous.subject.model?.status === "verified"
      && candidate.subject.model?.status === "verified").length;
    const missingProfileRunIds = pairs.flatMap(({ previous, candidate, previousRunId, candidateRunId }) => [
      ...(previous === undefined ? [previousRunId] : []),
      ...(candidate === undefined ? [candidateRunId] : []),
    ]);
    return {
      caseId,
      guidanceDelivery,
      requestedModel,
      plannedPairs: pairs.length,
      completePairs: complete.length,
      verifiedModelPairs,
      evidenceTier: complete.length >= 5 ? "confirmation-eligible" as const : "screening" as const,
      modelIdentityScope: verifiedModelPairs >= 5
        ? "served-model-verified" as const
        : "requested-model-only" as const,
      pairIds: pairs.map(({ pairId }) => pairId),
      missingProfileRunIds,
      metrics: summarizeTechnicalMetrics(complete),
    };
  }).toSorted((left, right) =>
    `${left.caseId}\0${left.guidanceDelivery}\0${left.requestedModel}`
      .localeCompare(`${right.caseId}\0${right.guidanceDelivery}\0${right.requestedModel}`));

  const statistics = createPairedRevisionStatistics({
    schemaVersion: 1,
    createdAt: options.createdAt,
    planId: plan.planId,
    previousPlanId: plan.lineage.previousPlanId,
    hypothesis: plan.lineage.hypothesis,
    minimumConfirmationPairs: 5,
    groups,
    method: {
      center: "median",
      spread: "Tukey hinges over paired deltas",
      directionTest: "two-sided exact sign test excluding ties",
      multiplicity: "No automatic multi-metric winner or uncorrected significance claim is produced.",
    },
    limitations: [
      "Confirmation eligibility requires at least five complete predeclared pairs in a comparable case, guidance-delivery arm, and requested model.",
      "Served-model claims require at least five pairs in which both provider model identities were verified; otherwise the group is scoped only to the requested model.",
      "Ordinal technical dimensions are summarized separately. They are never averaged into an aggregate score or winner.",
      "Process token, duration, and tool-call metrics are reported separately when captured; they are not converted into dollar cost or combined with quality.",
      "The exact sign-test p-value is descriptive unless the metric and decision threshold were predeclared; no multiplicity correction is applied automatically.",
    ],
  });
  const defaultOut = `runs/paired-statistics-${options.createdAt.replaceAll(/[:.]/g, "-")}.json`;
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  return { statistics, path };
}

export async function loadProfilesByRunId(
  profileFiles: readonly string[],
): Promise<Map<string, EvaluationProfile>> {
  const profilesByRunId = new Map<string, EvaluationProfile>();
  for (const file of profileFiles) {
    const profilePath = resolve(file);
    const profile = parseEvaluationProfile(
      JSON.parse(await readFile(profilePath, "utf8")) as unknown,
    );
    if (profile.subject.runId === undefined) {
      throw new Error(`Profile ${profile.profileId} does not identify a run.`);
    }
    const runIds = new Set([profile.subject.runId]);
    const subjectRunPath = resolve(dirname(profilePath), "subject-run.json");
    try {
      const subjectRun = parseSubjectRun(
        JSON.parse(await readFile(subjectRunPath, "utf8")) as unknown,
      );
      if (subjectRun.runId !== profile.subject.runId) {
        throw new Error(
          `Profile ${profile.profileId} identifies run ${profile.subject.runId}, `
          + `but its subject receipt identifies ${subjectRun.runId}.`,
        );
      }
      if (subjectRun.sourceRunId !== undefined) runIds.add(subjectRun.sourceRunId);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    for (const runId of runIds) {
      const existing = profilesByRunId.get(runId);
      if (existing !== undefined && existing.profileId !== profile.profileId) {
        throw new Error(`Multiple profiles supplied for run ${runId}.`);
      }
      profilesByRunId.set(runId, profile);
    }
  }
  return profilesByRunId;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function summarizeTechnicalMetrics(
  pairs: readonly { previous: EvaluationProfile; candidate: EvaluationProfile }[],
) {
  const definitions = [
    ...TECHNICAL_QUALITY_DIMENSIONS.map((dimension) => ({
      metric: `technical.${dimension}`,
      direction: "higher-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined => {
        const assessment = profile.technical?.quality?.dimensions.find(
          (entry) => entry.dimension === dimension,
        );
        return assessment?.status === "assessed" ? assessment.level : undefined;
      },
    })),
    {
      metric: "technical.open-critical-findings",
      direction: "lower-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined =>
        profile.technical?.quality === undefined
          ? undefined
          : profile.technical.quality.findings.filter(
              ({ status, severity }) => status === "open" && severity === "critical",
            ).length,
    },
    {
      metric: "technical.open-material-findings",
      direction: "lower-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined =>
        profile.technical?.quality === undefined
          ? undefined
          : profile.technical.quality.findings.filter(
              ({ status, severity }) => status === "open" && severity === "material",
            ).length,
    },
    {
      metric: "process.tokens-total",
      direction: "lower-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined =>
        profile.process?.tokens?.total,
    },
    {
      metric: "process.duration-ms",
      direction: "lower-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined =>
        profile.process?.durationMs,
    },
    {
      metric: "process.tool-calls",
      direction: "lower-is-better" as const,
      value: (profile: EvaluationProfile): number | undefined =>
        profile.process?.toolCalls,
    },
  ];
  return definitions.flatMap((definition) => {
    const values = pairs.flatMap(({ previous, candidate }) => {
      const previousValue = definition.value(previous);
      const candidateValue = definition.value(candidate);
      return previousValue === undefined || candidateValue === undefined
        ? []
        : [{ previous: previousValue, candidate: candidateValue }];
    });
    if (values.length === 0) return [];
    const deltas = values.map(({ previous, candidate }) => candidate - previous);
    const directions = deltas.map((delta) =>
      definition.direction === "higher-is-better" ? Math.sign(delta) : -Math.sign(delta));
    const nonTies = directions.filter((direction) => direction !== 0);
    const improved = directions.filter((direction) => direction > 0).length;
    const regressed = directions.filter((direction) => direction < 0).length;
    return [{
      metric: definition.metric,
      direction: definition.direction,
      n: values.length,
      evidenceTier: values.length >= 5 ? "confirmation-eligible" as const : "screening" as const,
      previousMedian: median(values.map(({ previous }) => previous)),
      candidateMedian: median(values.map(({ candidate }) => candidate)),
      pairedDeltaMedian: median(deltas),
      pairedDeltaQ1: tukeyHinges(deltas).q1,
      pairedDeltaQ3: tukeyHinges(deltas).q3,
      improved,
      unchanged: directions.filter((direction) => direction === 0).length,
      regressed,
      ...(nonTies.length === 0
        ? {}
        : { exactSignTestPValue: exactTwoSidedSignPValue(improved, regressed) }),
    }];
  });
}

function assertComparableProfile(
  profile: EvaluationProfile,
  expected: {
    caseId: string;
    caseVersion: string;
    caseDigest: string;
    stage: "authorship" | "implementation";
    requestedModel: string;
  },
): void {
  if (profile.subject.case?.id !== expected.caseId
    || profile.subject.case.version !== expected.caseVersion
    || profile.subject.case.digest !== expected.caseDigest
    || profile.subject.stage !== expected.stage
    || profile.subject.model?.requested.modelId !== expected.requestedModel) {
    throw new Error(
      `Profile ${profile.profileId} is not comparable with its paired plan arm's case, stage, and requested model.`,
    );
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate the median of an empty sample.");
  const sorted = [...values].toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function tukeyHinges(values: readonly number[]): { q1: number; q3: number } {
  const sorted = [...values].toSorted((left, right) => left - right);
  if (sorted.length === 1) return { q1: sorted[0]!, q3: sorted[0]! };
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, middle);
  const upper = sorted.slice(sorted.length % 2 === 0 ? middle : middle + 1);
  return { q1: median(lower), q3: median(upper) };
}

function exactTwoSidedSignPValue(improved: number, regressed: number): number {
  const n = improved + regressed;
  const tail = Math.min(improved, regressed);
  let cumulative = 0;
  for (let successes = 0; successes <= tail; successes += 1) {
    cumulative += binomialCoefficient(n, successes) * 0.5 ** n;
  }
  return Math.min(1, 2 * cumulative);
}

function binomialCoefficient(n: number, k: number): number {
  const selected = Math.min(k, n - k);
  let coefficient = 1;
  for (let index = 1; index <= selected; index += 1) {
    coefficient = coefficient * (n - selected + index) / index;
  }
  return coefficient;
}
