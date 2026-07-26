# Evaluation suites

Suites evaluate SeedSpec interventions that do not fit the authorship and
implementation case corpus.

- `public-tool-acquisition/` evaluates whether cold agents can discover and use
  compatible first-party SeedSpec tooling from the canonical buyer instruction.
- `behavioral/` contains paired skill screens ranging from stable action
  regression guards to structured decision artifacts and sandboxed executable
  micro-implementations with retained valid and known-bad controls.

Each suite owns its structured scenarios, trusted runner scope, untrusted or
buyer-facing inputs, deterministic observation contract, and retained evidence
requirements. Model runs remain explicit and must preserve exact suite,
instruction, runner, model, environment, and tool identities.
