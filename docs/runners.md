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
  --runner codex
```

Repeat for the raw-source, Markdown-authored, minimal-SeedSpec, guided-SeedSpec, and restructured-SeedSpec run IDs. Each command creates an isolated runner directory outside this repository; an explicit `--out` inside `seedspec-evals` is rejected. Open each generated directory as its own Codex project, paste `handoff.md` into a clean task, and run `node runner-control.mjs preflight` before doing any evaluation work. The preflight requires the task working directory to equal the runner directory, rejects pre-existing output, verifies run identity and the author broker, and detects protected answers in runner-visible files without printing them.

The runner-safe `source-envelope.json` contains source material, trusted instructions, and available clarification IDs, but not the answer map. The answer map lives in control-only storage outside the runner project. `node runner-control.mjs answer --question <id>` returns only the requested pre-declared answer. Select the requested underlying model and snapshot. If it is unavailable, create a new run identity for the actual model instead of calling the run matched. If Codex cannot expose a requested trace field, it must declare the limitation instead of filling it speculatively.

The agent that plans an experiment may build this repository and generate the kit. The evaluated agent must receive only the isolated runner project; do not open it on `seedspec-evals`, because committed cases and control-plane plans contain evaluator-only material.

## 3. Claude Code

```sh
node packages/cli/dist/index.js runner brief runs/first-parity-plan.json \
  --run <one-run-id-from-experiment-inspect> \
  --runner claude-code
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
node runner-control.mjs finalize-trace
# From the evaluation repository after the run:
node packages/cli/dist/index.js trace validate <isolated-run-directory>/trace.json
```

Control-plane plans under `runs/` are ignored by Git. Desktop evidence lives in separately isolated runner directories. Preserve a complete experiment directory in controlled storage when the evidence matters; a Git checkout alone is not a trace archive. Traces may contain prompts, outputs, tool inputs, and tool results, so review them for credentials, personal data, and customer material before sharing. Record redaction counts and reasons in the trace rather than silently editing evidence.

Desktop isolation prevents ordinary repository searches from exposing fixtures; it is not a hard security boundary against an intentionally malicious local agent with unrestricted filesystem access. Think provides the stronger boundary because the model receives narrow tools and cannot inspect its Durable Object configuration.

## 6. Score and compare authorship variants

Run `evaluate deterministic` for each completed run directory. Then use `evaluate profile-brief` to create a descriptive decision, evidence, structure, process, and technical profile. Use `evaluate rubric-brief` only when a predeclared scored comparison is required. Validate returned scorecards with `evaluate scorecard` and compare like-for-like rubric scorecards with `compare --baseline raw-source`.

The trace contract deliberately excludes hidden chain-of-thought. Comparable evidence consists of observable inputs and outputs, tool activity, artifacts, timing, usage where exposed, errors, and declared capture limitations.
