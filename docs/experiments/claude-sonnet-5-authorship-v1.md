# Claude Sonnet 5 authorship gradient

Date: 2026-07-24  
Case: `sparse-neighborhood-tool-lending@1.1.0`  
Subject runner: Claude Code CLI `2.0.64`  
Subject model: `anthropic/claude-sonnet-5`  
Independent evaluator: `openai/gpt-5.6-sol`, high reasoning effort

## Question

Can the captured Claude Code runner execute the existing authorship gradient
with a current Anthropic model, and what quality, cost, and duration gradient
appears across the treatments?

This experiment is an adapter and direction-finding run. It is one repetition
of one case and does not establish general model or treatment superiority.

## Controls

- The case, author-response map, model, Claude Code version, output contract,
  protocol snapshot, and 15-minute run limit were held constant.
- Each treatment received its own content-addressed run identity and isolated
  workspace.
- The model never received hidden expectations or evaluator-only comparison
  axes.
- Claude Code settings, MCP servers, session persistence, web tools, and slash
  commands were disabled.
- The adapter retained provider JSONL events, exact provider usage and cost,
  the resolved model, session identity, outer timing, final response, artifacts,
  and the finalized portable trace.
- Thinking blocks were removed before event storage and recorded as capture
  limitations.
- Sol produced descriptive profiles from compact, content-addressed evidence.
  It did not assign an aggregate score or winner.

Anthropic documents `claude-sonnet-5` as the current Sonnet model and as a
pinned model ID rather than an evergreen alias:

- <https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5>
- <https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions>

## Execution results

| Treatment | Status | Duration | Exact subject cost | Provider total tokens |
|---|---|---:|---:|---:|
| raw-source | succeeded | 2m 21s | $0.3446 | 247,837 |
| markdown-authored | succeeded | 4m 9s | $0.5525 | 539,819 |
| seedspec-minimal | succeeded | 6m 28s | $1.0620 | 1,301,461 |
| seedspec-guided | succeeded | 9m 33s | $1.9556 | 3,086,803 |
| seedspec-restructured | failed at duration boundary | 15m 8s outer capture | unavailable without a terminal provider result | unavailable |

The restructured run produced a valid-looking package before termination but
did not produce its required report or finalized trace. The contract gate
therefore treats it as failed evidence, not as a successful package merely
because distributable files existed.

## Descriptive profile observations

| Treatment | Aligned decisions | Ambient decisions | Covered obligations | Partial obligations | Uncovered obligations |
|---|---:|---:|---:|---:|---:|
| raw-source | 2 | 3 | 1 | 5 | 3 |
| markdown-authored | 4 | 0 | 4 | 4 | 1 |
| seedspec-minimal | 4 | 1 | 3 | 4 | 2 |
| seedspec-guided | 3 | 3 | 4 | 4 | 1 |

The shared decision and obligation axes are evaluator denominators, not
instructions shown to the subject.

### Raw source

The zero-shot instructions preserved implementation latitude and rejected the
hostile embedded content, but they left critical custody and concurrency
semantics incomplete and planned little distinguishing evidence.

### General Markdown

The Markdown treatment asked all three available material author questions,
preserved their authority cleanly, and produced the strongest decision
alignment per dollar in this single run. Its main gaps were concurrent-request
exclusivity, cancellation behavior, and complete accessibility evidence.

### Minimal SeedSpec

The minimal package validated and routed more intent into explicit definition,
configuration, and acceptance files. It also introduced two internal conflicts:
a broad Resident permission contradicted lender-only custody, and a
configuration description overstated how much behavior was fixed.

### Guided SeedSpec

The guided package covered more lifecycle behavior and acceptance scenarios,
but it selected competing-request admission, cancellation, and identity policy
without attributable author authority. It also contradicted itself about
whether a request may be submitted while a tool is already on loan. More audit
work produced more surface area, but not uniformly better authority discipline.

### Restructured SeedSpec

The restructuring treatment exceeded the immutable duration limit. Its partial
workspace is useful diagnostic material but not successful evaluation
evidence. The treatment needs a smaller bounded pass, resumable phases, or a
clear stop rule before it is suitable for this harness.

## Lab defects exposed and corrected

1. The first Claude adapter did not enforce the manifest duration limit. It now
   terminates the child process at that boundary and records a failed run.
2. The deterministic contract gate initially validated present package files
   without checking successful subject completion and finalized trace evidence.
   It now treats those as first-class run-integrity requirements.
3. Provider usage needed separate cache-creation tokens and exact cost. The
   captured-run schema now preserves both without estimating unavailable data.

## Direction

This run supports first-class Claude Code evaluation and rejects a simplistic
“more guidance is always better” conclusion. The next authoring-tool iteration
should retain the semantic placement and evidence advantages of SeedSpec while:

- prioritizing material unresolved decisions before expanding solution detail;
- preventing the audit from silently selecting policy;
- detecting cross-file contradictions before adding more content;
- giving the agent a bounded audit budget and explicit stopping condition; and
- testing whether the restructuring pass should be narrower or resumable.

Repeat this matrix across additional cases and at least three repetitions before
promoting these observations into protocol-wide claims.
