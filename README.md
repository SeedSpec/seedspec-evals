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
- `docs` — architecture, lifecycle, and experiment notes

## Safety posture

Model execution is opt-in. The initial harness disables Think's workspace shell, does not expose network or browser tools, does not persist model reasoning, and restricts each run to a dedicated Durable Object workspace. Local validation and Worker dry runs do not call a model.

The Worker API is intentionally not deployed by this repository setup. Every run route fails closed unless a service bearer token is configured; Cloudflare Access or signed per-user authorization is still required before multi-user use. The file-only tool profile can exercise authorship, clarification, and configured-artifact tasks; general application implementation needs a separately isolated code-execution profile rather than enabling a broad shell for hostile-input runs.

## Development

Requires Node.js 24 or newer.

```sh
npm install
npm run worker:types
npm run check
```

Inspect the corpus and create a model matrix without invoking inference:

```sh
node packages/cli/dist/index.js cases list --root cases
node packages/cli/dist/index.js experiment plan \
  --root cases \
  --model @cf/moonshotai/kimi-k2.6 openai/gpt-4.1-mini
```

The plan command writes immutable execution envelopes beneath `runs/`, which is ignored by Git. Submitting one envelope is a separate operation and requires `--confirm-model-execution`.

The three bundled evaluator skills cover authorship value, implementation fidelity and congruency, and adversarial probing. They emit evidence-linked, machine-readable judgments while keeping deterministic failures separate from rubric scores.

Copy `apps/worker/.dev.vars.example` only when you are ready to test authenticated remote operation. Never commit `.dev.vars`.

See [the full lab plan](docs/labs.md), [execution architecture](docs/architecture.md), [CLI contract](docs/cli.md), and [open decisions](docs/open-decisions.md).
