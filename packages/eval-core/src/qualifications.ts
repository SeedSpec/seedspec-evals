import { z } from "zod";

import {
  IdentifierSchema,
  IsoTimestampSchema,
  SafeRelativePathSchema,
  SemVerSchema,
  Sha256DigestSchema,
  TechnicalDimensionSchema,
  addUniqueIdIssues,
  contentId,
  deepFreeze,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";

export const CounterfactualClassificationSchema = z.enum([
  "known-bad",
  "valid-alternative",
  "calibration",
]);

export const CounterfactualCandidateSchema = z.strictObject({
  id: IdentifierSchema,
  classification: CounterfactualClassificationSchema,
  description: z.string().trim().min(1).max(8_000),
  artifact: z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema,
  }),
  expected: z.strictObject({
    acceptability: z.enum(["accept", "reject"]),
    rationale: z.string().trim().min(1).max(8_000),
    dimensions: z.array(z.strictObject({
      dimension: TechnicalDimensionSchema,
      expectation: z.enum(["must-detect-concern", "must-not-penalize", "calibrate"]),
      rationale: z.string().trim().min(1).max(4_000),
    })).max(64),
  }),
});

export const QualificationProbeSchema = z.strictObject({
  id: IdentifierSchema,
  candidateId: IdentifierSchema,
  kind: z.enum(["false-positive", "false-negative", "calibration"]),
  technique: z.string().trim().min(1).max(8_000),
  expectedDisposition: z.enum(["accept", "reject"]),
  observedDisposition: z.enum(["accept", "reject", "mixed", "not-run"]),
  assessment: z.string().trim().min(1).max(8_000),
  evidence: z.array(z.strictObject({
    path: SafeRelativePathSchema,
    digest: Sha256DigestSchema.optional(),
    note: z.string().trim().min(1).max(4_000),
  })).max(128),
});

const CaseQualificationBodyDataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  case: z.strictObject({
    id: IdentifierSchema,
    version: SemVerSchema,
    digest: Sha256DigestSchema,
  }),
  createdAt: IsoTimestampSchema,
  status: z.enum(["draft", "qualified"]),
  candidates: z.array(CounterfactualCandidateSchema).min(1).max(256),
  probes: z.array(QualificationProbeSchema).min(1).max(1_000),
  review: z.strictObject({
    reviewer: z.string().trim().min(1).max(256),
    reviewedAt: IsoTimestampSchema,
    summary: z.string().trim().min(1).max(16_000),
    limitations: z.array(z.string().trim().min(1).max(8_000)).max(128),
  }),
}).superRefine((qualification, context) => {
  addUniqueIdIssues(qualification.candidates, context, ["candidates"]);
  addUniqueIdIssues(qualification.probes, context, ["probes"]);
  const candidates = new Map(qualification.candidates.map((candidate) => [candidate.id, candidate]));

  for (const [index, probe] of qualification.probes.entries()) {
    const candidate = candidates.get(probe.candidateId);
    if (candidate === undefined) {
      context.addIssue({
        code: "custom",
        message: `probe references unknown candidate ${probe.candidateId}`,
        path: ["probes", index, "candidateId"],
      });
      continue;
    }
    if (probe.expectedDisposition !== candidate.expected.acceptability) {
      context.addIssue({
        code: "custom",
        message: `probe disposition must match candidate expectation ${candidate.expected.acceptability}`,
        path: ["probes", index, "expectedDisposition"],
      });
    }
    if (probe.kind === "false-positive" && candidate.classification !== "known-bad") {
      context.addIssue({
        code: "custom",
        message: "false-positive probes must target known-bad candidates",
        path: ["probes", index, "candidateId"],
      });
    }
    if (probe.kind === "false-negative" && candidate.classification !== "valid-alternative") {
      context.addIssue({
        code: "custom",
        message: "false-negative probes must target valid-alternative candidates",
        path: ["probes", index, "candidateId"],
      });
    }
  }
  for (const [index, candidate] of qualification.candidates.entries()) {
    const requiredDisposition = candidate.classification === "known-bad"
      ? "reject"
      : candidate.classification === "valid-alternative"
        ? "accept"
        : undefined;
    if (
      requiredDisposition !== undefined
      && candidate.expected.acceptability !== requiredDisposition
    ) {
      context.addIssue({
        code: "custom",
        message: `${candidate.classification} candidates must be expected to ${requiredDisposition}`,
        path: ["candidates", index, "expected", "acceptability"],
      });
    }
  }

  if (qualification.status !== "qualified") return;
  const requirements = [
    {
      met: qualification.candidates.some(({ classification }) => classification === "known-bad"),
      message: "qualified cases require at least one known-bad counterfactual",
      path: ["candidates"],
    },
    {
      met: qualification.candidates.some(({ classification }) => classification === "valid-alternative"),
      message: "qualified cases require at least one valid-alternative counterfactual",
      path: ["candidates"],
    },
    {
      met: qualification.probes.some(({ kind }) => kind === "false-positive"),
      message: "qualified cases require a false-positive hack attempt",
      path: ["probes"],
    },
    {
      met: qualification.probes.some(({ kind }) => kind === "false-negative"),
      message: "qualified cases require a false-negative alternative-solution attempt",
      path: ["probes"],
    },
  ] as const;
  for (const requirement of requirements) {
    if (!requirement.met) {
      context.addIssue({ code: "custom", message: requirement.message, path: [...requirement.path] });
    }
  }
  for (const [index, probe] of qualification.probes.entries()) {
    if (probe.observedDisposition === "not-run") {
      context.addIssue({
        code: "custom",
        message: "qualified cases cannot contain unrun probes",
        path: ["probes", index, "observedDisposition"],
      });
    } else if (probe.observedDisposition !== probe.expectedDisposition) {
      context.addIssue({
        code: "custom",
        message: `probe is misclassified; expected ${probe.expectedDisposition}`,
        path: ["probes", index, "observedDisposition"],
      });
    }
    if (probe.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        message: "qualified probes require evidence",
        path: ["probes", index, "evidence"],
      });
    }
    for (const [evidenceIndex, evidence] of probe.evidence.entries()) {
      if (evidence.digest === undefined) {
        context.addIssue({
          code: "custom",
          message: "qualified probe evidence must be content-addressed",
          path: ["probes", index, "evidence", evidenceIndex, "digest"],
        });
      }
    }
  }
});

export const CaseQualificationBodySchema = CaseQualificationBodyDataSchema;

const CaseQualificationDataSchema = CaseQualificationBodyDataSchema.safeExtend({
  qualificationId: z.string().regex(/^qualification_[a-f0-9]{64}$/),
}).superRefine((qualification, context) => {
  const { qualificationId, ...body } = qualification;
  const parsed = CaseQualificationBodyDataSchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("qualification", parsed.data as unknown as JsonValue);
  if (qualificationId !== expected) {
    context.addIssue({
      code: "custom",
      message: `qualificationId does not match content; expected ${expected}`,
      path: ["qualificationId"],
    });
  }
});

export const CaseQualificationSchema =
  CaseQualificationDataSchema.transform((value) => deepFreeze(value));

export type CounterfactualClassification = z.infer<typeof CounterfactualClassificationSchema>;
export type CounterfactualCandidate = z.infer<typeof CounterfactualCandidateSchema>;
export type QualificationProbe = z.infer<typeof QualificationProbeSchema>;
export type CaseQualificationBody = z.infer<typeof CaseQualificationBodyDataSchema>;
export type CaseQualification = DeepReadonly<z.infer<typeof CaseQualificationDataSchema>>;

export function createCaseQualification(input: CaseQualificationBody): CaseQualification {
  const body = CaseQualificationBodyDataSchema.parse(input);
  return CaseQualificationSchema.parse({
    ...body,
    qualificationId: contentId("qualification", body as unknown as JsonValue),
  });
}

export function parseCaseQualification(input: unknown): CaseQualification {
  return CaseQualificationSchema.parse(input);
}
