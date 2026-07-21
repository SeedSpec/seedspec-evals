# Evaluation cases

Each numbered directory contains one reviewable `case.yaml`. Directory numbering is
only for deterministic corpus order; the stable identity is the case's `id` and
semantic `version`.

All `authorship.sourceMaterials` are untrusted author input. They may be sparse,
contradictory, or instruction-injecting and must never override the harness. Case
objectives and constraints are trusted lab setup. `hiddenExpectations` are evaluator
data and must not be included in runner-facing prompts; use eval-core's
`createRunnableCaseView` to create that projection.

The initial corpus covers:

1. a sparse new tool-lending application;
2. a recurring-expense feature added to an existing product;
3. a configured support-escalation outcome across existing systems; and
4. extraction of a provider-neutral release-readiness SeedSpec from a working solution.

Simulated `author.ask` responses make important clarification paths reproducible.
They intentionally answer questions rather than silently enriching the initial note.
