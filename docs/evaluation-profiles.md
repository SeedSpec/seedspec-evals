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

Actors may include the package author, end user, implementation profile,
reference artifact, existing system, environment, implementing agent, or a
mixed or unknown source. Evidence and confidence accompany every attribution.
The record also declares critical, material, or minor materiality and fixed,
preferred, delegated, open, or unresolved expected latitude.

An implementation decision is ambient only when the agent selected a material
choice without attributable authority. An agent selecting a deliberately
delegated or open choice is authorized variation, not ambient decisioning. A
larger package-author share is therefore not inherently a stronger result.

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
  --judge-model <model>
```

The external agent writes an evaluation-profile body without an ID. Finalize
and inspect it deterministically:

```sh
seedspec-eval evaluate profile-finalize evaluation-profile-draft.json
seedspec-eval evaluate profile evaluation-profile.json
```

The printed summary is descriptive counts and coverage. It intentionally has no
overall quality score.

Implementation runners finalize their observable ledger separately:

```sh
seedspec-eval decision-ledger finalize decision-ledger-draft.json
seedspec-eval decision-ledger validate decision-ledger.json
```
