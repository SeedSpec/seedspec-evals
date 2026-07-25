# Evaluation suites

Suites evaluate SeedSpec interventions that do not fit the authorship and
implementation case corpus.

- `public-tool-acquisition/` evaluates whether cold agents can discover and use
  compatible first-party SeedSpec tooling from the canonical buyer instruction.

Each suite owns its structured scenarios, trusted runner scope, untrusted or
buyer-facing inputs, deterministic observation contract, and retained evidence
requirements. Model runs remain explicit and must preserve exact suite,
instruction, runner, model, environment, and tool identities.
