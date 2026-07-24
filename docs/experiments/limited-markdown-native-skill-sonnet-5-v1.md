# Limited Markdown with native engineering skill on Sonnet 5

This experiment asked whether the selected SeedSpec-native implementation skill
improves a capable model when the authored input is only a small Markdown brief.
It also exercised the first-class Claude Code subject runner and its immutable
wall-clock limit.

The result is mixed and operationally important: the skill produced one
material security improvement in the independently assessed artifact, but it
did not improve the rest of the technical vector and failed to complete twice.
The current skill is too expansive for this small case under Claude Sonnet 5.

## Frozen inputs

- Implementing model: `anthropic/claude-sonnet-5` through Claude Code 2.0.64.
- Case: `sparse-neighborhood-tool-lending@1.1.0`.
- Authored input: one 747-byte, 116-word `spec.md`; no `seedspec.yaml`,
  implementation profile, reference code, or packaged skill.
- Authored-input digest:
  `sha256:db1b257ae5a60c305b5434d9519a3d0a2931a749e421ae8aad33425b788dc2da`.
- Skill treatment: `engineer-seedspec-realizations`, selected revision 4.
- Skill-bundle digest:
  `sha256:2ad78c31707d04567621e2579f8cdca8c40deea4e6262844d1d6492b62b2e6f9`.
- Skill-entrypoint digest:
  `sha256:75d5001dffd94d2b8b7e87d32465ac0f10cae6cbef86f2c338223e2858b1cd8b`.
- Technical evaluator: `openai/gpt-5.6-sol` at high reasoning, using technical
  rubric `0.1.0`.

The planned treatment difference was only the presence and required
consultation of the content-addressed native skill bundle. Both treatments
could request the same three predeclared author clarifications.

## Subject runs

| Run | Treatment | Limit | Outcome | Duration | Captured usage |
| --- | --- | ---: | --- | ---: | --- |
| Primary control | No guidance | 15m | Succeeded | 12m 27.689s | 3,167,340 provider tokens; $2.19366225 |
| Primary treatment | Native skill | 15m | Timed out | 15m 0.059s | Unavailable; no complete provider result event |
| Recovery treatment | Native skill | 20m | Timed out | 20m 0.014s | Unavailable; no complete provider result event |

The primary skill subject had 30 passing self-tests and was debugging a manual
HTTP smoke check when terminated. It had not produced the required acceptance
report, run report, or finalized trace.

The fresh 20-minute recovery subject produced a realization, acceptance report,
and 27 passing self-tests, but timed out while beginning the required run
report. The controller did not modify its realization. It added an explicitly
labeled recovery note and failed trace metadata so an independent evaluator
could assess the artifact without treating the subject as complete.

Because the recovery treatment had a larger wall-clock allowance, it is not a
second controlled process comparison. It exists only to expose a complete
skill-produced code artifact for technical review. The strict equal-budget
result is one control success and one skill-treatment failure.

## Independent verification

Both reviewed realizations passed their declared test commands when the
evaluation controller re-executed them against disposable copies:

| Treatment artifact | Test result | Contract/integrity gate |
| --- | --- | --- |
| No guidance | 29/29 passing | 7 pass, 1 fail |
| Native skill recovery | 27/27 passing | 6 pass, 2 fail |

The no-guidance gate failed only the required live 360px keyboard task; its
subject correctly marked static accessibility evidence as `qualified`. The
native-skill gate failed that same task plus subject completion and trace.
These are integrity and outcome-contract observations, not technical-quality
scores.

The first verification attempt exposed a lab defect: the macOS sandbox denied
loopback networking, causing real local HTTP integration tests to fail even
though remote access was not attempted. The verifier now permits only local-IP
networking while retaining remote-network and out-of-sandbox write denial. The
unchanged subject tests then passed.

## Technical vector

Ordinal levels are 0 compromised, 1 fragile, 2 serviceable, 3 robust, and 4
exceptional. Unknown dimensions are intentionally not scored.

| Dimension | No guidance | Native skill |
| --- | ---: | ---: |
| Correctness | 2 | 2 |
| Meaningfulness | 3 | 3 |
| Maintainability | 2 | 2 |
| Flexibility | 2 | 2 |
| Security | 1 | 2 |
| Reliability | 1 | 1 |
| Performance | 2 | 2 |
| Accessibility | unknown | unknown |
| Test quality | 2 | 2 |
| Evidence quality | 2 | 2 |
| Profile conformance | not applicable | 1 |
| **Readiness** | **indeterminate** | **indeterminate** |

The skill artifact improved the security assessment by one level. Compared
with the control's plaintext demo codes printed at startup and process-local
sessions, it added route authorization, participant checks, output escaping,
body limits, active-resident rechecks, and `HttpOnly`/`SameSite` cookies.
Reusable plaintext invite credentials and absent throttling still capped it at
serviceable.

The skill also caused the subject to add JSON persistence, atomic rename,
load-time invariant checks, restart tests, and corrupt-state tests. Those are
directionally aligned with the skill's state and failure gates, but the
implementation mutated shared memory before independently awaiting
unserialized persistence. Concurrent requests could therefore write snapshots
out of order, and persistence failure could leave failed work applied in
memory. Sol kept reliability at level 1.

The remaining dimensions were ties:

- both implementations correctly enforced the package-authored membership,
  custody, disagreement, Chicago-calendar, and one-open-loan boundaries;
- both omitted evaluator-only cancellation and overdue behavior;
- both were substantive but required coordinated edits across domain, routes,
  rendering, and tests for the declared extension challenge;
- both had real HTTP and negative-path tests, but neither supplied live browser
  accessibility or a separately captured adaptation run.

## Decision and obligation observations

Both artifacts aligned on every fixed author-controlled decision. Each covered
private membership, forbidden marketplace behavior, lender-only custody, and
concurrent-loan safety with distinguishing evidence. Both were partial on the
broader evaluator lifecycle, Chicago overdue behavior, and live phone-keyboard
evidence.

The control silently chose to omit cancellation and overdue behavior, which
the evaluator classified as an ambient material decision because that broader
case axis was unresolved. The skill artifact left the same policy unobserved.
This does not establish package-author divergence: the 116-word authored brief
did not require either behavior.

## Interpretation

This run does not support shipping the current skill unchanged as universal
implementation guidance.

It supports three narrower conclusions:

1. The skill can influence a strong model in the intended direction. The
   security boundary improved, and persistence and adverse-state tests appeared
   where the control had none.
2. Gates do not guarantee correct gate execution. The model implemented a
   persistence mechanism that looked stronger but retained the exact
   acknowledged-state-loss class the skill was meant to prevent.
3. Operational weight is part of skill quality. On a tiny brief, the skill
   failed to complete at both 15 and 20 minutes while the control completed in
   12m 28s. A skill that improves one dimension but prevents delivery is not yet
   a generally better treatment.

The next revision should not add more gates. It should make the existing gates
adaptive: classify the realization's risk and scope early, select the smallest
applicable gate set, impose an explicit implementation/evidence time budget,
and reserve expensive smoke checks or repeated review for material unresolved
risk. Persistence guidance also needs a sharper invariant: mutation,
serialization, durable commit, and response acknowledgement must have one
explicit ordering, with a required failure or concurrent-reload test when
persistence is introduced.

This is one control artifact and two timed-out treatment attempts. It is
directional evidence, not an estimate of average treatment effect.
