# SeedSpec evaluation labs

This repository tests whether SeedSpec's protocol and authoring tools do useful work. It measures the path from sparse intent to an authored package, and from a package to independent implementations, across multiple agents and models.

The cloud harness extends Cloudflare Think. A Think Durable Object instance owns one isolated evaluation run, including its turn history and workspace. A Worker API creates uniquely named instances and submits work durably. Models are selected through Cloudflare AI Gateway configuration rather than compiled into the harness.

## Initial labs

1. **Authorship** — can SeedSpec's authoring guidance turn incomplete input into a materially stronger package?
2. **Implementation** — can independent agents realize the same package without inheriting each other's choices?
3. **Congruency** — which outcomes remain consistent, which vary legitimately, and which violate the specification?
4. **Adversarial** — does the system reject malformed, conflicting, unsafe, or instruction-injecting inputs?

The first scenario corpus covers a sparse application, a feature for an existing product, a configured cross-system workflow, and extraction of a reusable SeedSpec from an existing solution.

## Repository map

- `packages/eval-core` — versioned schemas and run contracts
- `packages/case-library` — case discovery and loading
- `packages/harness` — Think-specific run configuration and prompts
- `packages/evaluators` — deterministic and rubric-based scoring
- `packages/cli` — local and remote lab commands
- `apps/worker` — Cloudflare Worker, Think agent, and durable run API
- `cases` — committed, reviewable evaluation inputs and expectations
- `skills` — evaluator guidance delivered to capable agents
- `vendor/protocol` — frozen, unpublished protocol snapshot used by the current experiments
- `docs` — architecture, lifecycle, and experiment notes

This alpha is distributed as a repository. Its workspace packages are intentionally private and are not published to npm. A public eval library or CLI should be published only when external consumers need a stable programmatic interface rather than a clone-and-run lab.

## Safety posture

Model execution is opt-in. The initial harness disables Think's workspace shell, does not expose network or browser tools, does not persist model reasoning, and restricts each run to a dedicated Durable Object workspace. Local validation and Worker dry runs do not call a model.

The Worker API is intentionally not deployed by this repository setup. Every run route fails closed unless a service bearer token is configured; Cloudflare Access or signed per-user authorization is still required before multi-user use. The file-only tool profile can exercise authorship, clarification, and configured-artifact tasks; general application implementation needs a separately isolated code-execution profile rather than enabling a broad shell for hostile-input runs.

## Development

Requires Node.js 24 or newer.

```sh
npm install
npm run protocol:sync -- ../seedspec
npm run worker:types
npm run check
```

Inspect the corpus and create a model matrix without invoking inference:

```sh
node packages/cli/dist/index.js cases list --root cases
node packages/cli/dist/index.js experiment plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model openai/gpt-5.6-sol \
  --out runs/first-authorship-plan.json

node packages/cli/dist/index.js experiment inspect \
  runs/first-authorship-plan.json
```

The authorship plan creates three explicit evaluation variants: `source-only`, `seedspec-scaffold`, and `seedspec-guided-authoring`. The first receives neither SeedSpec guidance nor SeedSpec tools. The plan command writes control-plane execution envelopes beneath `runs/`, which is ignored by Git. Plans may contain evaluator-only fixtures and must never be copied into a desktop runner project. Submitting one envelope is a separate operation and requires `--confirm-model-execution`.

## Run the same experiment in Codex, Claude Code, and Think

Generate a copy/paste brief for a clean Codex desktop task:

```sh
node packages/cli/dist/index.js runner brief runs/first-authorship-plan.json \
  --run <run-id-from-experiment-inspect> \
  --runner codex
```

By default, the command creates a new isolated directory under `~/Code/agent-eval-runs` when the repository is under `~/Code`. It refuses to create a runner kit anywhere inside `seedspec-evals`. Open the generated directory—not this repository—as a new Codex project, paste its `handoff.md` into a clean task, and begin with `node runner-control.mjs preflight`. Continue only when it reports `READY`.

Repeat once for each variant. For Claude Code, replace `codex` with `claude-code`. The runner-safe envelope contains the reviewed case and available clarification IDs but no simulated answers. A control record outside the runner project exposes one answer at a time through `runner-control.mjs answer`. The brief also carries variant-specific instructions and tools, the requested model, required outputs, and the portable observable-trace contract. Select the same underlying model and snapshot. If it is unavailable, create a new run identity for the actual model rather than calling the run matched.

After a desktop run finishes, inventory and score its deterministic evidence:

```sh
node packages/cli/dist/index.js evaluate deterministic \
  <isolated-run-directory>

node packages/cli/dist/index.js evaluate rubric-brief \
  <isolated-run-directory> \
  --runner codex \
  --judge-model <independent-judge-model>
```

Run the emitted evaluator brief in a separate clean task. After all three canonical rubric scorecards validate, compare them:

```sh
node packages/cli/dist/index.js compare \
  <source-only-run>/rubric-scorecard.json \
  <scaffold-run>/rubric-scorecard.json \
  <guided-run>/rubric-scorecard.json \
  --baseline source-only
```

Run the matching Think matrix only after reviewing the plan:

```sh
node packages/cli/dist/index.js matrix start runs/<plan>.json \
  --endpoint <worker-url> \
  --confirm-model-execution
```

Think stores observable execution events durably with the run. Codex and Claude Code write the same trace shape from the generated brief. Traces include messages, tool activity, timing, usage when available, artifacts, errors, redactions, and capture limitations; hidden reasoning is never collected. See [the parity-runner and trace instructions](docs/runners.md) for the full copy/paste workflow.

The three bundled evaluator skills cover authorship value, implementation fidelity and congruency, and adversarial probing. They emit evidence-linked, machine-readable judgments while keeping deterministic failures separate from rubric scores.

Copy `apps/worker/.dev.vars.example` only when you are ready to test authenticated remote operation. Never commit `.dev.vars`.

See [the full lab plan](docs/labs.md), [execution architecture](docs/architecture.md), [parity runners and traces](docs/runners.md), [CLI contract](docs/cli.md), and [open decisions](docs/open-decisions.md).
