---
name: compound-engineering-core-loop
version: 0.1.0
description: Controlled implementation-quality adapter for Compound Engineering's plan, work, simplify, and code-review skills.
---

# Compound Engineering core implementation loop

This evaluation adapter exposes a frozen subset of Compound Engineering as a
coordinated, package-scoped skill suite. The upstream member skills are mounted
under `members/`:

1. `members/ce-plan/SKILL.md`
2. `members/ce-work/SKILL.md`
3. `members/ce-simplify-code/SKILL.md`
4. `members/ce-code-review/SKILL.md`

## Controlled sequence

1. Treat the immutable SeedSpec package and resolved end-user choices as the
   requirements source.
2. Consult `ce-plan` and write the implementation plan to
   `workspace/realization/TECHNICAL_PLAN.md`. Preserve the upstream plan
   semantics, but do not start product brainstorming or modify packaged intent.
3. Consult `ce-work` and implement the plan in caller-owned-tail mode. Preserve
   its proof-first behavior, unit verification, decision-conflict handling, and
   structured completion evidence. Do not invoke its publishing or PR tail.
4. Consult `ce-simplify-code` after implementation when the changed
   human-authored code has meaningful simplification surface. If its own
   no-yield gate applies, record the skip.
5. Consult `ce-code-review` against the authored package, technical plan, and
   realized diff. Apply supported findings locally, reject false positives with
   a reason, rerun affected verification, and retain the review result.
6. Run the realization's complete declared verification and acceptance evidence
   before finishing.

## Evaluation adaptations

- Work only with local files, runtimes, and dependencies.
- Do not publish, push, open a pull request, watch remote CI, emit telemetry,
  access global memory, or use Proof.
- Do not consult `ce-brainstorm` or `ce-compound`; those stages are outside this
  implementation-quality experiment.
- If the host does not expose specialist subagents or cross-model dispatch, use
  the upstream inline or serial fallback and record that adaptation.
- Read referenced support files on demand when a member skill requires them.
  Do not claim a member was consulted unless its `SKILL.md` was actually read.

## Required suite record

Write `workspace/realization/SUITE_EXECUTION.md` with one section per member:

- status: `consulted`, `skipped`, or `unavailable`;
- execution order;
- exact upstream files read;
- produced artifact or gate result;
- material influence on implementation;
- findings applied, rejected, or left unresolved;
- controlled-run adaptations used.

The suite is implementation guidance. The SeedSpec package remains authoritative
for obligations, boundaries, constraints, and success.
