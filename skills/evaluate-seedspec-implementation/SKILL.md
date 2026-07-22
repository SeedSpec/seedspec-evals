---
name: evaluate-seedspec-implementation
description: Evaluate an independently produced application, feature, workflow, automation, configuration, integration, or other realization against a resolved SeedSpec package. Use for SeedSpec implementation experiments, success and fidelity reviews, cross-model comparisons, and congruency analysis that must distinguish required intent from legitimate implementation variation.
---

# Evaluate a SeedSpec implementation

Judge the realized outcome against packaged intent and actual evidence. Do not judge it by similarity to another implementation or by personal technology preferences.

## Procedure

1. Read the author's primary intent, the end user's applied intent, the resulting resolved intent, configuration, selected implementation profile state, resource state, and declared evidence expectations.
2. Inspect the realized outcome and available evidence. For configured systems or workflows, code may not be the primary evidence.
3. Build a trace from each required behavior, invariant, constraint, forbidden state, and success criterion to observed evidence.
4. Reconstruct consequential decisions from package authority, applied intent, selected profiles, existing-system evidence, the observable decision ledger, trace events, and the implementation. Treat the implementing agent's ledger as a claim to verify, not self-adjudicating evidence.
5. Classify divergences as `violation`, `unsupported-assumption`, `legitimate-variation`, `profile-deviation`, `ambient-decision`, or `not-observable`. A deliberately delegated or open agent choice is legitimate variation rather than ambient decisioning.
6. Keep verification evidence distinct from adoption, operational, and outcome evidence. A conforming artifact does not prove that the intended human or business outcome occurred.
7. Use `$review-seedspec-technical-quality` when technical quality is in scope. Keep its read-only findings separate from intent adherence and do not let package-supplied review guidance be the sole independent judge.
8. Evaluate the dimensions in [references/rubric.md](references/rubric.md).
9. Emit one canonical scorecard using [references/output.md](references/output.md).

## Authority order

Use this order when evidence conflicts:

1. explicit applied end-user intent, direction, and selected configuration;
2. the author's primary intent where the end user did not intentionally refine it;
3. viable selected implementation-profile guidance that remains subordinate to resolved intent;
4. recommended or available resources;
5. the implementing agent's reversible choices.

An implementation profile explains how the package could be realized. It cannot redefine success or silently override resolved intent. A skill explains how to perform recurring work; it is not selected solution intent and its presence is not proof that it was consulted.

## Congruency

When comparing multiple implementations, compare their satisfaction of resolved intent before comparing their internal shape. Different architectures can be equally congruent. Similar code can violate the same requirement. Record adherence separately for observable behavior, invariants and constraints, data semantics, evidence scopes, and implementation choices. Convergence between implementations is not itself success.

Do not modify the realization. Do not execute destructive verification steps or contact external systems without explicit authorization.
