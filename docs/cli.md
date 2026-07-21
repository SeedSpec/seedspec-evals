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
seedspec-eval experiment plan [selectors and model matrix] [--out <file>]
seedspec-eval run submit <manifest> --endpoint <url> --confirm-model-execution
seedspec-eval run status <run-id> --endpoint <url>
seedspec-eval run cancel <run-id> --endpoint <url>
seedspec-eval evaluate deterministic <run-directory>
seedspec-eval compare <scorecard...>
seedspec-eval docs [topic]
```

`experiment plan` is deterministic. It expands selectors, models, runners, stages, and repetitions into immutable run manifests and reports estimated run count. `run submit` is the first action allowed to invoke a model and therefore requires an explicit confirmation flag in addition to any remote authentication.

Remote run commands read the bearer token from `SEEDSPEC_EVAL_API_TOKEN`; the CLI does not accept it as an ordinary command argument where it would be likely to remain in shell history. The Worker rejects all run routes when its corresponding secret is absent.

`run status` should expose Think submission state without presenting a pending turn as failed. `cancel` is idempotent. Future Workflow-owned matrices should reuse the same experiment and run identifiers rather than introduce a second run format.

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
