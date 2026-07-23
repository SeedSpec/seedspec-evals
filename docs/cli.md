# Agent-first CLI contract

`seedspec-eval` is designed to be called inside Codex, Claude Code, or another capable environment. Its default output is concise text that the calling agent can act on or relay without interpreting undocumented internal state. `--json` returns the same facts as versioned machine data.

Every response should contain:

- the command outcome and relevant identifier;
- the evaluation schema, harness, and protocol/tool versions used;
- paths or URLs for created or inspected artifacts;
- warnings and uncertainties;
- the valid next actions, including whether an action can invoke a paid model or change remote state.

The CLI must never imply that deterministic validation proves semantic quality. It must never start paid model execution as a side effect of listing, validating, planning, scoring existing evidence, or showing documentation.

## Initial vocabulary

```text
seedspec-eval cases list [--root <directory>]
seedspec-eval cases validate <case-or-directory>
seedspec-eval experiment plan [selectors, variants, and model matrix] [--out <file>]
seedspec-eval experiment skill-plan [selectors and model matrix] [--skill <file>] [--out <file>]
seedspec-eval experiment implementation-skill-plan --authored-input <directory> [selectors and model matrix] [--skill <file>] [--out <file>]
seedspec-eval experiment inspect <plan>
seedspec-eval run submit <manifest> --endpoint <url> --confirm-model-execution
seedspec-eval run status <run-id> --endpoint <url>
seedspec-eval run cancel <run-id> <submission-id> --endpoint <url>
seedspec-eval run trace <run-id> --endpoint <url> [--out <file>]
seedspec-eval matrix start <plan> --endpoint <url> --confirm-model-execution
seedspec-eval matrix status <plan-id> --endpoint <url>
seedspec-eval matrix cancel <plan> --endpoint <url>
seedspec-eval runner brief <plan-or-envelope> --runner codex|claude-code [--stdout]
seedspec-eval runner preflight <isolated-run-directory>
seedspec-eval runner codex-run <isolated-run-directory> --confirm-model-execution
seedspec-eval author answer <runner-source-envelope> --question <id>
seedspec-eval trace finalize <draft> [--out <file>]
seedspec-eval trace validate <trace>
seedspec-eval decision-ledger finalize <draft> [--out <file>]
seedspec-eval decision-ledger validate <ledger>
seedspec-eval implementation verify <run-directory> --confirm-code-execution [--allow-unsandboxed]
seedspec-eval evaluate deterministic <run-directory> [--seedspec-cli <file>]
seedspec-eval evaluate package-profile-brief <package-path> --runner codex|claude-code --judge-model <model>
seedspec-eval evaluate profile-brief <run-directory> --runner codex|claude-code --judge-model <model> [--reasoning-effort high]
seedspec-eval evaluate profile-finalize <draft> [--out <file>] [--evidence <file>]
seedspec-eval evaluate profile <profile>
seedspec-eval evaluate profile-run <run-directory> --confirm-model-execution
seedspec-eval evaluate profile-compare <profile...> [--out <file>]
seedspec-eval evaluate rubric-brief <run-directory> --runner codex|claude-code --judge-model <model>
seedspec-eval evaluate scorecard <scorecard>
seedspec-eval compare <scorecard...> [--baseline raw-source]
seedspec-eval docs [topic]
```

Implementation planning requires `--stage implementation --authored-input
<directory>`. The current parity profile accepts at most 384 KiB of UTF-8 files,
rejects symlinks and binary inputs, content-addresses the exact bytes, and
embeds the verified bundle for isolated runner mounting at `input/authored`.

`experiment plan` is deterministic. It expands selectors, models, stages, evaluation variants, and repetitions into immutable Think execution envelopes and reports estimated run count. Authorship defaults to `raw-source`, `markdown-authored`, `seedspec-minimal`, `seedspec-guided`, and `seedspec-restructured`. Raw and Markdown controls receive no SeedSpec tools; the minimal package receives only scaffolding and deterministic checks; guided and restructured variants receive semantic authoring support. Every variant remains recorded in the control-plane manifest, trace, artifacts, and scorecards.

`experiment implementation-skill-plan` creates the controlled implementation
guidance matrix: no guidance, the same text embedded in trusted instructions,
and the text delivered as a package-scoped skill. It binds every run to one
content-addressed authored package. Only the skill treatment receives the
separate skill file.

`runner brief` derives a runner-specific immutable manifest and copy/paste handoff while retaining the Think run as its comparison source. It writes only to an isolated directory outside the evaluation repository and places simulated answers in control-only storage. `runner preflight` fails unless the task is operating from that clean directory, identities and broker state match, and no protected response is present in runner-visible files. `runner codex-run` performs that preflight, executes the subject, and retains the raw Codex JSONL stream, provider usage, exact outer interval, stderr, final message, and finalized trace binding in `subject-run.json`. `author answer` accepts only the sanitized runner source envelope and returns one exact answer. `implementation verify` separately executes the realization's declared local verification commands after explicit operator confirmation, records actual outcomes, and checks claim-to-evidence links without judging test quality. On macOS it denies network access and writes outside a temporary directory through the operating-system sandbox, scrubs the inherited environment, and permits a bounded runtime allowlist. Other platforms fail closed unless the operator has already supplied external disposable isolation and explicitly passes `--allow-unsandboxed`. `evaluate deterministic` inventories the completed workspace and applies stage-appropriate checks to that executed evidence. Run profile briefs produce a compact, content-addressed evidence envelope with predeclared comparison axes and frozen evaluator-guidance digests; evidence-bound `profile-finalize` rejects subject, evaluator, or axis drift. `profile-run` is the Codex captured-evaluator path and requires explicit model-execution confirmation. `profile-compare` reports shared-axis observations without an aggregate score or winner. `evaluate rubric-brief` prepares an independent scored judging task but does not call a model. `compare` accepts like-for-like canonical scorecards and reports deltas from the selected baseline without claiming causality. `run submit`, `matrix start`, `runner codex-run`, and `evaluate profile-run` are the actions allowed to invoke a model and therefore require an explicit model-execution confirmation flag. `implementation verify` invokes local realization code, not a model, and therefore uses the distinct `--confirm-code-execution` gate.

Remote run commands read the bearer token from `SEEDSPEC_EVAL_API_TOKEN`; the CLI does not accept it as an ordinary command argument where it would be likely to remain in shell history. The Worker rejects all run routes when its corresponding secret is absent.

`run status` exposes Think submission state without presenting a pending turn as failed. Cancellation is idempotent. Matrix cancellation requires the matching immutable plan so the Worker can terminate the Workflow and cancel active children rather than orphaning model turns.

`run trace` exports the trace stored with a terminal Think run. Desktop runners write a trace body from their generated brief, then `trace finalize` adds a content-derived trace ID and `trace validate` verifies it. Trace capture is capability-declared: unavailable events remain unavailable, redactions are counted, and hidden chain-of-thought is always `not-collected`.

Implementation runners also produce a content-addressed decision ledger.
`decision-ledger finalize|validate` records observable decision summaries,
materiality, expected latitude, source citations, alternatives, and limitations
without collecting hidden reasoning. Independent evaluation verifies the ledger
rather than accepting its attribution claims as self-proving.

## Error shape

Text errors lead with a stable code and one-sentence explanation, followed by evidence and valid corrections. JSON errors use:

```json
{
  "ok": false,
  "error": {
    "code": "EVAL_CASE_INVALID",
    "message": "The case manifest did not validate.",
    "details": ["cases/example/case.yaml: expectations[0].id is required"]
  },
  "next": ["Correct the case and run `seedspec-eval cases validate ...` again."]
}
```

Do not emit stack traces by default. Do not copy secrets or entire private payloads into diagnostics.
