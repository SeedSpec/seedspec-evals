# Evaluation lab plan

## Purpose

The labs answer one product question: does SeedSpec produce specifications and implementations that are materially better than asking a capable agent to work from the same source material without SeedSpec?

The protocol is doing useful work only when its advantages survive different cases, agents, models, repetitions, and target environments.

## Lab 1: authorship value

Run each scenario through five evaluation variants:

1. **Raw-source control** — give the agent only original author material, no simulated-author answers, and ask once for implementation-ready instructions.
2. **General Markdown authorship** — add strong general specification guidance but no SeedSpec concepts or tools.
3. **Minimal SeedSpec** — use `seedspec init` and deterministic validation without semantic authoring guidance.
4. **Guided SeedSpec authorship** — run the full seven-area audit with an author simulator or a person supplying recorded decisions.
5. **Restructured SeedSpec** — add a dedicated semantic restructuring pass that assigns canonical concern ownership, removes duplicated authority, preserves meaning, and records decision provenance.

Normalized constraints, success criteria, permitted variability, simulated
answers, and hidden expectations remain outside runner material. Measure
protocol validity, source fidelity, unresolved material ambiguity, unsupported
invention, concern separation, decision provenance, obligation-to-evidence
coverage, kind-specific coverage, handoff quality, author interactions, elapsed
time, token and cache use, and evaluator confidence.

The main comparison is not document length or a single winning score. It is the
gradient of evidence describing whether each treatment gives an independent
agent a better starting state while preserving legitimate implementation
freedom.

## Descriptive evaluation profiles

Each completed run can produce a content-addressed profile containing:

- consequential decisions, materiality, expected latitude, proposed and
  selecting parties, constraints, disclosure, alignment, confidence, and
  evidence;
- obligations mapped to planned and observed distinguishing evidence;
- duplicated, misplaced, conflicting, overloaded, fragmented, or clearly
  owned package concerns;
- turns, clarification and correction cycles, tokens, cache use, tool calls,
  and duration at their actual capture level; and
- read-only technical checks and explicitly authorized adaptation challenges.

Profiles are descriptive. A package that delegates architecture may be as
intentional as one that ships normative reference code. The relevant signal is
whether observed decisioning matches expected latitude, not whether the author
made the most decisions.

## Lab 2: harness parity

Run the same bounded tasks in:

- Codex;
- Claude Code;
- the SeedSpec Cloudflare Think harness;
- multiple models through Cloudflare AI Gateway.

Capture runner and harness versions, model identifiers, instructions, tool availability, turn transcripts, tool events, workspace artifacts, token and timing data, failures, and retries. Tool surfaces do not need to be identical, but every difference must be explicit in the run manifest and comparison report.

The initial parity gate is modest: the custom harness must durably accept work, isolate runs, produce the required artifacts, expose status, and preserve enough evidence to explain a difference. It does not need to reproduce every feature of Codex or Claude Code.

## Lab 3: scenario corpus

The first four cases exercise different SeedSpec shapes:

| Case | Main pressure |
| --- | --- |
| Sparse application | Discover actors, rules, workflows, failures, and success from an under-specified idea |
| Existing-product feature | Preserve the host boundary and avoid replacing or over-prescribing the product |
| Cross-system workflow | Describe authority, state changes, idempotency, recovery, and non-code evidence |
| Existing-solution extraction | Separate durable intent from accidental architecture and implementation history |

Each case contains public input, deterministic simulated author answers, hidden expectations, permitted variation, and measurable success targets. Hidden material must never enter the authoring agent's context.

Cases may later be promoted into public examples, but evaluation usefulness takes precedence over polish. A case version changes whenever its inputs, hidden expectations, or scoring contract changes materially.

## Lab 4: independent implementations and congruency

For each authored package, start implementation agents from clean workspaces. Vary model, runner, and—where the package permits it—implementation profile or end-user preference.

Evaluate each outcome independently against the package before comparing outcomes to one another. Then classify variation across these layers:

1. observable outcome;
2. required behavior and business rules;
3. selected configuration and constraints;
4. data meaning and authority;
5. operational and acceptance evidence;
6. implementation profile adherence;
7. reversible architecture and technology choices.

High congruency in layers 1–5 is normally desirable. Variation in layer 7 is expected and may be evidence that SeedSpec preserved implementation freedom. Profile variation is acceptable only when it remains subordinate to resolved intent and explicit user direction.

Authors can use these reports to tighten ambiguity, clarify success, or deliberately preserve freedom. The lab must not optimize every package toward deterministic code shape.

## Lab 5: adversarial and nonconformant inputs

Maintain two suites:

- **deterministic robustness** for schema, path, size, digest, state, and API-boundary failures;
- **agent robustness** for prompt injection, authority confusion, unsafe resource instructions, fabricated evidence, and conflicting intent.

Run hostile cases with the smallest tool surface. Network, browser, shell, external writes, and live credentials remain disabled unless a particular isolated test requires and explicitly authorizes one of them.

No model judgment can override a deterministic safety failure. Model output is untrusted input to the evaluator pipeline and must itself validate before being aggregated.

## Reproducibility record

Every run records:

- case ID and version;
- immutable run ID and parent experiment ID;
- stage and evaluation variant;
- SeedSpec protocol, CLI, and authoring instruction versions;
- runner, harness, model, gateway, and evaluator versions;
- prompts or instruction artifacts by digest;
- allowed tools and relevant environment facts;
- timestamps, token use, cost when available, retries, and terminal status;
- input and output artifact digests;
- deterministic results and rubric results as separate records.

The lab must be able to explain what changed between two runs before it claims that a model, tool, protocol, or prompt improved.

## Promotion gates

An evaluator becomes author-facing only after it demonstrates useful discrimination across multiple cases and models, acceptable repeatability, evidence-linked findings, and low rates of confident false positives. A scenario becomes a regression case only after its expected boundary and failure condition are explicit. A model-specific workaround stays in harness configuration unless evidence shows it belongs in portable authoring guidance.
