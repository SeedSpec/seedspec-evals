---
name: evaluate-seedspec-authorship
description: Evaluate a SeedSpec authoring run by comparing the author's source material, authoring-tool instructions, decisions, audit state, and resulting package. Use for SeedSpec authoring experiments, authoring-tool regressions, before/after package comparisons, and judging whether protocol-aware guidance materially improved an initially sparse specification.
---

# Evaluate SeedSpec authorship

Assess whether the authoring process produced a stronger, more honest, more agent-ready package. Do not reward added volume by itself.

## Inputs

Require or identify:

- the original author material;
- the authoring instructions and exact tool/protocol versions;
- questions, author answers, deferred decisions, and applied changes;
- the final package and validation output;
- the case expectations, with hidden expectations withheld from the authoring agent.

Mark missing evidence as an uncertainty. Never infer that a question was asked or a decision was authorized.

## Procedure

1. Validate the evidence inventory and keep deterministic validator results separate from semantic judgment.
2. Compare the final package to original material and explicit author answers. Flag unsupported invented requirements.
3. Evaluate each of the six authoring areas using [references/rubric.md](references/rubric.md).
4. Identify consequential ambiguity that remains, ambiguity resolved without author authority, and harmless implementation freedom correctly left open.
5. Check that transient questions, speculation, and authoring state did not leak into the distributable package as selected intent.
6. Decide whether the final package gives an independent implementing agent a materially better starting state than the original input.
7. Emit one machine-readable result using [references/output.md](references/output.md). Put evidence paths or concise excerpts behind every material score or finding.

## Judgment rules

- Reward clarity, traceability, testability, honest uncertainty, and proper concern separation.
- Do not reward technical prescription unless the source or author made it part of intent.
- Do not penalize legitimate provider-specific intent merely for being nonportable.
- Treat `kind` as an authoring lens, not a template or validity gate.
- Treat `completed` audit passes as review records, not certification.
- Give a high score only when another agent can act with less material guesswork and without losing intended implementation freedom.

Do not edit the package during evaluation. Recommendations belong in findings, not in the evaluated artifact.
