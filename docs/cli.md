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
seedspec-eval experiment inspect <plan>
seedspec-eval run submit <manifest> --endpoint <url> --confirm-model-execution
seedspec-eval run status <run-id> --endpoint <url>
seedspec-eval run cancel <run-id> <submission-id> --endpoint <url>
seedspec-eval run trace <run-id> --endpoint <url> [--out <file>]
seedspec-eval matrix start <plan> --endpoint <url> --confirm-model-execution
seedspec-eval matrix status <plan-id> --endpoint <url>
seedspec-eval matrix cancel <plan> --endpoint <url>
seedspec-eval runner brief <plan-or-envelope> --runner codex|claude-code [--stdout]
seedspec-eval author answer <plan-or-envelope> --question <id>
seedspec-eval trace finalize <draft> [--out <file>]
seedspec-eval trace validate <trace>
seedspec-eval evaluate deterministic <run-directory> [--seedspec-cli <file>]
seedspec-eval evaluate rubric-brief <run-directory> --runner codex|claude-code --judge-model <model>
seedspec-eval evaluate scorecard <scorecard>
seedspec-eval compare <scorecard...> [--baseline source-only]
seedspec-eval docs [topic]
```

`experiment plan` is deterministic. It expands selectors, models, stages, evaluation variants, and repetitions into immutable Think execution envelopes and reports estimated run count. Authorship defaults to `source-only`, `seedspec-scaffold`, and `seedspec-guided-authoring`. The source-only prompt and tool surface omit SeedSpec guidance; every variant remains recorded in the control-plane manifest, trace, artifacts, and scorecards.

`runner brief` derives a runner-specific immutable manifest and copy/paste handoff while retaining the Think run as its comparison source. `evaluate deterministic` inventories the completed workspace and runs variant-appropriate checks. `evaluate rubric-brief` prepares an independent judging task but does not call a model. `compare` accepts like-for-like canonical scorecards and reports deltas from the selected baseline without claiming causality. `run submit` and `matrix start` are the actions allowed to invoke a model and therefore require an explicit confirmation flag in addition to remote authentication.

Remote run commands read the bearer token from `SEEDSPEC_EVAL_API_TOKEN`; the CLI does not accept it as an ordinary command argument where it would be likely to remain in shell history. The Worker rejects all run routes when its corresponding secret is absent.

`run status` exposes Think submission state without presenting a pending turn as failed. Cancellation is idempotent. Matrix cancellation requires the matching immutable plan so the Worker can terminate the Workflow and cancel active children rather than orphaning model turns.

`run trace` exports the trace stored with a terminal Think run. Desktop runners write a trace body from their generated brief, then `trace finalize` adds a content-derived trace ID and `trace validate` verifies it. Trace capture is capability-declared: unavailable events remain unavailable, redactions are counted, and hidden chain-of-thought is always `not-collected`.

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
