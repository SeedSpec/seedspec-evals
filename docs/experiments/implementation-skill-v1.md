# Package-scoped implementation skill: baseline experiment

Status: completed baseline  
Date: 2026-07-22  
Plan ID:
`plan_fad8f91293fc73e45cc6044e272b2393c9556a45ac7bc5d2c796f49efc3408a1`

Interpretation note: this is a lightweight-guidance calibration, not a general
test of how much value a deeply procedural implementation or engineering-review
skill can create. The tested skill is a concise set of stateful-workflow
principles that a capable model may already know. A follow-up treatment uses
gstack's substantially more operational `plan-eng-review` workflow to test
whether skill quality creates a stronger gradient.

## Question

Does this package-scoped technical skill cause an implementing agent to produce a
more meaningful, verifiable, and adaptable realization than either no
additional guidance or the same guidance embedded directly in its trusted
instructions?

This experiment tests guidance delivery during implementation. It does not test
whether a skill improves authoring, whether the authored package itself is
good, or whether one implementation stack is preferable.

## Design

The experiment held the authored SeedSpec package, case, model selector,
reasoning effort, implementation contract, isolation policy, verifier, and
independent evaluator constant. It varied only how one implementation-oriented
guidance document was delivered:

| Treatment | Delivery |
| --- | --- |
| `no-guidance` | No additional implementation guidance |
| `embedded-guidance` | The full guidance text embedded in trusted instructions |
| `skill-guidance` | The same text supplied as a package-scoped `SKILL.md` and explicitly consulted |

Each treatment was repeated three times. All nine subjects used
`openai/gpt-5.6-sol` at high reasoning effort and received the same authored
`sparse-neighborhood-tool-lending@1.1.0` input.

Every realization was checked in the same sequence:

1. execute its declared local verification commands in a disposable,
   network-denied copy;
2. apply deterministic acceptance, accessibility, and hidden concurrency
   checks;
3. run a separate, frozen, content-addressed technical evaluator;
4. compare decision provenance, obligation coverage, process capture, and
   technical findings without calculating a winner.

The baseline evaluator was prohibited from modifying the realization or
running the later adaptation challenge.

## Results

All nine subjects produced substantive runnable applications. All nine passed
their declared verification commands and scored 9 of 10 on the common
deterministic checks. The shared failure was phone-and-keyboard evidence:
implementations supplied source inspection and local task evidence, but none
supplied a live rendered narrow-viewport and keyboard traversal.

### Process capture

These values are means over three repetitions. Token values are
provider-reported and include cached input reads when reported.

| Treatment | Turns | Total tokens | Output tokens | Duration |
| --- | ---: | ---: | ---: | ---: |
| `no-guidance` | 1.0 | 1,701,299 | 40,450 | 13.85 min |
| `embedded-guidance` | 1.0 | 1,963,469 | 43,512 | 14.68 min |
| `skill-guidance` | 1.0 | 3,052,993 | 53,674 | 18.87 min |

Compared with `no-guidance`, the skill treatment used about 79% more total
tokens, produced about 33% more output tokens, and took about 36% longer.
Compared with embedded guidance, it used about 55% more total tokens and took
about 29% longer. Cached-input capture was unavailable in some runs, so no
cross-treatment cache-efficiency conclusion is justified. The one-shot runner
also produced no turn-count gradient.

### Decision and obligation observations

| Treatment | Shared decisions | Shared obligations |
| --- | --- | --- |
| `no-guidance` | 17 aligned, 1 deviation | 18 covered, 6 partial |
| `embedded-guidance` | 18 aligned; 1 additional ambient decision | 19 covered, 5 partial |
| `skill-guidance` | 18 aligned | 18 covered, 6 partial |

The skill treatment was the only arm to establish the private-membership
obligation in all three repetitions. That did not translate into uniformly
better obligation coverage: its first repetition contained a returned-custody
projection bug, leaving both lifecycle and custody evidence partial. The
embedded treatment had the largest covered-obligation count, but two
repetitions provided only partial evidence that a session represented an
invited resident, and one repetition adopted an illustrative time-zone value
as an ambient subject-specific decision.

The no-guidance treatment also produced capable results. Its third repetition
allowed callers to select any seeded resident identity, including the operator,
which deviated from the fixed private-membership boundary.

### Technical observations

- Meaningful production paths passed structured review in 9 of 9 runs.
- Distinguishing state-transition tests passed in 8 of 9 runs. The remaining
  skill-guidance run was marked `concern` because its return test did not assert
  the projected custody value and therefore missed a user-visible correctness
  bug.
- Live narrow-viewport and keyboard usability was established in 0 of 9 runs.
  Static source checks were consistently mistaken for stronger evidence than
  they supplied.
- Invalid calendar-date handling recurred across multiple treatments.
- Local identity assurance, restart durability, and multi-process concurrency
  were common boundaries. Their importance depends on whether the realization
  is interpreted as a local demonstrator or a deployable production system.
- The skill treatment tended to produce stronger explicit service, storage,
  authorization, and adapter boundaries. It also tended to produce more code,
  more review surface, and more computation. One repetition still contained
  the experiment's clearest lifecycle correctness defect.

## Interpretation

This baseline does not support a claim about package-scoped implementation
skills in general. It supports a narrower claim: packaging this lightweight set
of generic engineering principles as a skill did not improve results enough to
justify its measured consultation cost.

The strongest supported interpretation is:

1. A capable model can derive substantial implementation structure from a
   well-shaped SeedSpec without an additional technical skill.
2. Repeating the same guidance as a skill can increase implementation depth
   and explicit technical boundaries, but consultation is not free and does
   not guarantee correct application.
3. Embedded guidance captured much of the observed benefit at lower process
   cost in this case.
4. The most valuable immediate opportunity remains pre-implementation
   authoring and evidence guidance. Every treatment inherited the same
   unresolved weakness around what would distinguish actual phone and keyboard
   usability.
5. SeedSpec should describe package skills as guidance to consult, not as
   behavior the protocol can guarantee or evidence the implementation can
   satisfy merely by naming the skill.

The experiment intentionally does not assign a composite score. Whether more
author control, more agent latitude, lower process cost, stronger local
boundaries, or smaller change surface matters most is package- and
author-dependent.

## Lab corrections discovered during the experiment

The experiment exposed evaluation defects that were corrected before the final
comparison:

- implementation commands are now executed in a disposable copy with network
  access and writes outside that copy denied on macOS;
- deterministic evaluation requires prior executable verification;
- package-native scenario identifiers are accepted;
- hidden concurrency evidence is matched against both scenario identity and
  assessment, avoiding a false miss when a package-specific ID omits the word
  `concurrency`;
- technical-evaluator guidance is frozen into each run and content-addressed;
- provider-captured turns are derived from subject events rather than inferred
  from a subject-authored trace;
- adaptation is always `not-run` unless a separate content-addressed
  adaptation run is supplied.

The earlier evaluator outputs that independently modified implementations were
archived and excluded. The final nine profiles use the corrected policy.

## Next experiment

The next phase should measure adaptability separately. A fresh agent should
receive a disposable copy of each immutable baseline realization and the same
withheld `lender-approved-extension` challenge, without receiving the baseline
implementation skill. The phase should record:

- preservation of all prior acceptance behavior;
- correctness and distinguishing evidence for the extension;
- files, modules, and concepts changed;
- whether existing authority boundaries were reused;
- unrelated rewrites and regressions;
- turns, tokens, cached input, and elapsed time when available.

After adaptation, the experiment should be repeated on a second problem shape
and model before SeedSpec recommends package-scoped implementation skills as a
general practice.
