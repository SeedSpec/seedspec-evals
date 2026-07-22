# Running parity experiments in Think, Codex, and Claude Code

The same committed case, evaluation variant, trusted instructions, frozen protocol revision where applicable, and requested model should be used for every parity run. Each environment receives its own immutable run manifest because runner identity is part of reproducibility. The generated desktop manifest records the Think run as `sourceRunId` so results remain comparable without pretending they were the same execution.

## 1. Build and plan without calling a model

```sh
npm install
npm run build
node packages/cli/dist/index.js experiment plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model <gateway-provider/model> \
  --out runs/first-parity-plan.json

node packages/cli/dist/index.js experiment inspect runs/first-parity-plan.json
```

Review the plan before authorizing inference. Planning, brief generation, and trace validation do not call a model.

## 2. Codex desktop

```sh
node packages/cli/dist/index.js runner brief runs/first-parity-plan.json \
  --run <one-run-id-from-experiment-inspect> \
  --runner codex \
  --out runs/first-authorship/<variant>
```

Repeat for the source-only, scaffold, and guided-authoring run IDs. Copy each generated `handoff.md` into a separate Codex task with a clean workspace. Select the requested underlying model and snapshot. If it is unavailable, create a new run identity for the actual model instead of calling the run matched. The brief tells the agent where to write its authored output, evidence report, and observable trace draft. It also gives the agent a deterministic `author answer` command so clarifications use the same pre-declared responses as Think without exposing every answer up front. If Codex cannot expose a requested trace field, it must declare the limitation instead of filling it speculatively.

An agent given this repository's README can follow the same steps: ask it to build the project, create or inspect the reviewed plan, run `runner brief --runner codex --stdout`, and execute the emitted brief in a clean task.

## 3. Claude Code

```sh
node packages/cli/dist/index.js runner brief runs/first-parity-plan.json \
  --run <one-run-id-from-experiment-inspect> \
  --runner claude-code \
  --out runs/first-authorship/<variant>
```

Paste the output into a clean Claude Code session. Configure the same underlying model and snapshot. If it is unavailable, generate a new run identity for the actual model; do not treat similar product labels as evidence of model parity.

## 4. Cloudflare Think

After deploying the Worker and setting `SEEDSPEC_EVAL_API_TOKEN`, run the reviewed plan through the Workflow coordinator:

```sh
node packages/cli/dist/index.js matrix start runs/first-parity-plan.json \
  --endpoint <worker-url> \
  --confirm-model-execution

node packages/cli/dist/index.js matrix status <plan-id> \
  --endpoint <worker-url>
```

The confirmation flag is intentionally required at the model-execution boundary. The coordinator durably submits each envelope, polls child runs, and returns a compact result. Cancelling with the matching plan terminates the coordinator and requests cancellation for active child runs.

For a single envelope, `run submit` remains available.

## 5. Preserve traces

Think records observable messages, tool calls and results, token usage, timing, statuses, and errors in the run Durable Object. It never persists model reasoning. Export a terminal trace with:

```sh
node packages/cli/dist/index.js run trace <run-id> \
  --endpoint <worker-url>
```

Codex and Claude Code write a trace body from the template embedded in their generated brief. Finalize and content-address it with:

```sh
node packages/cli/dist/index.js trace finalize runs/<run-id>/trace-draft.json
node packages/cli/dist/index.js trace validate runs/<run-id>/trace.json
```

`runs/` is ignored by Git. Preserve a complete experiment directory in controlled storage when the evidence matters; a Git checkout alone is not a trace archive. Traces may contain prompts, outputs, tool inputs, and tool results, so review them for credentials, personal data, and customer material before sharing. Record redaction counts and reasons in the trace rather than silently editing evidence.

## 6. Score and compare authorship variants

Run `evaluate deterministic` for each completed run directory. Then use `evaluate rubric-brief` to create an independent judging task using the same rubric for every variant. Validate each returned scorecard with `evaluate scorecard` and compare like-for-like rubric scorecards with `compare --baseline source-only`.

The trace contract deliberately excludes hidden chain-of-thought. Comparable evidence consists of observable inputs and outputs, tool activity, artifacts, timing, usage where exposed, errors, and declared capture limitations.
