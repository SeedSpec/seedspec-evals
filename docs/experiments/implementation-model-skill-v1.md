# Model capability and implementation-skill interaction

Status: completed exploratory matrix  
Date: 2026-07-23

Plans:

- Sol lightweight:
  `plan_fad8f91293fc73e45cc6044e272b2393c9556a45ac7bc5d2c796f49efc3408a1`
- Sol gstack:
  `plan_cd6096e612d48a7964c7c1bc611a016a407cda0d782b7ad3b9dc0edbc3cc33e8`
- Terra lightweight:
  `plan_c0d0ee6bfe1626f7ae0f1b0035241ca9528cb065b7ea661167c5c76b7cd10578`
- Terra gstack:
  `plan_fc8d4f55d45ef8146d0e803c53f834908e80fd89fb57f0af8450f68bf56b5755`

This experiment asks whether a stronger procedural skill can compensate for a
less-capable implementation model.

It is exploratory evidence. Nothing in this report is a publication
recommendation.

## Design

The matrix holds constant:

- the authored `sparse-neighborhood-tool-lending@1.1.0` package;
- the implementation case and fixed comparison axes;
- high implementation reasoning effort;
- the runner and isolation policy;
- executable verification and deterministic checks;
- the frozen technical-evaluation skills;
- GPT-5.6 Sol at high reasoning effort as the independent evaluator.

It varies:

| Factor | Values |
| --- | --- |
| Implementing model | GPT-5.6 Sol, GPT-5.6 Terra |
| Implementation guidance | Lightweight stateful-workflow skill, adapted gstack `plan-eng-review` |

Each cell has three repetitions. The Sol runs were completed previously. The
six Terra runs were executed as a matched follow-up.

## Results

All twelve implementations were substantive and runnable. Every declared local
verification command passed. Every implementation received 9 of 10 from the
common deterministic scorecard because live phone-and-keyboard evidence was
absent.

The independent Sol evaluator found a much larger quality gradient than that
score suggests.

### Shared comparison axes

Counts aggregate three repetitions. There are 18 shared decision observations
and 24 shared obligation observations in each cell.

| Implementer and treatment | Shared decisions | Shared obligations |
| --- | --- | --- |
| Sol + lightweight | 18 aligned | 18 covered, 6 partial |
| Sol + gstack | 18 aligned | 21 covered, 3 partial |
| Terra + lightweight | 8 aligned, 2 authorized variations, 7 deviations, 1 unknown | 9 covered, 15 partial |
| Terra + gstack | 12 aligned, 1 authorized variation, 5 deviations | 16 covered, 8 partial |

Gstack substantially improved Terra:

- covered obligations increased from 9 to 16 of 24;
- aligned decisions increased from 8 to 12 of 18;
- deviations decreased from 7 to 5;
- planning, failure-mode analysis, negative tests, and explicit review artifacts
  were more consistent.

Gstack did not make Terra equivalent to Sol:

- Terra + gstack remained below Sol + lightweight on shared obligations;
- every Sol run aligned with all six shared decision axes;
- every Terra run deviated from the fixed private-membership boundary;
- five of six Terra runs also weakened end-to-end lender authority, time,
  concurrency, or related fixed behavior.

### Recurring Terra failure

All six Terra implementations treated a caller-supplied or publicly selectable
resident identifier as identity. Domain methods rejected unknown IDs, but a
caller could impersonate a seeded resident, lender, or operator.

This is not merely an authentication-stack preference. The package delegates
the authentication mechanism while fixing the outcome that only current
operator-invited residents receive attributable access. The independent
evaluator therefore classified the implementations as deviations from the
membership boundary.

The stronger skill did not correct this semantic error. All three Terra gstack
plans ultimately declared engineering review clear with no critical gaps even
though the resulting implementation retained a forgeable identity boundary.
Two Terra gstack runs also exposed unescaped listing-name injection, and the
other retained invalid-calendar-date and disconnected-configuration concerns.

This suggests that the skill improved the amount and consistency of review but
could not supply judgment the implementing model failed to exercise.

### Process and estimated API cost

Values are means over three repetitions. Cost uses standard GPT-5.6 API rates
on 2026-07-23 and provider-reported cached input. It excludes possible
long-context uplifts and non-model local computation.

| Implementer and treatment | Total tokens | Output tokens | Duration | Subject cost | Sol evaluation cost | Complete lab cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sol + lightweight | 3,052,993 | 53,674 | 18.87 min | $3.78 | $2.48 | $6.26 |
| Sol + gstack | 6,486,074 | 64,860 | 22.85 min | $6.02 | $2.40 | $8.42 |
| Terra + lightweight | 1,427,858 | 27,726 | 9.51 min | $0.91 | $1.48 | $2.40 |
| Terra + gstack | 2,280,894 | 29,580 | 10.06 min | $1.25 | $1.30 | $2.55 |

Within Terra, gstack cost about $0.34 and 33 seconds more per implementation
while producing a large obligation-coverage improvement. The additional
guidance was economically effective inside the Terra tier.

Terra + gstack was about 67% cheaper and 47% faster than Sol + lightweight, but
the savings came with a repeated critical authority defect and lower overall
adherence. It did not occupy the same quality point.

Sol + gstack remained the strongest observed cell. Sol + lightweight offered a
middle point: complete shared decision alignment and stronger adherence than
Terra + gstack at lower cost than Sol + gstack.

## Interpretation

The observed relationship is multiplicative rather than substitutive:

> A strong procedural skill amplifies model capability; it does not reliably
> replace model capability.

For Terra, gstack was clearly worthwhile compared with the lightweight skill.
It made the lower-cost model more systematic and materially improved evidence
coverage. But the procedure was often followed ceremonially: the plan named an
authority boundary, the self-review declared it clear, and the implementation
still let callers impersonate the authorized actor.

The current evidence supports:

1. Skill quality matters.
2. Model capability matters independently.
3. A high-quality skill can rescue a meaningful portion of a weaker model's
   performance.
4. The rescued result should not be assumed to match a stronger model.
5. Independent evaluation remains necessary because a skill-guided
   self-review can be confidently wrong.

## Lab findings

### Legacy deterministic score saturation

All twelve implementations received a legacy weighted contract result of 9 of
10 even though the independent
evaluator found critical identity deviations in all six Terra runs. The
deterministic suite currently detects the common browser-evidence gap but does
not adversarially test whether an outsider can impersonate a current resident.

The case should gain an executable identity-boundary probe that distinguishes:

- an invited resident with attributable identity;
- an unknown outsider;
- an outsider presenting a known resident identifier;
- a removed resident reusing a prior session;
- a borrower attempting to impersonate the lender.

This result is now labeled a contract/integrity gate and is never presented as
an implementation-quality score. Additional distinguishing checks can improve
the outcome contract, but security, reliability, maintainability, flexibility,
test depth, and evidence quality belong to the independent technical vector
rather than a larger deterministic total.

### Model identity in profile comparisons

Immutable run manifests and subject-run evidence record the implementing model,
but finalized evaluation-profile references currently carry the run, variant,
and treatment without carrying the subject model. The generic comparison
report would therefore merge Sol and Terra rows that share a treatment name.

This report joins each content-addressed profile back to its immutable run
manifest. Before the next cross-model experiment, model identity should become
part of the profile subject and every comparison reference.

### Evaluator economics

The fixed Sol evaluator cost more than the Terra implementation subject in this
matrix. Holding the judge constant was the correct experimental choice. If the
lab later runs at greater scale, a calibrated evaluator cascade may reduce
cost, but only after its agreement and miss rate are measured against Sol.

## Artifacts

- `runs/implementation-terra-lightweight-v1-plan.json`
- `runs/implementation-terra-gstack-v1-plan.json`
- `runs/implementation-sol-terra-skills-v1-comparison.json`
- `runs/implementation-sol-terra-skills-v1-comparison.md`

The readable generic comparison does not yet distinguish model identity; use
this report for the model-by-treatment grouping. Individual immutable
manifests, traces, executable verification records, deterministic scorecards,
profile evidence, evaluator captures, and finalized profiles remain in their
isolated run directories.
