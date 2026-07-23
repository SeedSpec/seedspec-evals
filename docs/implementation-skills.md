# Package-scoped implementation skill experiment

The completed first baseline and its interpretation are recorded in
[`docs/experiments/implementation-skill-v1.md`](experiments/implementation-skill-v1.md).
Treat that run as a lightweight-guidance calibration. It does not establish the
ceiling for deeply procedural skills.

The completed stronger treatment and its interpretation are recorded in
[`docs/experiments/implementation-gstack-v1.md`](experiments/implementation-gstack-v1.md).
It shows a larger quality gradient and a materially higher process cost under a
declared headless adaptation of gstack's workflow.

The completed Sol-versus-Terra matrix is recorded in
[`docs/experiments/implementation-model-skill-v1.md`](experiments/implementation-model-skill-v1.md).
It tests whether stronger procedural guidance can compensate for a less-capable
implementing model while holding the Sol evaluator constant.

This lab asks a narrow question:

> Does a package-scoped technical skill cause an implementing agent to produce
> a more meaningful, verifiable, and adaptable realization than either no
> additional guidance or the same guidance embedded directly in the prompt?

It does not assume that shipping implementation skills is always beneficial.
The experiment is designed to expose no effect, a prompt-text effect, a
skill-consultation effect, or a harmful effect.

## Controlled treatments

All runs use:

- one immutable authored SeedSpec package;
- one implementation case and delivery contract;
- the same model selector and reasoning effort;
- the same isolated Codex runner;
- the same local-runtime and no-network constraint;
- the same implementation verifier and independent technical evaluator.

Only guidance delivery varies:

| Treatment | Guidance text | Separate skill | Consultation claim |
| --- | --- | --- | --- |
| `no-guidance` | None | No | Prohibited |
| `embedded-guidance` | Full skill content in trusted instructions | No | Prohibited |
| `skill-guidance` | Full skill content in `SKILL.md` | Yes | Required and observable |

The initial skill is `skills/implement-stateful-workflows/SKILL.md`. It is
deliberately implementation-oriented: behavioral modeling, one authoritative
transition boundary, distinguishing tests, meaningful production paths, and
adaptable seams. It does not select a framework.

## Evidence sequence

For every completed subject run:

1. The implementation writes a structured acceptance report whose claims link
   to declared local commands and evidence files.
2. `implementation verify --confirm-code-execution` executes those commands and
   records outcomes without changing the realization.
3. `evaluate deterministic` applies the case's acceptance, accessibility, and
   concurrency checks to the executed evidence.
4. `evaluate profile-run --confirm-model-execution` invokes a separate
   read-only evaluator. Its profile skill and technical-review skill are frozen
   into the run directory and recorded by digest in `profile-evidence.json`.
5. `evaluate profile-compare` describes differences over the case's shared
   decision and obligation axes without assigning a winner.

The technical reviewer is lab-supplied and never comes from the implementation
package being evaluated. Package guidance therefore cannot be its own judge.

## What to inspect

The experiment should establish gradients rather than collapse everything into
one score:

- acceptance and invariant adherence;
- meaningful production paths versus placeholders;
- distinguishing state-transition and authorization tests;
- narrow-viewport and keyboard evidence;
- material implementation decisions and attributable authority;
- provider-reported tokens, cached input, and elapsed time when available;
- maintainability and proportionality of the code;
- adaptation success, regressions, and change surface in a later disposable
  challenge.

The authored package is held constant, so this experiment does not measure
authorship quality. It also does not infer that fewer tokens or more agent
decisions are inherently better.

## Comparing a stronger external skill

The CLI can freeze a multi-file skill directory into a content-addressed
`guidanceInput` bundle. This avoids prompt-metadata size limits and lets an
isolated runner verify every guidance file before execution.

The first stronger treatment uses gstack's upstream `plan-eng-review` skill and
its `sections/review-sections.md` dependency. Because that workflow assumes an
installed gstack environment and interactive questions, the treatment records a
controlled adapter:

- write and review `workspace/realization/TECHNICAL_PLAN.md` before coding;
- treat the already-selected technical plan as the review target;
- behave like gstack's spawned/headless path and take explicit recommended
  choices unless they conflict with fixed package intent;
- skip unavailable telemetry, update, global-brain, external-review, and
  interactive-question integrations;
- execute the substantive scope, architecture, code-quality, testing,
  performance, failure-mode, calibration, and completion steps;
- review and correct the realized implementation after coding.

This is labeled `gstack-plan-eng-review`, not represented as an unmodified
interactive gstack session. The immutable manifest records the upstream
repository, commit, license, entrypoint digest, and complete guidance-bundle
digest.

Plan only this treatment:

```sh
node packages/cli/dist/index.js experiment implementation-skill-plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model openai/gpt-5.6-sol \
  --repetitions 3 \
  --authored-input <authored-package-directory> \
  --treatment skill-guidance \
  --skill-treatment-id gstack-plan-eng-review \
  --skill-adapter gstack-plan-eng-review \
  --skill <gstack-checkout>/plan-eng-review/SKILL.md \
  --skill-source-repository https://github.com/garrytan/gstack \
  --skill-source-revision <full-commit-sha> \
  --skill-license MIT \
  --out runs/implementation-gstack-v1-plan.json
```

The resulting profiles can be compared with the existing `no-guidance`,
`embedded-guidance`, and `skill-guidance` profiles. The comparison remains
descriptive and must retain process cost, adapter limitations, and skill
identity rather than collapsing the treatments into one winner score.

## Runbook

Build the local CLI:

```sh
npm run build
```

Create three repetitions of each treatment:

```sh
node packages/cli/dist/index.js experiment implementation-skill-plan \
  --root cases \
  --case sparse-neighborhood-tool-lending \
  --model openai/gpt-5.6-sol \
  --repetitions 3 \
  --authored-input <authored-package-directory> \
  --out runs/implementation-skill-v1-plan.json
```

List immutable run IDs:

```sh
node packages/cli/dist/index.js experiment inspect \
  runs/implementation-skill-v1-plan.json
```

For each run ID:

```sh
node packages/cli/dist/index.js runner brief \
  runs/implementation-skill-v1-plan.json \
  --run <run-id> \
  --runner codex

node packages/cli/dist/index.js runner codex-run \
  <isolated-run-directory> \
  --reasoning-effort high \
  --confirm-model-execution

node packages/cli/dist/index.js implementation verify \
  <isolated-run-directory> \
  --confirm-code-execution

node packages/cli/dist/index.js evaluate deterministic \
  <isolated-run-directory>

node packages/cli/dist/index.js evaluate profile-run \
  <isolated-run-directory> \
  --reasoning-effort high \
  --confirm-model-execution
```

Do not give an implementation subject the independent evaluator guidance or
another treatment's output. Do not give the later adaptation subject the
baseline implementation skill in the first intrinsic-maintainability test.

## Adaptation phase

The declared `lender-approved-extension` challenge is intentionally withheld
from baseline implementation work except as a notice that future adaptability
matters. After the baseline profiles exist, a fresh agent receives a disposable
copy of each realization and the same challenge. It must preserve prior
acceptance behavior while adding borrower-requested, lender-approved due-date
extensions.

This phase records:

- whether old tests still pass;
- whether new behavior passes;
- files and concepts changed;
- whether existing authorization boundaries were reused;
- turns, tokens, and elapsed time when captured;
- whether unrelated behavior was rewritten.

The baseline output remains immutable. Adaptation is a separate run with its
own identity and evidence, not an evaluator editing the subject in place.
