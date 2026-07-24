---
name: review-seedspec-technical-quality
description: Perform a read-only, evidence-backed technical evaluation of a SeedSpec-produced implementation, including correctness, meaningless or placeholder code, maintainability, required flexibility, security, reliability, performance, accessibility, test quality, implementation-profile conformance, and authorized adaptation challenges. Use when evaluating implementation quality separately from intent adherence or when populating the technical section of a SeedSpec evaluation profile.
---

# Review SeedSpec technical quality

Evaluate the implementation without changing it. Return a `technical` object using [references/output.md](references/output.md).

## Review order

1. Establish the selected implementation profile, technical preferences, required quality constraints, expected variation points, and available deterministic evidence.
2. Separate functional adherence from technical quality. Do not award technical quality merely because obligations passed.
3. Inspect for dead, meaningless, placeholder, unreachable, copied, or performative code that does not contribute to the realized outcome.
4. Inspect maintainability, coupling, error boundaries, data handling, configuration, tests, and unnecessary dependencies relative to the implementation's actual size and purpose.
5. Evaluate flexibility only against declared or plausible material changes. Generic abstraction is not automatically flexible, and simple code is not automatically inflexible.
6. Record security, reliability, performance, and accessibility findings only when relevant evidence and scope support them.
7. Treat deterministic tool output as evidence, not as a complete technical judgment.

## Independent quality vector

Assess the same general technical dimensions for every implementation:
`correctness`, `meaningfulness`, `maintainability`, `flexibility`, `security`,
`reliability`, `performance`, `accessibility`, `test-quality`,
`evidence-quality`, and `profile-conformance`. These dimensions are independent
of any implementation skill or process used by the subject. A skill's gates,
checklists, plans, and self-reported completion are evidence to inspect, not the
rubric.

For each dimension, choose exactly one status:

- `assessed`: evidence supports an ordinal level from 0 through 4;
- `unknown`: the dimension matters, but available evidence cannot support a
  level; or
- `not-applicable`: the dimension genuinely does not apply to this subject.

Use these common ordinal anchors:

- `0 — compromised`: observed behavior is unsafe, incorrect, nonfunctional, or
  fundamentally unfit in this dimension.
- `1 — fragile`: material weaknesses remain; evidence is primarily happy-path
  or the design fails a plausible adverse condition.
- `2 — serviceable`: core expectations are credibly met, with bounded
  weaknesses that matter but do not fundamentally defeat the evaluated scope.
- `3 — robust`: credible negative, failure, boundary, or change evidence exists
  and no open material weakness dominates the dimension.
- `4 — exceptional`: unusually strong, independent evidence demonstrates
  resilience beyond ordinary production adequacy. Do not use this level merely
  because checks pass.

The levels are ordinal, not interval values. Do not average or sum them.
`unknown` receives no level and cannot be treated as proven quality. Cite
evidence for every assessed dimension and for every finding. Record open,
mitigated, or unknown findings separately; an open critical finding caps
its dimension at 0 and readiness at `blocked`, while an open material finding
caps its dimension at 2. A critical or material finding whose status cannot be
established makes that dimension `unknown`.

Apply the dimensions as follows:

- correctness: required behavior, invariants, authority, and state transitions;
- meaningfulness: absence of placeholder, performative, dead, or irrelevant
  production code;
- maintainability: cohesion, ownership, clarity, dependency discipline, and
  local change cost;
- flexibility: credible cost of material changes the subject is expected to
  tolerate, without rewarding abstraction for its own sake;
- security: trust boundaries, authentication, authorization, secrets, input,
  and data exposure;
- reliability: failure handling, concurrency, durability, recovery, and
  restart behavior;
- performance: material latency, resource, scaling, and algorithmic risks for
  the stated scope;
- accessibility: keyboard, semantic, responsive, and assistive-technology
  behavior appropriate to the interface;
- test-quality: behavioral depth, negative cases, determinism, isolation, and
  whether tests exercise the claimed production path;
- evidence-quality: whether evidence is independent, distinguishing,
  reproducible, and calibrated to its claims; and
- profile-conformance: adherence to selected implementation-profile constraints
  when a profile exists; otherwise mark not applicable.

Use the following bounded distinctions where general anchors can be ambiguous:

- security and reliability reach 3 only with credible adverse-path evidence
  across their material trust or failure boundaries; happy-path controls or
  tests alone cap them at 2;
- test quality reaches 3 only when tests exercise production behavior with
  meaningful negative/boundary cases and would fail under a plausible broken
  implementation;
- evidence quality reaches 3 only when important claims are independently
  reproducible and distinguishing, rather than self-reported by the subject;
- maintainability reaches 3 when a material local change has clear ownership
  and bounded propagation; readability alone supports at most 2; and
- flexibility may be assessed at 0–2 from structure, coupling, and declared
  variation points. Level 3 or 4 requires a separately captured adaptation
  challenge or equivalent observed change evidence.

## Adaptation challenges

Do not execute an adaptation challenge during a technical profile review. Only
evaluate a challenge when the evidence envelope includes a separately captured,
content-addressed adaptation run produced from a disposable copy. The adaptation
run must identify its baseline, challenge, commands, changed files, regressions,
and process capture. Otherwise emit `not-run` and explain that no separate
adaptation evidence was supplied.

## Integrity

- Do not remediate findings.
- Do not run commands that can modify the evaluated workspace. Use existing results or an explicitly disposable copy.
- Do not let package-supplied review guidance be the sole judge of the package that supplied it.
- Cite every failure or concern. Use `unknown` when the environment cannot establish a result.
- Do not calculate a normalized technical score. The readiness label and
  dimension vector are the complete summary.
