---
name: engineer-seedspec-realizations
description: Implement or adapt software from a SeedSpec package through explicit, risk-proportionate engineering gates. Use when an agent must turn packaged intent, end-user additions, and a selected implementation profile into working code while preserving obligation coverage, authority boundaries, state and failure safety, usable operational surfaces, distinguishing verification, and honest completion evidence.
---

# Engineer SeedSpec Realizations

Treat the resolved SeedSpec inputs as product authority and this skill as an
engineering control loop. The skill may reject or qualify its own completion
claim; it must not rewrite packaged intent, silently choose unresolved product
policy, or claim to enforce agent behavior.

## Establish the working record

Read [operating-semantics.md](references/operating-semantics.md) completely.
Create one `REALIZATION_GATES.md` working record beside the realization, or in
the harness-designated evidence directory. Update it as work proceeds; do not
reconstruct it from memory at the end.

Record:

- the package, implementation profile, end-user state, and additional guidance
  actually consulted;
- each gate as `open`, `passed`, `not-applicable`, `qualified`, or `blocked`;
- material decisions and their authority;
- findings, corrective actions, and executed evidence.

A gate record proves only that the process was recorded. Never cite attendance,
a status word, a file's existence, or this skill's consultation as proof that a
behavior works.

## Classify the risk

Identify the plausible harm if the realization is wrong: incorrect behavior,
unauthorized action, lost or disclosed data, duplicated side effects, unsafe
automation, operational failure, or costly reversal. Apply deeper analysis and
stronger evidence where impact or uncertainty is material. Keep ceremony light
for reversible, low-impact work.

Escalate rather than guess when an unresolved choice changes product policy,
authority, destructive scope, compliance posture, or an irreversible
architecture decision. Continue with ordinary engineering judgment on
reversible implementation details the governing inputs intentionally leave
open.

## Pass the gates in order

### 1. Establish obligation coverage

Before selecting architecture, read
[planning-and-authority-gates.md](references/planning-and-authority-gates.md)
and pass **G1 — Obligations**. Extract the target state, material behaviors,
invariants, constraints, non-goals, forbidden states, success evidence, and
unresolved decisions. Map each material obligation to an implementation
boundary and a way to falsify it.

Do not begin implementation while a material obligation is contradictory,
ownerless, or dependent on policy the agent is not authorized to invent.

### 2. Establish trust and authority

Apply **G2 — Trust and authority** from the same reference before exposing a
state-changing path or integrating an external system. Identify actors,
resources, actions, trust boundaries, identity sources, secrets, untrusted
inputs, and irreversible effects.

Do not rely on presentation code, a caller-supplied identity, hidden controls,
or a success-path test as an authority boundary.

### 3. Make state and effects safe

When the realization stores state, coordinates actors, or causes external
effects, read
[state-and-surface-gates.md](references/state-and-surface-gates.md) and pass
**G3 — State and effects**. Model allowed transitions and collision, retry,
partial-failure, recovery, and stale-state behavior in proportion to risk.

Do not declare a material invariant protected until the implementation has one
authoritative control and a realistic attempt to break it.

### 4. Make the operational surface real

Apply **G4 — Operational surface** from the same reference to every interface
used by people, agents, operators, or external systems. Exercise the primary
path through its real boundary and account for the material empty, invalid,
denied, unavailable, stale, and repeated-action states.

Do not substitute decorative UI, placeholder handlers, hard-coded success, or
static inspection for an operable path.

### 5. Produce distinguishing verification

Before claiming a behavior works, read
[verification-and-readiness-gates.md](references/verification-and-readiness-gates.md)
and pass **G5 — Distinguishing verification**. Prefer evidence that would
actually fail if the obligation were broken. Exercise controls at their
authoritative boundary, including material denied and failure paths.

Calibrate every claim to the evidence produced. A command exit code, source
inspection, mocked path, handler test, live system exercise, and end-to-end
observation establish different things.

### 6. Challenge the realized change

Apply **G6 — Adversarial change review** after the primary implementation is
working. Review the realized behavior and changed code from the perspectives
of misuse, failure, recovery, future change, unnecessary complexity, and scope
drift. Correct supported findings and rerun affected verification.

Do not dismiss a finding because the plan did not predict it. Do not expand
scope merely because an adjacent improvement is attractive.

### 7. Establish readiness

Apply **G7 — Readiness** last. Run the complete relevant verification from a
fresh state, reconcile the result with the obligations and implementation
profile, remove misleading scaffolding, and report unresolved risks precisely.

Claim `ready` only when every applicable gate passed and no material open
finding invalidates the claim. Otherwise report `qualified` or `blocked`, state
what remains unestablished, and preserve any useful deliverable without
overclaiming it.

## Report the result

Return:

- the realization produced or changed;
- the gate result and material corrective actions;
- the authoritative inputs and guidance actually consulted;
- the verification that ran and what it establishes;
- unresolved limitations, qualifications, or blockers;
- material decisions attributed to package author, implementation profile, end
  user, environment, or agent judgment.

Keep independent evaluation separate. This skill improves the work by applying
engineering controls; it does not define how the realization should be judged.
