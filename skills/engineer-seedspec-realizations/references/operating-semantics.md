# Operating semantics

## Authority

Use the authority and precedence declared by the SeedSpec protocol and the
execution harness. In general:

- packaged core intent describes the author's solution intent;
- end-user additions describe how that intent applies to the current need;
- the selected implementation profile guides realization choices;
- package-scoped skills provide an engineering lens and procedure;
- the agent chooses implementation details that higher-authority inputs leave
  open.

Do not let supporting material or a skill silently override intent,
constraints, non-goals, or end-user choices. Surface contradictions whose
resolution would materially change the solution.

## Consultation semantics

A package or tool can recommend or direct consultation of a skill, but the
protocol cannot guarantee that an agent followed it correctly. Record the
skill identity supplied by the harness, the files actually read, applicable
gates, produced artifacts, and observable changes influenced by the skill.

Use these consultation states:

- `consulted`: the skill instructions were read and materially applied;
- `skipped`: the skill or a gate was intentionally not used, with a reason;
- `unavailable`: the skill or a necessary capability could not be accessed.

Do not equate mounting, naming, or reading a skill with consultation. Do not
equate consultation with a correct implementation.

## Gate semantics

Use one of these states for each gate:

- `open`: analysis or corrective work remains;
- `passed`: the stop condition was resolved and supporting evidence is named;
- `not-applicable`: the control objective does not apply, with a concrete
  reason;
- `qualified`: useful work exists, but a material risk or claim remains
  unestablished;
- `blocked`: proceeding or claiming completion would require new authority,
  unavailable capability, or unsafe guessing.

Apply gates proportionately. A low-impact static page should not receive the
same state-recovery analysis as a payment workflow. A high-impact automation
must not receive a lighter review merely because its code is small.

## Working record

Maintain one concise `REALIZATION_GATES.md`:

```md
# Realization gates

## Inputs consulted
- SeedSpec package:
- End-user state:
- Implementation profile:
- Skills and references:

## Risk
- Material harms:
- Irreversible choices:
- Review depth:

## Gate results
### G1 — Obligations: open
- Stop condition:
- Evidence:
- Findings and actions:

<!-- Repeat G2 through G7. -->

## Decision provenance
| Decision | Authority | Reason | Reversible? |
| --- | --- | --- | --- |

## Fresh verification
| Command or observation | Result | Establishes | Does not establish |
| --- | --- | --- | --- |

## Open limitations
- ...
```

Keep the record factual. Do not mark a gate passed solely because a section is
filled out.

## Evaluator independence

The implementation procedure and its evaluator may care about the same general
outcomes—correctness, security, reliability, maintainability, usability, and
credible evidence. They must not share a recipe whose wording, status markers,
file names, or attendance signals can manufacture a favorable judgment.

Use gates to create and challenge real behavior. Have an independent evaluator
inspect the realized artifacts, executed behavior, and evidence without
crediting `REALIZATION_GATES.md` or skill consultation by themselves. Revise a
gate when it reliably prevents defects across different problem shapes, not
because it echoes one benchmark's checks.
