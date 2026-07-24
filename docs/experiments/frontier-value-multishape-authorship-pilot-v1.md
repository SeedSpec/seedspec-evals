# Frontier/value multi-shape authorship pilot v1

## Purpose

This pilot operationalizes the useful parts of Frontier-Code without treating
its public leaderboard as a substitute for SeedSpec-specific evaluation:

- qualify cases against known-bad and valid noncanonical artifacts;
- keep technical implementation judging blind to treatment and implementing
  model until its quality vector is final; and
- exercise the same frontier/value model pair across materially different task
  shapes.

Human sample calibration is deliberately out of scope for this pilot.

## Frozen design

- Plan:
  `plan_d3bd0a2243ed6e247f3598b1e5e410d3f70aa5d82abc4f984af0b4634ebf11de`
- Stage: authorship
- Treatments: `raw-source` and `seedspec-guided`
- Models: `openai/gpt-5.6-sol` and `openai/gpt-5.6-terra`
- Reasoning effort: high
- Repetitions: one exploratory repetition per cell
- Runner: captured, ephemeral Codex CLI with an isolated workspace
- Cells: 4 cases × 2 treatments × 2 models = 16
- Per-run ceiling: 30 minutes

The four shapes are:

| Shape | Case |
|---|---|
| Existing product feature | `existing-ledger-recurring-templates@1.1.0` |
| Cross-system workflow | `workflow-stale-vip-support-escalation@1.1.0` |
| Existing-solution extraction | `extract-release-readiness-coordination@1.1.0` |
| Maintenance/evolution | `evolve-customized-clinic-intake@1.0.0` |

Every desktop run has a content-addressed manifest derived from its matching
source envelope. Desktop manifests omit AI Gateway routing because the Codex
runner selects the model directly. Each run records sanitized provider events,
provider-reported usage, an independent capture trace, the subject-finalized
semantic trace, the exact outer interval, stderr, and final response.

## Case qualification status

Each case has a frozen hack report, a known-bad candidate, a valid-alternative
candidate, and planned false-positive and false-negative probes. The
content-addressed records remain `draft`: the framework will not label a case
`qualified` until every required probe has independent evidence and the
expected disposition.

| Case | Qualification record | Status |
|---|---|---|
| Existing product | `qualification_a3fb3b0bc39b6a430168463447dd6e60b295d19046af34385991ec2ddc070d21` | draft |
| Cross-system | `qualification_275f6f3c137b8d4c33a7c77287b6b696d59bd366dcba481b76b2162ca1d04227` | draft |
| Extraction | `qualification_938d744844634abc895b4e572d7d72ddc9c10082cec88d96c5da5e27a1b471a8` | draft |
| Maintenance/evolution | `qualification_13e9bf1baa2c2ba4d0de349d170d76c41cb224739b615b9d68e788e134ec316e` | draft |

This means pilot artifacts can test runner coverage and expose qualitative
differences, but they are not yet benchmark-grade comparative claims.

## Scope control

An earlier 48-cell design used three cold repetitions. It is retained as a
replication plan but was not launched. The exact-model smoke consumed roughly
469,000 total tokens, making three repetitions unjustified before the cases
clear qualification. The 16-cell pilot is the smallest complete factorial that
keeps all four shapes, both treatments, and both models.

A Cloudflare Think smoke also failed before generation because the Sol/Terra
selectors were not available through that deployment's catalog route. That is
a harness-routing failure, not a model result, and is excluded from the pilot.
The same exact Sol selector subsequently completed through the captured Codex
adapter.

## Execution results

All 16 isolated cells succeeded. Their captured artifacts are under
`/Users/davidturner/Code/agent-eval-runs/frontier-value-multishape-authorship-pilot-v1/`.

| Model / treatment | Runs | Total tokens | Mean duration | Contract failures |
|---|---:|---:|---:|---:|
| Sol / raw source | 4 | 2,769,610 | 361.5 s | 0 |
| Terra / raw source | 4 | 1,349,970 | 181.8 s | 0 |
| Sol / SeedSpec guided | 4 | 15,339,746 | 913.8 s | 0 |
| Terra / SeedSpec guided | 4 | 13,045,572 | 602.1 s | 0 |
| **Total** | **16** | **32,504,898** | — | **0** |

Provider-reported totals include 32,149,055 input tokens, of which 30,777,088
were cached input, plus 355,843 output tokens. The sum of isolated run durations
was 8,236.6 seconds; four-way concurrency reduced the observed pilot interval
to about 42 minutes.

Every deterministic gate passed run identity and artifact-contract checks. The
gates remain `incomplete`, not failed, because these authorship cases do not
provide executable outcome checks: there were zero failed checks and 20
unevaluated outcome checks across the matrix. Guided packages produce more
deterministic checks than raw Markdown, so passed-check counts must not be
treated as comparative quality scores.

The immediate operational finding is cost, not a model winner. Guided runs used
28.39 million total tokens versus 4.12 million for raw-source runs—about 6.9×
as many—despite heavy caching. Sol was also slower than Terra in both treatments.
That makes runner/tool overhead and cost first-class benchmark outputs and
supports withholding the three-repetition plan until case qualification shows
that the additional runs can answer a discriminating question.

No semantic quality winner is reported from execution success, token use,
duration, or deterministic contract checks. Treatment and model comparisons
remain exploratory until independent judging is attached, and benchmark-grade
claims remain blocked until the case qualification records clear their
false-positive and false-negative probes.
