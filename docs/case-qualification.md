# Case qualification and counterfactual verification

Evaluation cases and evaluators need evidence of their own discrimination. A
high subject score is not useful when a deliberately wrong solution can pass or
a valid noncanonical solution is rejected.

## Qualification record

Each qualifying case may keep a `qualification/` directory beside `case.yaml`:

- `candidates/known-bad/` contains one or more intentionally unacceptable
  artifacts designed to expose false-positive grading;
- `candidates/valid-alternative/` contains behaviorally valid artifacts that
  differ from a canonical or expected implementation;
- `hack-report.md` explains the attack, alternative, expected disposition, and
  relevant quality dimensions;
- `qualification-draft.yaml` binds the case digest, candidate tree digests,
  probes, observed dispositions, and evidence; and
- `qualification.json` is the finalized, content-addressed record.

A record may remain `draft` while probes are unrun. It cannot become
`qualified` unless it contains both a known-bad and valid-alternative candidate,
at least one false-positive and one false-negative probe, evidence for every
probe, and no unrun or misclassified disposition.

Calculate candidate digests and finalize a record without model execution:

```sh
seedspec-eval cases artifact-digest cases/<case>/qualification/candidates/known-bad
seedspec-eval cases qualification-finalize \
  cases/<case>/qualification/qualification-draft.yaml \
  --root cases \
  --case-file <case>/case.yaml
seedspec-eval cases qualification \
  cases/<case>/qualification/qualification.json
```

## Reverse/counterfactual execution

An implementation acceptance report may add `testPaths` to a verification
command. After the final implementation passes, the evaluator can overlay only
those subject-authored test files onto an operator-supplied known-bad candidate
and execute the same command:

```json
{
  "id": "feature-tests",
  "argv": ["npm", "test"],
  "testPaths": ["test/feature.test.js"]
}
```

```sh
seedspec-eval implementation counterfactual-verify <run-directory> \
  --candidate original-host=/path/to/original-host \
  --confirm-code-execution
```

The candidate is copied into a disposable sandbox, content-addressed, and kept
outside the subject's context. A test command is distinguishing only when it
passes on the final realization and fails after its declared tests are overlaid
onto the known-bad candidate. The captured failure still needs review: missing
dependencies or an incompatible fixture can cause an irrelevant failure.

Greenfield and highly open-ended implementations may not share a transplantable
test layout. For those cases, use preserved counterfactual artifacts and blinded
technical review rather than pretending that a syntactically failing overlay is
meaningful.

## Promote a stable semantic discovery

When the same qualified behavior should become a cheap regression check, bind
it to an executable deterministic-probe draft. Promotion requires selected
semantic source probes for both:

- a known-bad candidate whose command must fail; and
- a valid-alternative candidate whose command must pass.

```sh
seedspec-eval cases probe-promote \
  cases/<case>/qualification/deterministic-probe-draft.yaml \
  --qualification cases/<case>/qualification/qualification.json

seedspec-eval cases probe-run \
  cases/<case>/qualification/deterministic-probe.json \
  --qualification cases/<case>/qualification/qualification.json \
  --confirm-code-execution
```

Promotion rechecks the qualification, case digest, source-probe outcomes,
candidate classifications, and artifact tree digests. Execution uses a bounded
runtime allowlist and disposable copies. The result is content-addressed and is
`passed` only when every positive and negative control matches. Keep a discovery
semantic when its behavior cannot be reduced to a stable observable boundary;
do not replace flexible judgment with a brittle source-pattern warning.
