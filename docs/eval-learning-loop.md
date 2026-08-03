# Eval-driven skill learning loop

The evaluation framework separates cheap discovery from expensive
confirmation. A result can move through four explicit artifact layers:

1. a behavioral-seam screen finds a small, repeatable agent behavior;
2. a feedback ledger records the failure mechanism and assigns its owning
   layer;
3. a qualified semantic discovery can be promoted into a deterministic probe
   with both known-bad and valid-alternative controls; and
4. a paired skill-revision plan tests a predeclared change against the
   comparable runs from the previous plan.

No layer automatically declares that a skill improved. Screening routes
attention; full paired case evidence supports confirmation.

## Pair one skill revision with the previous plan

Both skill planners accept a previous immutable plan and a revision hypothesis:

```sh
seedspec-eval experiment implementation-skill-plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model openai/gpt-5.6-sol \
  --repetitions 5 \
  --authored-input <frozen-package> \
  --skill <candidate-skill>/SKILL.md \
  --previous-plan runs/revision-1-plan.json \
  --revision-hypothesis \
    "An explicit identity-boundary step reduces forgeable caller authority without rejecting valid delegation." \
  --out runs/revision-2-plan.json
```

The candidate plan contains `lineage.relation = "skill-revision"`, the previous
plan ID, the hypothesis, and one content-addressed pair for every comparable
case, model, guidance-delivery arm, and repetition. Pairing fails closed if an
arm is missing or replication counts differ. Skill digests and treatment
labels may change; case identity, model request, runner, protocol, target, and
guidance-delivery mode may not.

After both sides have finalized profiles:

```sh
seedspec-eval evaluate paired-revision-statistics \
  runs/revision-2-plan.json \
  <previous-profile...> <candidate-profile...> \
  --out runs/revision-2-statistics.json
```

The report uses medians, Tukey hinges over paired deltas, direction counts, and
a two-sided exact sign test excluding ties. It keeps every technical dimension
separate and never averages them into a winner. A comparable arm remains
`screening` below five complete pairs. At five or more it becomes
`confirmation-eligible`; this label is a sample-size gate, not an automatic
claim that the hypothesis passed. Served-model claims additionally require five
pairs whose old and new provider identities were both verified.

## Run the low-cost behavioral seam lane

Behavioral seams test small activation, restraint, protocol, or fallback
choices before paying for full implementation and independent review. Cases may
record action choices, produce a structured decision artifact, or complete a
small executable implementation:

```sh
seedspec-eval experiment behavioral-seam-plan \
  --skill skills/implement-stateful-workflows/SKILL.md \
  --suite suites/behavioral/implement-stateful-workflows.yaml \
  --model openai/gpt-5.6-sol \
  --repetitions 5 \
  --case executable-state-outbox-recovery executable-custody-transfer \
  --out runs/stateful-behavioral-plan.json

seedspec-eval experiment behavioral-seam-brief \
  runs/stateful-behavioral-plan.json \
  --task <behavior-task-id> \
  --out <new-isolated-directory>

seedspec-eval runner behavioral-seam-run \
  <new-isolated-directory> \
  --plan runs/stateful-behavioral-plan.json \
  --runner codex \
  --reasoning-effort low \
  --confirm-model-execution
```

Every case has a no-guidance and skill-guidance arm. The handoff exposes the
scenario and output contract, but not hidden expectations, probes, or their plan
path. The captured runner retains provider JSONL, stderr, the final message, the
exact request selector, any served-model receipt, and a digest of the produced
artifact. JSON artifacts are scored with deterministic relationship checks;
executable artifacts are exercised by hidden behavioral probes in a disposable,
network-denied sandbox. Summaries retain per-arm score distributions and paired
skill wins, ties, losses, and median score deltas. Manual finalization is
available for already captured evidence:

Behavioral plan schema version 2 adds two design boundaries before execution:

- every seam declares the capability, why the prompt makes that capability
  necessary, and the independently observable success condition; and
- every suite declares whether the selected runner uses its active entrypoint
  or a reconstruction, then classifies each dependency as `live`, `frozen`, or
  `simulated` with its binding, provenance, effects, and treatment availability.

Live dependencies must be read-only. Mutable dependencies must be isolated and
declare how state resets. A reconstruction must name the behavior it cannot
preserve. These design records remain evaluator-only; the subject receives the
scenario and output contract, not the success definition or dependency ledger.

Use `--case` to rerun only seams affected by a skill or contract revision. This
keeps a saturated regression guard from consuming the same budget as a seam
that is still producing information.

```sh
seedspec-eval evaluate behavioral-seam-finalize \
  <isolated-directory>/behavioral-observation-draft.json \
  --plan runs/stateful-behavioral-plan.json

seedspec-eval evaluate behavioral-seam-summary <behavioral-result...>
```

These results are always screening evidence. They can reject an obviously
ineffective revision, identify a seam worth deeper evaluation, or monitor
regressions cheaply. They cannot confirm end-to-end implementation quality,
test quality, transfer, or production behavior.

Do not promote a deterministic artifact check until a valid-alternative control
passes and a known-bad control fails. Avoid exact serialization and arbitrary
cardinality checks when richer equivalent artifacts preserve the same behavior.

## Keep feedback machine-readable

An eval-feedback ledger is a content-addressed JSON artifact. Each entry records:

- `disposition`: `change`, `verify`, or `consider`;
- the observed `failureMechanism`;
- the `owningLayer`, such as the skill protocol, harness, case, deterministic
  evaluator, semantic evaluator, or base model;
- the proposed action, evidence, and negative controls;
- implementation status; and
- a verification method and result.

Finalize and inspect it with:

```sh
seedspec-eval evaluate feedback-finalize eval-feedback-ledger-draft.json
seedspec-eval evaluate feedback eval-feedback-ledger.json
```

A proposed deterministic-evaluator change must name a valid-alternative
negative control. A `verified` entry must cite a passing verification artifact.
This prevents unsupported reviewer prose from silently becoming framework
policy.

## Promote semantic discoveries into deterministic probes

Start from a `qualified` case artifact containing content-addressed known-bad
and valid-alternative candidates plus successful false-positive and
false-negative semantic probes. A deterministic-probe draft binds:

- the exact qualification and case digest;
- both semantic source probe IDs;
- a shell-free executable argument vector; and
- at least one known-bad control expected to fail and one valid alternative
  expected to pass.

```sh
seedspec-eval cases probe-promote deterministic-probe-draft.yaml \
  --qualification qualification.json

seedspec-eval cases probe-run deterministic-probe.json \
  --qualification qualification.json \
  --confirm-code-execution
```

Execution occurs against disposable candidate copies, uses an executable
allowlist, and fails closed when the platform has no supported sandbox unless
the operator explicitly confirms external isolation. A probe passes only when
every control matches its expected exit behavior. This is deliberately
stricter than adding a source-pattern warning.

## Requested and served model identity

Captured subject-run schema version 2 records:

- `requestedModel`: the immutable model request;
- `modelSelector`: the exact selector sent to the runner;
- optional `servedModel`: a provider-disclosed receipt; and
- `modelIdentityStatus`: `verified`, `unverified`, or `mismatch`.

Codex runs remain `unverified` when its event stream exposes no serving-model
receipt. Claude runs record the provider value and distinguish a match from a
mismatch. Unblinded profile subjects and profile comparisons retain this
identity record. Reports may still describe requested-model results when
identity is unverified, but must not relabel them as verified served-model
evidence.
