# Native engineering skill optimization protocol

Status: completed after five revisions. Revision 4 was selected after revision
5 failed the held-out transfer check.

Selected skill digest:
`sha256:2ad78c31707d04567621e2579f8cdca8c40deea4e6262844d1d6492b62b2e6f9`.

This protocol freezes the comparison rules for improving
`engineer-seedspec-realizations`. It exists to prevent a favorable individual
run, a familiar benchmark, or evaluator wording from becoming the optimization
target.

## Question

Does the SeedSpec-native engineering skill reliably produce safer, more
complete, and better-supported realizations than ordinary agent judgment? Can
it match or improve on the useful effects previously observed from the gstack
and Compound Engineering treatments without depending on their release,
collaboration, or repository workflow?

## Revision limit

The optimization loop may test at most five skill revisions, including the
initial frozen skill as revision 1. A revision changes only the skill and its
references. The package, case, model, harness instructions, runtime limits,
verification procedure, and evaluator rubric remain fixed within the primary
comparison.

Each experiment plan content-addresses the complete skill directory. A revision
is identified by its plan, skill digest, and treatment label rather than an
unversioned working-tree path.

## Primary optimization case

- Case: `sparse-neighborhood-tool-lending`
- Authored package: the same frozen package used by the existing Sol gstack and
  Compound Engineering suite runs
- Implementing model: `openai/gpt-5.6-sol`
- Reasoning effort: high
- Repetitions: three per tested revision
- Treatment: package-scoped skill guidance

Sol is the primary implementing model because prior evidence showed that a
weaker implementation model can fail to apply even strong engineering
guidance. This loop measures the skill's useful influence, not its ability to
replace the base model's product and engineering judgment.

## Independent measurements

Every subject receives:

1. execution and artifact verification;
2. deterministic contract and trace-integrity evaluation;
3. the frozen independent technical-quality profile produced by
   `openai/gpt-5.6-sol` at high reasoning.

The technical profile is read as a vector, not an average or a single winner
score. Review:

- open critical and material findings;
- correctness, security, reliability, test quality, evidence quality,
  maintainability, flexibility, and readiness;
- obligation-to-evidence coverage and whether evidence is distinguishing;
- subject runtime, turns, tokens, cached input, and output;
- decisions or defects that the skill observably caused, prevented, or failed
  to catch.

Gate attendance, the existence of `REALIZATION_GATES.md`, consultation claims,
and self-reported completion do not count as implementation quality.

## Revision rule

Revise the skill only for a transferable weakness. A weakness is transferable
when it:

- appears materially in at least two independent primary runs; or
- appears once in the primary case and once in a different problem shape; or
- reveals an instruction that is internally contradictory or generally
  incapable of producing its stated control objective.

Do not revise for a one-off stylistic preference, evaluator vocabulary, an
implementation choice that governing intent deliberately leaves open, or a
problem already caused by the experiment harness.

Prefer the smallest instruction change likely to alter agent behavior. Record
the hypothesis before the next run and preserve any cost or complexity the
revision adds.

## Acceptance rule

A candidate revision advances only when it:

- removes or reduces a repeated material defect without introducing a new
  material defect;
- improves distinguishing evidence or honest readiness when behavior itself
  cannot be strengthened;
- preserves implementation latitude and proportionality; and
- does not merely teach the implementation skill to echo the evaluator.

An unchanged technical vector can still be an improvement when supported
findings show a real risk was removed inside the same ordinal band. A higher
vector with weaker evidence, policy invention, or benchmark-specific
prescription is not an improvement.

## Transfer check

The final candidate must be applied without further editing to a held-out
workflow with a different state model and authority boundary. The transfer
check is used to reject benchmark-specific changes, not to continue tuning.

If the final candidate does not transfer, retain the last transferable revision
and document the failed hypothesis.

## Comparators

After selecting the final native revision, compare its three primary runs with
preserved runs on the same package:

- no implementation skill;
- the gstack engineering suite;
- the Compound Engineering core loop.

The comparison should establish directional evidence and variance, not claim a
general ranking of the upstream skill systems. Their broader purposes and
operating assumptions differ from this controlled SeedSpec implementation
task.

## Stop conditions

Stop before five revisions when:

- three primary runs expose no repeated transferable weakness;
- a proposed change would only mirror evaluator wording or add ceremony;
- two consecutive revisions fail to improve the diagnosed weakness;
- the remaining defect is a distinct capability rather than an engineering
  control-loop problem.

When the remaining defect is distinct, define a second skill by its trigger,
input authority, output artifact, interaction with this skill, and a separate
evaluation hypothesis. Do not keep expanding one skill until it becomes an
indiscriminate software-development handbook.

## Validity limits

This loop uses one primary package, one primary implementing model, and an
evaluator that can inspect treatment artifacts. Three repetitions expose some
variance but do not estimate a population-wide treatment effect. Conclusions
must remain proportional until they survive additional package shapes, models,
and treatment-blinded evaluation.

This is a historical three-repetition experiment. Under the current paired
revision statistics contract, each arm is screening evidence because
confirmation eligibility requires at least five complete predeclared pairs.
The selected revision remains the outcome of this bounded optimization loop,
not a newly upgraded population-level claim.

## Revision log

### Revision 1 — initial native gates

Three Sol subjects implemented the frozen tool-lending package. All produced
substantive server-side authorization, exclusive reservation controls, local
persistence, and adverse-path tests. Independent profiles found:

- correctness levels 2, 3, and 3;
- test-quality levels 2, 3, and 3;
- no critical open technical finding;
- one material removed-lender lifecycle defect in one run;
- shallow persisted-state semantic validation in two runs;
- serviceable rather than robust maintainability and flexibility in all three;
- incomplete session lifecycle evidence in the local security boundaries;
- browser accessibility unobserved in all three because the runner supplied no
  usable browser.

Two subjects honestly used a `qualified` acceptance outcome for unobserved
browser behavior, exposing a lab schema that accepted only `pass` or `fail`.
The lab vocabulary was expanded without changing the deterministic success
rule: only `pass` satisfies completion.

Subject usage ranged from 2.32M to 3.67M total tokens, mostly cached input.

### Revision 2 hypothesis

Strengthen three transferable controls without adding a new gate:

1. Require explicit capability and session lifecycle analysis at the trust
   boundary.
2. Require persisted state to satisfy record, reference, and cross-record
   semantic invariants at load as well as commit, including one plausible
   well-formed-but-inconsistent corruption exercise.
3. Make adversarial review trace one representative likely change to expose
   duplicated policy ownership and unbounded propagation.

The expected effect is stronger reliability and security evidence plus a more
bounded change surface. Browser availability is not a revision target.

### Revision 2 result

All three subjects observably adopted the added state and credential controls:

- each exercised a well-formed but semantically inconsistent persisted
  snapshot;
- each declared a bounded session lifecycle, and two added explicit expiry;
- reliability levels were 2, 3, and 3;
- correctness levels were 3, 2, and 3;
- one subject reached level 3 for maintainability, security, reliability, and
  test quality with no open material implementation finding;
- no subject retained the shallow persisted-state finding seen twice in
  revision 1.

One subject duplicated the configured building-time rule in browser code and
derived its minimum due date from UTC. The independent evaluator recorded a
material correctness finding. Similar calendar-boundary weakness appeared as
an impossible-date finding in revision 1, so the problem generalizes beyond
one implementation.

Only one of three subjects recorded the required representative-change probe.
The other two appear to have treated a reference-file pass condition as
optional even though they reported G6 passed.

Revision 2 subject usage ranged from 2.93M to 4.40M total tokens, still below
the sampled gstack engineering-suite run at 6.91M and Compound Engineering run
at 12.65M.

### Revision 3 hypothesis

1. Promote the representative-change probe into the primary skill procedure
   and working-record template so it cannot be satisfied by a gate status
   alone.
2. Require the probe to stress a material policy rather than a convenient
   replaceable component.
3. Require cross-surface material rules—especially configured calendar
   semantics—to have a canonical owner and a distinguishing boundary example
   where a common incorrect interpretation would disagree.

The expected effect is fewer duplicated-policy defects and more bounded change
propagation without prescribing module count or architecture.

### Revision 3 result — rejected

The broader change-probe language did not improve the primary distribution:

- correctness levels were 3, 2, and 2;
- maintainability levels were 2, 2, and 3;
- all three subjects retained an open material implementation or evidence
  defect;
- findings included persisted custody events with invalid authority
  attribution, operator-role and minimum-record privacy expansion, impossible
  structured calendar input, and a browser verifier that reclassified
  assertion failures as environmental qualification;
- subject usage rose to 2.46M–5.05M tokens.

The change-probe promotion is therefore removed. Revision 4 begins from the
simpler revision 2 procedure plus narrowly transferable boundary controls.

### Revision 4 hypothesis

1. Require authoritative validation of the meaning of material structured
   values, including a well-shaped but invalid example when parser
   normalization, coercion, overflow, or local defaults could change meaning.
2. Extend persisted semantic invariants to the authority provenance of stored
   actions: actor, resource, and transition attribution must remain valid after
   load.
3. Require evidence adapters to distinguish capability or setup absence from
   an assertion failure or wrong observation; behavioral failures may not be
   reclassified as qualification.

These controls generalize the recurring findings without naming the benchmark's
specific date, role, or storage implementation. Revision 4 is the final primary
optimization pass unless it reveals a new critical regression.

### Revision 4 result

The targeted defects did not recur:

- no subject accepted an impossible material structured value;
- no evaluator found persisted action authority could be forged;
- no evidence adapter converted an assertion failure into qualification;
- maintainability reached level 3 in all three runs;
- subject usage was tightly grouped at 2.97M–3.04M tokens.

Correctness levels were 2, 3, and 2. Two subjects omitted the authored ability
for a lender to update an eligible listing from the delivered interface. Their
other lifecycle behavior and tests were substantial, so this was not a general
implementation collapse; it was a repeated end-to-end obligation-closure gap.

Other material findings varied by run—restart lockout, credential endpoint
abuse resistance, session lifecycle hardening, and incomplete pending-record
validation—and did not form one additional primary-skill revision target.

### Revision 5 hypothesis

Require every distinct authored actor action to have an end-to-end delivery
chain:

1. authoritative behavior;
2. route, command, automation, or integration boundary;
3. promised human or agent interface;
4. distinguishing evidence.

The obligation map, operational-surface gate, and evidence gate will all use
this action inventory. Revision 5 is the fifth and final skill revision.

### Revision 5 primary result

The action-closure change improved the primary distribution:

- correctness reached level 3 in all three runs, compared with levels 2, 3,
  and 2 in revision 4;
- no independent profile retained the repeated missing listing-update finding;
- two subjects exposed a complete listing-edit control in the resident
  interface, and the third exposed the update command through the application
  boundary while combining its resident control with listing availability;
- no subject had an open critical finding;
- subject usage ranged from 2.66M to 4.56M total tokens, with a 3.31M median.

Each run still had two open material findings. They concerned first-run
operator bootstrap, browser-path evidence, session expiry, local recovery,
process-restart durability, and one evaluator-contract mapping conflict. These
are real weaknesses, but they do not show that the action-closure instruction
introduced a new repeated material defect. Similar lifecycle, durability, and
browser limitations predated revision 5.

Maintainability fell from level 3 in revision 4 to level 2 in all three
revision-5 runs. The supported findings were either minor module concentration
or the ordinary absence of observed adaptation evidence, not a material
regression. Revision 5 therefore passed the primary-case acceptance rule and
advanced to the held-out transfer check.

The five-revision limit is now exhausted. Further builder instructions would
risk making this skill an evaluator-shaped engineering handbook.

## Transfer result — revision 5 rejected

Revision 4 and revision 5 were each applied once, without further editing, to
the held-out Kestrel warehouse-transfer workflow.

Revision 4 passed the deterministic artifact and integrity gate. Its
independent technical profile found no critical defect and assessed correctness
at level 2, but reported five material gaps: scheduled operations were not
wired, the site-manager review surface was incomplete, fixture identity could
be selected by a caller, persistence failure could split in-memory and durable
state, and authored runtime configuration was duplicated rather than loaded.
The result was high risk, not a readiness success.

Revision 5 also passed the deterministic artifact and integrity gate and
materially improved action-surface coverage: the delivered UI exposed
exception, compensation, and reconciliation work that revision 4 had omitted.
However, independent review found a critical atomicity defect. Repeating one
bulk lot as multiple request lines could reserve more inventory than existed
and make availability negative. Caller-controlled actor identity remained a
material authority defect, and the tests did not exercise either failure at
the delivered HTTP boundary. Correctness was therefore level 0 and readiness
was blocked.

The revision-5 transfer subject used 3.69M total tokens. Its stronger surface
coverage does not outweigh a critical invariant failure. Under the frozen
transfer rule, revision 5 is rejected and revision 4 remains the selected
skill. The action-closure hypothesis remains useful evidence for the proposed
independent challenge capability; it is not retained in the implementation
skill on this result.

## Comparator result

The following directional comparison uses three Sol subjects per treatment on
the same authored tool-lending package. Technical levels are ordinal vectors;
the table intentionally does not average them.

| Treatment | Correctness | Runs with critical findings | Open material findings per run | Total-token range | Median total tokens |
| --- | --- | ---: | --- | ---: | ---: |
| No guidance | 2, 2, 0 | 1/3 | 3, 4, 4 | 1.35M–1.92M | 1.83M |
| gstack engineering suite | 3, 0, 2 | 1/3 | 2, 4, 1 | 6.91M–12.80M | 10.55M |
| Compound Engineering core loop | 3, 2, 2 | 0/3 | 2, 2, 2 | 12.65M–31.81M | 14.28M |
| SeedSpec native revision 4 | 2, 3, 2 | 0/3 | 2, 1, 3 | 2.97M–3.04M | 3.01M |

On this package, model, and harness, the native skill produced the most
consistent non-compromised correctness distribution and avoided the critical
authorization failures observed in the no-guidance and gstack samples. It used
roughly 1.6 times the median tokens of no guidance, 29% of the gstack median,
and 21% of the Compound Engineering median. That additional cost over no
guidance bought substantially stronger authority, state, persistence, and
boundary behavior. On this narrow sample it was directionally better than no
guidance and gstack, and competitive with the Compound Engineering core loop
at far lower token cost.

This is evidence for a narrow SeedSpec implementation treatment, not a general
ranking of gstack or Compound Engineering. Their skill suites have broader
purposes, the evaluator could inspect treatment artifacts, and this experiment
used one package shape and one implementing model.

## Remaining capability boundary

The remaining defects are not one more planning gate. They are failures to
independently challenge a completed realization after the builder has become
committed to its own design and evidence.

A second skill should therefore be a separate, read-only
`challenge-seedspec-realization` pass:

- **Trigger:** after an implementation agent reports `ready` or `qualified`,
  before the realization is accepted or published.
- **Input authority:** the immutable package, resolved end-user intent,
  selected implementation profile state, completed realization, gate record,
  and executed evidence. It receives no hidden evaluation expectations.
- **Procedure:** reconstruct the material obligation and actor-action inventory
  independently; select the highest-risk cross-boundary claims; try to falsify
  reachability, authority, equivalent-input and aggregation behavior, state,
  recovery, configuration, and evidence honesty in a disposable copy; and
  distinguish implementation defects from missing runtime capabilities.
- **Output:** a machine-readable finding set plus a concise
  `REALIZATION_CHALLENGE.md`, with severity, confidence, cited evidence,
  unobserved claims, and suggested verification. It does not silently repair
  the implementation or rewrite intent.
- **Interaction:** return supported findings to the implementation agent for a
  bounded fix-and-reverify pass. Use a fresh challenge context for the final
  check so the builder does not adjudicate its own work.

This differs from the independent technical evaluator: the challenger is a
pre-acceptance implementation aid with actionable falsification probes, while
the evaluator produces a stable descriptive quality vector and must remain
outside the remediation loop.

The first evaluation should compare revision 4 alone with revision 4 followed
by an independently contextualized challenge/fix pass. Measure open critical
and material findings, obligation-to-surface closure, evidence honesty, added
turns and tokens, and whether the challenge introduces unauthorized scope. Use
both the tool-lending package and the held-out Kestrel workflow before adding
the skill to default guidance.
