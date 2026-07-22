# Descriptive evaluation profiles

An evaluation profile records what an evaluator can establish about a SeedSpec
package or one implementation run without reducing the evidence to a winner or
one normalized score. Profiles are content-addressed and validate through
`EvaluationProfileSchema`.

## Decision provenance

A decision record separates four roles:

- who proposed an option;
- who selected it;
- what constrained it; and
- who implemented it.

Actors may include the package author, end user, authoring agent,
implementation profile, reference artifact, existing system, environment,
implementing agent, evaluation case, evaluator, or a mixed or unknown source.
The authoring agent is distinct from the package author whose intent it shapes.
The evaluation case is evaluator-only authority unless the subject source also
contains that expectation. Evidence and confidence accompany every attribution.
The record also declares critical, material, or minor materiality and fixed,
preferred, delegated, open, or unresolved expected latitude.

An implementation decision is ambient only when the agent selected a material
choice without attributable authority. An agent selecting a deliberately
delegated or open choice is authorized variation, not ambient decisioning. A
larger package-author share is therefore not inherently a stronger result.

At authorship, a general request to complete or improve a specification is not
blanket delegation of every material product policy. An authoring-agent choice
without attributable authority remains ambient even when it happens to match an
evaluator-only expectation. `not-observed` means the authored material contains
no choice to compare at that stage; it does not mean that implementation has not
started.

Reference implementations require the same care. Their decisions are
normative, preferred, or illustrative only when package evidence establishes
that influence. Inclusion alone does not silently make every code choice part
of intent.

Implementation harnesses collect an observable decision ledger. In Think, the
agent uses a narrow `record_decision` tool whose structured input is preserved
in the trace. Desktop runners write and content-address the same ledger shape.
The ledger records materiality, expected latitude, sources, alternatives,
disclosure, concise rationale, and implementation evidence. It never requests
hidden reasoning. Because it is self-reported, the independent evaluator must
verify it against package authority, trace events, existing-system evidence,
and the final diff before classifying alignment or ambient decisioning.

## Obligations and evidence

Profiles map outcomes, behaviors, invariants, constraints, forbidden states,
boundaries, and success criteria to planned and observed evidence. Coverage is
`covered`, `partial`, `uncovered`, `not-applicable`, or `unknown`. A separate
distinguishing field asks whether the evidence can tell success from plausible
failure; the mere presence of a test or screenshot is not coverage.

## Shared comparison axes

Each evaluation case predeclares material decision and obligation axes. A
run-profile evidence envelope filters them to the evaluated stage. The evaluator
must create exactly one record for every applicable axis and retain its
materiality, kind, and importance. `caseAxisId` is therefore the common
denominator across variants; additional findings remain valuable but are listed
as subject-specific rather than treated as directly comparable.

This prevents independent evaluators from making one package appear stronger
merely by inventorying it at a different level of detail. A comparison still
does not decide whether fixed author control or delegated agent freedom is
better. It shows the observed authority, latitude, alignment, evidence
coverage, distinguishing power, and capture limitations for each axis.

## Structure

Structure findings describe semantic ownership rather than preferred document
length. Evaluators can report duplicated authority, misplaced or conflicting
concerns, monolithic overload, unnecessary fragmentation, missing routing, and
clear ownership. A recommendation names one canonical owner without editing
the evaluated subject.

## Process efficiency

Process metrics preserve capture quality alongside values. Turns, tokens,
cache reads and writes, tool calls, and duration may be provider-reported,
estimated, reconstructed, or unavailable. The profile does not assume that
fewer tokens are better. Comparisons should consider total cost to an accepted
result, correction cycles, achieved quality, and amortized reuse.

## Technical evaluation

Technical checks remain separate from intent adherence. They cover correctness,
meaningfulness, maintainability, required flexibility, security, reliability,
performance, accessibility, test quality, and implementation-profile
conformance. Package-supplied review skills may contribute evidence but cannot
be the sole independent judge of the package that supplied them.

Adaptation challenges are the strongest evidence of flexibility. They run only
when declared by a case, supplied by an author, or explicitly approved by an
operator, and they must use a disposable copy. The profile records observable
change cost, regressions, turns, and tokens when those values are captured.

## CLI lifecycle

Prepare a package-only author review:

```sh
seedspec-eval evaluate package-profile-brief <package> \
  --runner codex \
  --judge-model <model>
```

Prepare a completed-run profile:

```sh
seedspec-eval evaluate profile-brief <run-directory> \
  --runner codex \
  --judge-model <model> \
  --reasoning-effort high
```

The command writes a compact content-addressed evidence envelope beside the
handoff. The external agent writes an evaluation-profile body without an ID.
The handoff's finalization command binds it to that envelope, including the
exact subject, evaluator model and effort, and complete comparison axes.

For Codex, use the captured path when evaluator usage matters:

```sh
seedspec-eval evaluate profile-run <run-directory> \
  --confirm-model-execution
```

Evaluation evidence keeps the provider-qualified AI Gateway model slug. When
that slug begins with `openai/`, the Codex adapter passes only its model portion
to the local Codex CLI while retaining the complete slug in the evidence. Other
provider slugs are not rewritten implicitly.

This preserves Codex's JSONL events and provider-reported input, cached input,
output, and reasoning-output counts in `evaluator-run.json`. Those are evaluator
costs; they are not mixed into the evaluated subject's process metrics.

For a manual evaluator, finalize and inspect deterministically with the exact
evidence file named in its handoff:

```sh
seedspec-eval evaluate profile-finalize evaluation-profile-draft.json \
  --evidence profile-evidence.json
seedspec-eval evaluate profile evaluation-profile.json
```

The printed summary is descriptive counts and coverage. It intentionally has no
overall quality score.

Compare finalized profiles from the same case and stage over shared axes:

```sh
seedspec-eval evaluate profile-compare \
  <run-a>/evaluation-profile.json \
  <run-b>/evaluation-profile.json
```

The command writes content-addressed JSON and a readable Markdown table. It
preserves subject-specific findings separately and emits no aggregate score or
winning variant.

Implementation runners finalize their observable ledger separately:

```sh
seedspec-eval decision-ledger finalize decision-ledger-draft.json
seedspec-eval decision-ledger validate decision-ledger.json
```
