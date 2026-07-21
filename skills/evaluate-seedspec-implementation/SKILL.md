---
name: evaluate-seedspec-implementation
description: Evaluate an independently produced application, feature, workflow, automation, configuration, integration, or other realization against a resolved SeedSpec package. Use for SeedSpec implementation experiments, acceptance and fidelity reviews, cross-model comparisons, and congruency analysis that must distinguish required intent from legitimate implementation variation.
---

# Evaluate a SeedSpec implementation

Judge the realized outcome against packaged intent and actual evidence. Do not judge it by similarity to another implementation or by personal technology preferences.

## Procedure

1. Read the resolved core intent, configuration, recorded end-user decisions, selected implementation profile state, resource state, and acceptance material.
2. Inspect the realized outcome and available verification evidence. For configured systems or workflows, code may not be the primary evidence.
3. Build a trace from each required behavior, constraint, and success criterion to observed evidence.
4. Classify divergences as `violation`, `unsupported-assumption`, `legitimate-variation`, `profile-deviation`, or `not-observable`.
5. Evaluate the dimensions in [references/rubric.md](references/rubric.md).
6. Emit one JSON result using [references/output.md](references/output.md).

## Authority order

Use this order when evidence conflicts:

1. explicit end-user direction and selected configuration;
2. core intent and acceptance criteria;
3. viable selected implementation-profile guidance;
4. recommended or available resources;
5. the implementing agent's reversible choices.

An implementation profile explains how the package could be realized. It cannot redefine success or silently override core intent. A skill explains how to perform recurring work; it is not selected solution intent and its presence is not proof it was consulted.

## Congruency

When comparing multiple implementations, compare their satisfaction of intent before comparing their internal shape. Different architectures can be equally congruent. Similar code can violate the same requirement. Record convergence separately for observable behavior, declared constraints, data semantics, operational evidence, and implementation choices.

Do not modify the realization. Do not execute destructive verification steps or contact external systems without explicit authorization.
