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
- Do not calculate a normalized technical score.
