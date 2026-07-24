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

The 0.2 evaluation toolchain is distributed as a repository. Its workspace
packages are intentionally private and are not published to npm. A public eval
library or CLI should be published only when external consumers need a stable
programmatic interface rather than a clone-and-run lab. See the
[evidence published with SeedSpec 0.2](docs/0.2-evidence.md) for the narrow
findings and their limits.

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

The authorship plan creates a five-step treatment gradient: `raw-source`,
`markdown-authored`, `seedspec-minimal`, `seedspec-guided`, and
`seedspec-restructured`. Raw and general-Markdown runs receive no SeedSpec
guidance or tools. The raw control is deliberately zero-shot and has no
simulated-author answers; the other authoring treatments may ask the same
predeclared simulated author. Minimal SeedSpec receives scaffolding and deterministic
checks only. Guided SeedSpec adds semantic audits, while the restructured
variant adds canonical concern ownership and decision provenance. Normalized
case constraints, scoring criteria, hidden expectations, and permitted
variability remain evaluator-only rather than leaking into authoring prompts.

The plan command writes control-plane execution envelopes beneath `runs/`,
which is ignored by Git. Plans may contain evaluator-only fixtures and must
never be copied into a desktop runner project. Submitting one envelope is a
separate operation and requires `--confirm-model-execution`.

Implementation experiments use an actual authored workspace, not a symbolic
artifact reference:

```sh
node packages/cli/dist/index.js experiment plan \
  --root cases \
  --case <case-with-an-implementation-stage> \
  --stage implementation \
  --model <model> \
  --authored-input <completed-authorship-run>/workspace
```

The CLI content-addresses the files and mounts a verified read-only copy at
`input/authored` in each implementation runner.

### Package-scoped implementation skill experiment

The first implementation-skill lab holds the authored package, case, model,
runner, and output contract constant across three treatments:

1. `no-guidance` — ordinary implementation judgment and no supplied skill;
2. `embedded-guidance` — the exact skill text embedded in trusted runner
   instructions, without a separately consulted skill;
3. `skill-guidance` — the same text delivered as a package-scoped `SKILL.md`
   that the implementing agent must consult and record.

Create that matrix with:

```sh
node packages/cli/dist/index.js experiment implementation-skill-plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model openai/gpt-5.6-sol \
  --repetitions 3 \
  --authored-input <completed-authorship-run>/workspace \
  --out runs/implementation-skill-v1-plan.json
```

Every treatment receives the same content-addressed authored package. Only the
skill treatment receives a materialized `guidance/implement-stateful-workflows/SKILL.md`;
the control cannot inspect the skill source, and the embedded treatment cannot
claim skill consultation. The skill guides implementation but does not judge
its own output.

## Run the same experiment in Codex, Claude Code, and Think

Generate a copy/paste brief for a clean Codex desktop task:

```sh
node packages/cli/dist/index.js runner brief runs/first-authorship-plan.json \
  --run <run-id-from-experiment-inspect> \
  --runner codex
```

By default, the command creates a new isolated directory under `~/Code/agent-eval-runs` when the repository is under `~/Code`. It refuses to create a runner kit anywhere inside `seedspec-evals`. Open the generated directory—not this repository—as a new Codex project, paste its `handoff.md` into a clean task, and begin with `node runner-control.mjs preflight`. Continue only when it reports `READY`.

Repeat once for each variant. For Claude Code, replace `codex` with `claude-code`. The runner-safe envelope contains the reviewed case and available clarification IDs but no simulated answers. A control record outside the runner project exposes one answer at a time through `runner-control.mjs answer`. The brief also carries variant-specific instructions and tools, the requested model, required outputs, and the portable observable-trace contract. Select the same underlying model and snapshot. If it is unavailable, create a new run identity for the actual model rather than calling the run matched.

Both CLI environments have captured, non-interactive subject runners:

```sh
node packages/cli/dist/index.js runner codex-run <isolated-codex-run-directory> \
  --confirm-model-execution

node packages/cli/dist/index.js runner claude-run <isolated-claude-run-directory> \
  --confirm-model-execution
```

The Claude adapter requires an `anthropic/...` model in the run manifest,
disables settings, MCP servers, session persistence, web tools, and reasoning
capture, and retains sanitized JSONL events plus provider-reported token,
cache, cost, model, session, timing, and final-response evidence. Its automatic
capture trace timestamps each complete provider event when the runner observes
it, records a monotonic elapsed offset, and derives matched tool-call durations.
These are harness observations, not provider-internal timestamps. The adapter
enforces the immutable run-duration limit and records a timeout as failed
evidence rather than allowing an over-budget result to appear successful.

After a desktop run finishes, verify its executable claims, evaluate its
contract/integrity gate, and prepare a descriptive evaluation profile:

```sh
node packages/cli/dist/index.js implementation verify \
  <isolated-run-directory> \
  --confirm-code-execution

node packages/cli/dist/index.js evaluate deterministic \
  <isolated-run-directory>

node packages/cli/dist/index.js evaluate profile-brief \
  <isolated-run-directory> \
  --runner codex \
  --judge-model <independent-evaluator-model> \
  --reasoning-effort high
```

Implementation verification is a separate, explicitly authorized step. It
executes only the realization's declared local verification commands, captures
their actual outcomes, and checks that acceptance and accessibility claims link
to existing evidence. A passing command does not prove that its tests are
meaningful. The deterministic command likewise reports only run integrity,
required artifacts, and declared outcome checks. Its
pass/fail/unevaluated counts are not an implementation-quality score.

The independent, read-only technical reviewer evaluates a fixed general vector
covering correctness, meaningfulness, maintainability, flexibility, security,
reliability, performance, accessibility, test quality, evidence quality, and
implementation-profile conformance. Each applicable dimension uses an
evidence-backed ordinal anchor from 0 through 4; unknown dimensions remain
unscored, critical findings cap readiness, and dimension levels are never
averaged. The frozen evaluator skills are content-addressed in the evidence
envelope.

The profile handoff contains a compact, content-addressed evidence envelope and
the case's predeclared decision and obligation axes. This gives every variant
the same comparison denominator without exposing the full case or evaluator
implementation. The profile records decision provenance and materiality,
obligation-to-evidence coverage, semantic file ownership, process capture,
technical findings, the independent technical vector, and uncertainty. It does
not emit a normalized overall score or declare a winner. An author can profile
a package without running a full lab:

```sh
node packages/cli/dist/index.js evaluate package-profile-brief \
  <package-path> \
  --runner codex \
  --judge-model <evaluator-model>
```

For Codex, the lab can run that handoff non-interactively and retain the raw
JSONL event stream, exact requested model and reasoning effort, final evaluator
message, and provider-reported token/cache usage:

```sh
node packages/cli/dist/index.js evaluate profile-run \
  <isolated-run-directory> \
  --confirm-model-execution
```

After two or more profiles for the same case and stage are finalized, produce a
shared-axis comparison rather than comparing each evaluator's raw counts:

```sh
node packages/cli/dist/index.js evaluate profile-compare \
  <run-a>/evaluation-profile.json \
  <run-b>/evaluation-profile.json \
  --out runs/profile-comparison.json
```

The comparison preserves missing and unknown observations, intentional agent
latitude, subject-specific findings, technical dimension levels, and process
capture. It does not average the vector or select a winner.

Use the older scored rubric only when the experiment predeclares a scored
comparison:

```sh

node packages/cli/dist/index.js evaluate rubric-brief \
  <isolated-run-directory> \
  --runner codex \
  --judge-model <independent-judge-model>
```

Run the emitted evaluator brief in a separate clean task. After like-for-like
canonical rubric scorecards validate, compare them without treating the delta
as causal proof:

```sh
node packages/cli/dist/index.js compare \
  <raw-source-run>/rubric-scorecard.json \
  <markdown-run>/rubric-scorecard.json \
  <minimal-run>/rubric-scorecard.json \
  <guided-run>/rubric-scorecard.json \
  <restructured-run>/rubric-scorecard.json \
  --baseline raw-source
```

Run the matching Think matrix only after reviewing the plan:

```sh
node packages/cli/dist/index.js matrix start runs/<plan>.json \
  --endpoint <worker-url> \
  --confirm-model-execution
```

Think stores observable execution events durably with the run. Codex and Claude Code write the same trace shape from the generated brief, and their captured runners retain provider JSONL evidence outside the evaluated workspace. Traces include messages, tool activity, timing, usage when available, artifacts, errors, redactions, and capture limitations; hidden reasoning is never collected. See [the parity-runner and trace instructions](docs/runners.md) for the full workflow.

The bundled evaluator skills cover descriptive package profiling, read-only
technical review, authorship value, implementation fidelity and congruency,
and adversarial probing. They emit evidence-linked, machine-readable judgments
while keeping deterministic failures separate from semantic evaluation.

Copy `apps/worker/.dev.vars.example` only when you are ready to test authenticated remote operation. Never commit `.dev.vars`.

See [the full lab plan](docs/labs.md), [the package-scoped implementation skill experiment](docs/implementation-skills.md), [descriptive evaluation profiles](docs/evaluation-profiles.md), [execution architecture](docs/architecture.md), [parity runners and traces](docs/runners.md), [CLI contract](docs/cli.md), and [open decisions](docs/open-decisions.md).
