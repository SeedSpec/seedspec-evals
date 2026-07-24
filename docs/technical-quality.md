# Independent technical quality evaluation

SeedSpec evaluation deliberately separates two questions that previous lab
output allowed readers to conflate:

1. Did the run preserve its identity, produce required artifacts, and pass the
   declared outcome checks?
2. How strong is the resulting implementation?

`evaluate deterministic` answers only the first question. Its output is a
contract/integrity gate with three unweighted categories:

- run integrity;
- artifact contract; and
- outcome contract.

The gate reports passed, failed, and unevaluated checks. Historical weighted
totals remain parseable in schema-v1 scorecards, but the CLI does not present
them as a score and will not rank deterministic scorecards by their totals.
Passing every contract check does not establish security, reliability,
maintainability, flexibility, accessibility, or test depth.

The on-disk filename `deterministic-scorecard.json` remains temporarily for
runner compatibility. New CLI and profile-evidence output labels its meaning as
`run-contract-and-integrity` and omits the legacy weighted summary from the
independent evaluator's evidence envelope.

## Technical quality vector

Implementation profiles use the same independent dimension set regardless of
which implementation skill, model, harness, framework, or process produced the
subject:

- correctness;
- meaningfulness;
- maintainability;
- flexibility;
- security;
- reliability;
- performance;
- accessibility;
- test quality;
- evidence quality; and
- implementation-profile conformance.

Each dimension is `assessed`, `unknown`, or `not-applicable`. An assessed
dimension receives one ordinal level:

| Level | Anchor | Meaning |
|---:|---|---|
| 0 | Compromised | Observed behavior is unsafe, incorrect, nonfunctional, or fundamentally unfit. |
| 1 | Fragile | Material weaknesses remain or a plausible adverse condition defeats the design. |
| 2 | Serviceable | Core expectations are credibly met with bounded, material weaknesses. |
| 3 | Robust | Negative, failure, boundary, or change evidence is credible and no open material weakness dominates. |
| 4 | Exceptional | Unusually strong independent evidence demonstrates resilience beyond ordinary production adequacy. |

The levels are ordinal anchors, not interval measurements. They must not be
summed or averaged. A level requires cited evidence. An unknown dimension
receives no level and cannot silently count as passing.

Findings are recorded separately with dimension, severity, status, and evidence.
An open critical finding requires level 0 in its dimension and makes readiness
`blocked`. An open material finding caps its dimension at level 2. A critical
or material finding whose status is unknown makes that dimension unknown.
Otherwise, any unknown dimension makes readiness `indeterminate`. With complete
evidence, the lowest assessed level determines `high-risk`, `serviceable`,
`robust`, or `exceptional`. This readiness label is a conservative evidence
summary, not a normalized quality score.

Security and reliability need adverse-path evidence to reach level 3. Test
quality needs meaningful production-path negative or boundary cases. Evidence
quality needs independently reproducible and distinguishing support.
Maintainability needs bounded propagation for a material local change, not
readability alone. Flexibility can be assessed through structure at levels 0–2,
but robust or exceptional flexibility requires a captured adaptation or
equivalent observed change.

## Independence from implementation skills

The technical rubric does not award credit for consulting a skill, completing a
named gate, writing a plan, or producing a suite-execution report. Those
artifacts may point the evaluator toward evidence, but the evaluator scores the
observed implementation and independently captured outcomes.

This separation lets SeedSpec improve implementation skills against a stable
technical target without teaching the evaluator to recognize the skill's own
vocabulary.

## Blind comparison protocol

When treatment identity could bias a technical judge:

1. preserve the complete run for audit;
2. create an evaluator view with opaque run labels;
3. withhold treatment names and process-only artifacts such as
   `SUITE_EXECUTION.md`;
4. retain source intent, implementation files, independently executed
   verification, and evidence needed to reproduce findings;
5. finalize the technical vector before reattaching treatment identity; and
6. compare vectors and findings only after unblinding.

The current combined profile envelope retains treatment identity for decision
and process analysis. Fully blinded technical judging therefore requires a
separate evaluator view; until that view is implemented, profiles must disclose
the limitation.

## Sensitivity tests

Rubric validation should use controlled implementation mutations rather than
implementation-skill vocabulary. Starting from one preserved realization:

- remove the server-side authorization boundary;
- break persistence rollback or restart recovery;
- replace genuinely simultaneous execution with sequential calls;
- scatter one changeable policy across unrelated modules;
- replace behavioral assertions with shallow existence tests; or
- remove keyboard and semantic interface behavior.

Only the relevant dimensions should decline, unrelated dimensions should remain
stable, and uncertainty should increase when evidence is removed. This
metamorphic test checks evaluator sensitivity without fitting the rubric to a
particular gate suite.
