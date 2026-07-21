# Evaluation lifecycle

1. **Define a case.** Commit sparse source material, the authoring mode, constraints, hidden expectations, and permitted variability.
2. **Validate the case.** Reject invalid structure, unsafe paths, missing versions, or evaluator expectations that cannot be measured.
3. **Plan an experiment.** Expand cases × runners × models × repetitions into immutable run manifests with stable IDs.
4. **Execute authorship.** Give the authoring agent the source material and current SeedSpec guidance. Capture all package revisions and review artifacts.
5. **Evaluate the package.** Run deterministic protocol checks and agent rubric reviews. Keep the two result classes distinct.
6. **Execute implementations.** Give independent implementation agents clean workspaces and the authored package. Do not leak prior implementation choices.
7. **Evaluate outcomes.** Measure satisfaction of declared success criteria, package fidelity, unsupported assumptions, and implementation quality.
8. **Compare runs.** Report congruency, legitimate implementation variation, tool/model-specific differences, cost, tokens, timing, and failures.
9. **Curate learning.** Promote useful cases or evaluators only after human review. Never silently rewrite the protocol from model judgments.

Every artifact is associated with the case version, run ID, SeedSpec protocol version, authoring-tool version, harness version, runner identity, model identifier, evaluator versions, and timestamps.
