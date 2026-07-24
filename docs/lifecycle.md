# Evaluation lifecycle

1. **Define a case.** Commit sparse source material, the authoring mode, constraints, hidden expectations, and permitted variability.
2. **Validate the case.** Reject invalid structure, unsafe paths, missing versions, or evaluator expectations that cannot be measured.
3. **Plan an experiment.** Expand cases × evaluation variants × runners × models × repetitions into immutable run manifests with stable IDs.
4. **Execute authorship.** Generate one runner-safe project per raw-source, general-Markdown, minimal-SeedSpec, guided-SeedSpec, and restructured-SeedSpec variant. Pass deterministic preflight, then capture final output and observable traces without exposing control-plane fixtures.
5. **Evaluate the output.** Inventory artifacts, run variant-appropriate deterministic checks, and conduct an independent rubric review using the same semantic rubric for every variant.
6. **Execute implementations.** Give independent implementation agents clean workspaces and the authored package. Do not leak prior implementation choices.
7. **Evaluate outcomes.** Measure satisfaction of declared success criteria, package fidelity, unsupported assumptions, and implementation quality.
8. **Compare runs.** Describe gradients against the raw-source baseline; separately report decision provenance, obligation coverage, structure, implementation congruency, legitimate variation, technical evidence, cost, tokens, timing, and failures. A comparison need not declare a winner.
9. **Curate learning.** Promote useful cases or evaluators only after human review. Never silently rewrite the protocol from model judgments.

Every artifact is associated with the case version, run ID, evaluation variant, frozen SeedSpec protocol revision where applicable, authoring-tool version, harness version, runner identity, model identifier, evaluator versions, and timestamps.
