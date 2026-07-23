# Gstack plan-engineering-review treatment

Status: completed exploratory treatment  
Date: 2026-07-23  
Plan ID:
`plan_cd6096e612d48a7964c7c1bc611a016a407cda0d782b7ad3b9dc0edbc3cc33e8`

This treatment tests whether the weak result in the first implementation-skill
experiment was a property of package-scoped skills or merely a property of a
lightweight skill.

It is exploratory evidence. Nothing from this experiment is a publication
recommendation.

## Treatment

The subject received the same authored
`sparse-neighborhood-tool-lending@1.1.0` package, implementation contract,
model selector, reasoning effort, isolation policy, executable verifier,
deterministic evaluator, and independent technical evaluator used in the first
experiment.

The changed treatment supplied gstack's `plan-eng-review` skill and its
`sections/review-sections.md` dependency from upstream commit
`a3259400a366593e0c909dd9ac3e59752efd2488`. The complete five-file guidance
bundle was content-addressed as
`sha256:626c570e1a7ae2f3c8b5930b4a5afe15e25a2f3eff1b3b57db385d2cf6367f38`.

The treatment used a declared headless adapter because the isolated subject did
not have the full interactive gstack environment. It:

- required a technical plan before implementation;
- applied gstack's scope, architecture, code-quality, test, performance,
  failure-mode, calibration, and completion reviews;
- selected the recommended complete option when it did not conflict with fixed
  package intent;
- reviewed and corrected realized code after implementation;
- skipped unavailable gstack binaries, telemetry, update checks, global brain,
  external review, and interactive question integrations.

This treatment is therefore labeled `gstack-plan-eng-review`. It is not
represented as an unmodified interactive gstack session.

Three repetitions used `openai/gpt-5.6-sol` at high reasoning effort.

A later matched Terra treatment is recorded in
[`implementation-model-skill-v1.md`](implementation-model-skill-v1.md).

## Result

All three subjects produced substantive applications, passed their declared
commands under independent execution, and scored 9 of 10 on the common
deterministic checks. As in all nine earlier runs, the unestablished criterion
was live narrow-viewport and keyboard usability.

### Shared comparison axes

| Treatment | Shared decisions | Shared obligations |
| --- | --- | --- |
| `no-guidance` | 17 aligned, 1 deviation | 18 covered, 6 partial |
| `embedded-guidance` | 18 aligned | 19 covered, 5 partial |
| `skill-guidance` (lightweight) | 18 aligned | 18 covered, 6 partial |
| `gstack-plan-eng-review` | 18 aligned | 21 covered, 3 partial |

Gstack produced the strongest shared obligation coverage in this case. All
three repetitions supplied distinguishing evidence for private membership,
marketplace exclusion, hostile-content exclusion, borrowing lifecycle, lender
custody, concurrent safety, and building-time behavior. Live phone-and-keyboard
evidence remained partial in every repetition.

One gstack repetition omitted a subject-specific operator invitation workflow.
That behavior was not a predeclared shared comparison axis, so it is recorded as
one additional uncovered obligation rather than silently folded into the
shared counts.

### Process capture

Values are means over three repetitions. Total token values include cached
input reads when the provider reported them.

| Treatment | Turns | Total tokens | Output tokens | Duration |
| --- | ---: | ---: | ---: | ---: |
| `no-guidance` | 1.0 | 1,701,299 | 40,450 | 13.85 min |
| `embedded-guidance` | 1.0 | 1,963,469 | 43,512 | 14.68 min |
| `skill-guidance` (lightweight) | 1.0 | 3,052,993 | 53,674 | 18.87 min |
| `gstack-plan-eng-review` | 1.0 | 6,486,074 | 64,860 | 22.85 min |

Compared with the lightweight skill, gstack used about 112% more total tokens,
produced about 21% more output tokens, and took about 21% longer. Compared with
no guidance, it used about 281% more total tokens and took about 65% longer.
The large total-token increase is dominated by repeated input and cached-input
processing rather than a proportional increase in generated output. The
one-shot runner again produced no turn-count gradient.

Lower cost is not an objective by itself, but the additional process cost is
material and should remain visible when an author chooses this guidance.

## Engineering observations

The gstack workflow visibly changed implementation behavior rather than merely
supplying generic facts:

- every repetition produced an architecture and verification plan before
  coding;
- each plan recorded accepted review recommendations and a failure-mode
  matrix;
- post-implementation review corrected supported defects, including authority
  check ordering, persisted-state cross-reference validation, an incorrect HTTP
  method, Node-version compatibility, configuration application, and
  sandbox-compatible handler testing;
- the resulting tests covered authorization failures, unchanged state after
  rejection, first-wins concurrency, idempotency, persistence rollback,
  malformed storage or input, and disagreement states.

The independent evaluator found no gstack repetition with the lightweight
treatment's returned-custody projection defect or an equivalent failed
state-transition review.

The stronger procedure did not guarantee completeness:

- one repetition omitted the operator invitation action;
- one retained a logout-token revocation weakness and did not render custody
  event history in the client;
- one had a deployment-sensitive authentication hardening concern;
- all three substituted static or handler-level evidence for live browser
  usability.

Each self-authored gstack completion review claimed no supported open finding,
while the independent evaluator still found material concerns. A
post-implementation self-review is useful evidence of process, but it is not
independent proof of quality.

## Interpretation

This experiment rejects the broad interpretation that package-scoped skills
are inherently an anti-pattern. A sufficiently procedural, high-quality skill
can improve an agent's planning, failure analysis, test design, and
post-implementation correction.

It also rejects the idea that more skill is automatically better. The observed
gain was expensive, did not solve the common evidence-design weakness, and did
not eliminate missing behavior or technical concerns.

The supported SeedSpec direction is:

1. Let authors include or reference implementation skills when they want a
   particular engineering lens or process.
2. Have execution tooling explicitly direct the implementing agent to consult
   those skills and record the exact guidance identity, consultation, produced
   artifacts, skipped capabilities, and limitations.
3. Describe consultation as recommended or author-directed guidance, not a
   behavior the protocol can enforce.
4. Keep implementation skills distinct from acceptance obligations. A skill
   can improve the work; naming or consulting it does not prove the result.
5. Do not silently apply a heavy procedural skill to every package. Its cost
   and opinionated process should be an attributable author or end-user choice.

The first lightweight treatment showed that familiar principles packaged as a
skill may add cost without adding a meaningful gradient. This treatment shows
that a skill becomes valuable when it supplies an executable reasoning
procedure the model would not otherwise perform consistently.

## Lab findings

This treatment exposed two evaluation-lab issues:

- One subject added an undeclared `criterion` annotation to every acceptance
  scenario. Verification now preserves the original artifact and digest,
  records each extra field as a conformance diagnostic, and strips only those
  fields into a compatibility view. Semantic or structural errors still fail
  closed.
- The local runner records the declared subject duration limit but does not yet
  enforce it. Earlier treatments also exceeded that limit, so the policy was
  not changed mid-comparison. Duration remains observed evidence, not a valid
  timeout result, until runner enforcement exists.

## Artifacts

- `runs/implementation-gstack-v1-plan.json`
- `runs/implementation-gstack-v1-comparison.json`
- `runs/implementation-gstack-v1-comparison.md`

Run, trace, verification, scorecard, decision-ledger, profile-evidence, and
evaluation-profile artifacts remain in their isolated run directories. The
comparison preserves all twelve profiles and does not calculate a composite
winner.
