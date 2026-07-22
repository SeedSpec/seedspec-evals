---
name: evaluate-seedspec-profile
description: Produce a descriptive SeedSpec package or implementation evaluation profile covering decision provenance, materiality, agent latitude, ambient decisions, obligation-to-evidence coverage, semantic file ownership, process cost, and uncertainty. Use when profiling a SeedSpec, comparing expected decision authority with an implementation trace, or creating author-facing evaluation evidence without assigning a winner or normalized quality score.
---

# Evaluate a SeedSpec profile

Inspect the subject without editing it. Produce the canonical profile body described in [references/output.md](references/output.md).

When the handoff supplies `profile-evidence.json`, treat that content-addressed envelope as the complete control-plane index. Do not inspect the full case, evaluator source, TypeScript schemas, or unrelated repository files. Record the exact evaluator model and reasoning effort requested by the envelope.

## Evidence discipline

- Use package-relative or run-relative evidence paths.
- Cite every decision, obligation, and structure finding.
- Preserve `unknown` and `mixed` attribution when evidence does not support a stronger claim.
- Record observable decision summaries, not hidden reasoning.
- Do not invent token, cache, turn, duration, or technical evidence. Mark unavailable capture explicitly.
- Distinguish package evidence, planned verification, realization evidence, and outcome evidence.
- For every applicable comparison decision axis in the envelope, create exactly one decision with the matching `caseAxisId` and materiality.
- For every applicable comparison obligation axis, create exactly one obligation with the matching `caseAxisId`, kind, and importance.
- Additional subject-specific records may omit `caseAxisId`; they do not replace a shared axis.

## Decision procedure

1. Inventory consequential choices that could materially change behavior, authority, data meaning, safety, compliance, integration, deployment, cost, compatibility, or reversibility.
2. Separate who proposed a choice, who selected it, what constrained it, and who implemented it. One decision may have several parties.
3. Classify expected latitude as `fixed`, `preferred`, `delegated`, `open`, or `unresolved`.
4. Classify materiality as critical, material, or minor and state whether its basis is a protocol default, author declaration, evaluator judgment, or mixed.
5. For an observed implementation, compare the choice with expected latitude. Use `ambient` only when the implementing agent selected a material choice without attributable authority. Deliberately delegated and open choices are not ambient.
6. Record whether the choice was explicit, implicit, silent, not applicable, or unknown and include attribution confidence.
7. Treat reference artifacts as normative, preferred, or illustrative only when package evidence establishes that influence. Otherwise record the uncertainty.
8. When an implementing-agent decision ledger exists, treat it as a claim to verify against package authority, observable trace events, existing-system evidence, and the final implementation. It improves recall but does not adjudicate its own alignment.

Use actor labels consistently:

- `package-author`: the human or organization whose packaged intent supplies authority.
- `end-user`: the adopter applying the package and supplying applied intent.
- `authoring-agent`: the agent that shaped source material into the evaluated specification.
- `implementing-agent`: the agent realizing an authored specification.
- `implementation-profile`: packaged implementation guidance selected for the realization.
- `reference-artifact`: supplied examples or code whose authority depends on package declarations.
- `existing-system`: behavior or constraints already imposed by the target system.
- `environment`: observable runtime, organizational, regulatory, or deployment constraints.
- `evaluation-case`: evaluator-only expectations that were not necessarily visible to the subject.
- `evaluator`: the agent or deterministic system producing this profile.
- `mixed`: supported evidence attributes the role to more than one actor.
- `unknown`: available evidence cannot support a more specific actor.

Do not attribute an evaluator-only expectation to the package author, environment, or reference artifact. It may establish evaluation alignment, but it was not authority available to the subject unless the source or author responses also supplied it.

Do not reward a larger package-author share. Evaluate whether the observed decision distribution matches the distribution the package intended.

## Obligation and structure procedure

Map every material outcome, behavior, invariant, constraint, forbidden state, boundary, and success criterion to planned and observed evidence. Mark whether the evidence distinguishes success from plausible failure; presence alone is not coverage.

Inspect semantic ownership across files. Report duplicated authority, misplaced concerns, conflicts, monolithic overload, unnecessary fragmentation, and missing routing. Recommend one canonical owner, but do not restructure the evaluated subject.

## Process and technical evidence

Record process metrics only at their available capture level. Separate input, cached input reads and writes, output, clarification turns, correction turns, tool calls, and duration when the harness exposes them.

For implementation subjects, use the technical-review skill named by the handoff and place its findings in `technical`. Do not collapse technical quality, adherence, decision alignment, or cost into a single score.

## Finalization

Write a profile body without `profileId`. Use the CLI finalizer from the handoff to validate the body and calculate its content-addressed ID.
