---
name: evaluate-seedspec-authorship
description: Evaluate a controlled specification-authoring run from source material through its final SeedSpec package or source-only control output. Use for SeedSpec authoring experiments, evaluation-variant comparisons, authoring-tool regressions, and judging whether protocol-aware guidance materially improves an agent's implementation starting state.
---

# Evaluate SeedSpec authorship

Assess whether the authored output gives an independent implementing agent a stronger, more honest starting state. Judge semantic value across evaluation variants without rewarding SeedSpec vocabulary, file count, or document length by itself.

## Required evidence

Identify:

- the immutable run manifest and evaluation variant;
- the original author material and explicit simulated-author answers;
- the authoring instructions and exact tool/protocol versions;
- the final authored output;
- deterministic results, observable trace, and artifact manifest;
- the full evaluation case, including evaluator-only expectations.

Mark missing evidence as uncertainty. Never infer that a question was asked, a decision was authorized, or an outcome was proven.

## Procedure

1. Verify the evidence inventory and keep deterministic validity separate from semantic judgment.
2. Compare the output to source material and explicit author answers. Flag lost intent and unsupported invention.
3. Score every dimension in [references/rubric.md](references/rubric.md).
4. Check that goals, obligations, boundaries, forbidden states, material uncertainty, and meaningful freedoms are clear.
5. Distinguish package verification from adoption, operational, and outcome evidence. Never treat the first as proof of the others.
6. Assess whether an independent implementation agent can recognize success without being forced into an unnecessary architecture.
7. Apply evaluator-only expectations and permitted variability without leaking them back into the evaluated output.
8. Emit one canonical scorecard using [references/output.md](references/output.md), with artifact evidence behind every material judgment.

## Variant fairness

- For `source-only`, do not expect SeedSpec structure or protocol validity.
- For `seedspec-scaffold`, treat deterministic validity as a separate gate; do not assume structure created semantic quality.
- For `seedspec-guided-authoring`, judge the actual improvement produced, not whether the runner invoked every available tool.
- Apply the same semantic rubric and maximum points to every variant.

Do not edit the authored output. Recommendations belong in the scorecard assessment, not in evaluated artifacts.
