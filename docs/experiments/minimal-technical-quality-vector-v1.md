# Minimal Markdown technical-quality vector

This experiment rescored four preserved minimal-Markdown implementations after
the lab separated its contract/integrity gate from independent technical
quality. The implementations were not rerun or changed.

The same `openai/gpt-5.6-sol` evaluator at high reasoning produced all four
profiles using technical rubric `0.1.0`.

## Subjects

| Implementing model | Treatment | Profile |
| --- | --- | --- |
| Sol | No guidance | `profile_df4a847c6cd7bc2307ef29861911faa9ff0371fbb3ea4b91e1604ec827738cf0` |
| Sol | gstack engineering suite | `profile_d65750c997d9f68aebda09965a88c90501ec9e7bdbf710b62394c38f033f8d18` |
| Terra | No guidance | `profile_8bcbceaf8fa4c5ec27dd095d96b2fd88365008e117c1064cca4c1b06e6cf71f3` |
| Terra | gstack engineering suite | `profile_3a1a0289730956ffe6615134b3b666f8ae7b9512aaa34e7fc1bdd03c497837df` |

## Technical vector

Levels are ordinal anchors: 0 compromised, 1 fragile, 2 serviceable, 3
robust, and 4 exceptional. They are not values to average.

| Dimension | Sol: none | Sol: gstack | Terra: none | Terra: gstack |
| --- | ---: | ---: | ---: | ---: |
| Correctness | 0 | 3 | 0 | 0 |
| Meaningfulness | 3 | 3 | 2 | 3 |
| Maintainability | 2 | 2 | 2 | 2 |
| Flexibility | 2 | 2 | 2 | 2 |
| Security | 0 | 3 | 0 | 0 |
| Reliability | 1 | 3 | 1 | 1 |
| Performance | 2 | 2 | 2 | 2 |
| Accessibility | unknown | unknown | 1 | unknown |
| Test quality | 2 | 3 | 1 | 1 |
| Evidence quality | 2 | 2 | 1 | 1 |
| Profile conformance | not applicable | 3 | not applicable | 2 |
| **Readiness** | **blocked** | **indeterminate** | **blocked** | **blocked** |
| **Open critical findings** | **2** | **0** | **2** | **3** |

Sol with gstack was `indeterminate`, rather than `robust`, because rendered
phone and keyboard behavior remained unknown. Its assessed technical dimensions
contained no critical or material open finding.

## Obligation evidence

| Subject | Covered | Partial | Uncovered | Evidence not confirmed distinguishing |
| --- | ---: | ---: | ---: | ---: |
| Sol: none | 3 | 5 | 0 | 3 |
| Sol: gstack | 5 | 3 | 0 | 1 |
| Terra: none | 1 | 6 | 1 | 1 |
| Terra: gstack | 3 | 5 | 0 | 2 |

The obligation profile and technical vector provide different information.
Terra with gstack covered more obligations than Terra without guidance, but its
implementation still violated critical authority and shared-state boundaries.

## Material findings

### Sol without guidance

The implementation was substantive, but a shared building invitation plus a
caller-selected resident name allowed one resident to obtain another
resident's session. Because custody authority depended on that identity, the
evaluator recorded critical correctness and security findings.

The implementation also mutated memory before persistence completed. A failed
save could therefore report failure while leaving state changed in memory. This
produced reliability level 1.

### Sol with gstack

The implementation used per-resident high-entropy access material, current
membership checks, revocable and expiring bounded sessions, strict input
handling, and server-side endpoint authorization.

Serialized mutation, atomic snapshots, rollback on persistence failure,
malformed-state rejection, restart evidence, and adverse-path tests supported
level 3 correctness, security, reliability, and test quality.

### Terra without guidance

The browser-local architecture shipped valid invitation credentials to the
client, trusted client-controlled identity, and stored each resident's
community state independently. Separate browsers could not share listings or
enforce one building-wide reservation.

The domain tests remained compatible with these critical production failures.

### Terra with gstack

The suite improved meaningfulness and obligation coverage, but did not correct
the client-controlled trust or shared-state boundaries. It also encoded a
critical product error: borrowers were permitted to confirm pickup and either
participant could confirm return, despite lender-only custody authority.

This supports a narrow conclusion: engineering gates amplify the implementing
model's judgment, but do not replace the capability needed to interpret and
protect product authority.

## Evaluator process

| Subject | Total tokens | Cached input | Output | Duration |
| --- | ---: | ---: | ---: | ---: |
| Sol: none | 1,439,144 | 1,283,328 | 25,071 | 8m 56s |
| Sol: gstack | 2,443,493 | 2,283,008 | 23,753 | 8m 32s |
| Terra: none | 933,509 | 827,392 | 24,203 | 8m 17s |
| Terra: gstack | 1,780,358 | 1,636,608 | 30,230 | 10m 18s |

These are evaluator costs, not subject implementation costs. Large cached-input
counts reflect repeated local inspection steps in the captured Codex harness.

## Interpretation

The new technical vector exposes a useful gradient that the legacy weighted
contract result hid:

- Sol with gstack materially outperformed Sol without guidance on correctness,
  security, reliability, and test quality.
- gstack did not rescue Terra's critical architecture or authority errors.
- More obligation coverage did not imply a technically acceptable realization.
- No result saturated at the top; level 4 remained reserved for stronger
  evidence than any subject provided.

This is one preserved run per cell, not an estimate of average treatment effect.
The evaluator also saw treatment identity and process artifacts, so judgment
bias remains possible even though its rubric did not award gate attendance.

## Next validity checks

1. Build a treatment-blinded technical evidence view and repeat the four
   evaluations with opaque labels.
2. Run at least one additional judge pass to measure dimension-level variance.
3. Apply controlled mutations—such as removing authorization, rollback, true
   concurrency, or behavioral assertions—and confirm that only the relevant
   dimensions decline.
4. After evaluator calibration, compare no guidance with the SeedSpec-native
   `engineer-seedspec-realizations` skill on fresh subjects.
