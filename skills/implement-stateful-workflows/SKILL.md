---
name: implement-stateful-workflows
description: Implement maintainable stateful applications and workflows from a resolved specification. Use when a realization has explicit lifecycle transitions, authorization or custody boundaries, concurrency invariants, persistent state, failure recovery, or adaptation requirements and the implementing agent must produce working code and meaningful verification without prescribing a framework.
---

# Implement Stateful Workflows

Use this skill after the solution's intent and implementation choices have been resolved. Treat the specification as the source of behavioral obligations, not as a substitute for engineering judgment.

## Establish the behavioral model

Before choosing files or frameworks:

1. Extract the actors, resources, lifecycle states, allowed transitions, and forbidden transitions.
2. Identify invariants that must hold across every path, especially authorization, custody, uniqueness, ordering, and concurrency.
3. Map each material obligation to an observable behavior and a verification method.
4. Record any material decision that the specification leaves to the implementation.

Do not silently invent product policy. Preserve unresolved policy as an explicit limitation or blocker unless a safe, reversible default is clearly permitted.

## Build one authoritative transition boundary

Represent each material state change through one authoritative application boundary. That boundary should:

- validate the actor and current state;
- enforce authorization and invariants;
- apply the transition atomically where the platform permits;
- persist the resulting state;
- return a result that callers can handle explicitly.

Keep presentation code and transport adapters from duplicating transition rules. Prefer small, replaceable boundaries around storage, authentication, messaging, and external systems so the realization can be adapted without rewriting its behavioral core.

## Implement meaningful production paths

Deliver working paths that exercise the real behavior. Avoid placeholder handlers, hard-coded success states, decorative controls, or tests that only repeat constants from the implementation.

For each material workflow:

- make the primary path usable from the intended interface;
- make forbidden and failure states visible and understandable;
- preserve state across the lifecycle expected by the specification;
- handle empty, loading, error, repeated-action, and stale-state cases where they are material;
- keep narrow-screen and keyboard use functional when the interface is user-facing.

## Create distinguishing verification

Verification should fail when a material obligation is broken.

Include:

- focused tests for allowed and forbidden transitions;
- authorization tests at the authoritative boundary;
- invariant and concurrency tests where collisions are possible;
- interface-level tests for the core user tasks;
- a concise acceptance report linking scenarios to executed evidence.

Test names and evidence should identify the obligation being distinguished. Do not count a rendered page, successful command, or code-presence check as proof of behavior unless it actually exercises that behavior.

## Preserve adaptability

Expect a future agent to change one policy or add one transition without rebuilding unrelated behavior.

- centralize policy decisions that are likely to vary;
- keep domain behavior independent of framework-specific presentation;
- avoid premature abstraction that hides simple rules;
- choose explicit names and data shapes over clever indirection;
- document only the non-obvious decisions a future implementer must preserve.

When an adaptation challenge is supplied, do not implement it during the baseline build. Use it to avoid choices that would make the future change disproportionately difficult.

## Before concluding

1. Run the relevant checks and tests.
2. Map acceptance scenarios to the evidence that was actually produced.
3. Remove dead paths, scaffolding artifacts, and misleading placeholders.
4. Record material implementation decisions and their source: specification, implementation profile, end user, environment, or agent judgment.
5. Report unresolved limitations without claiming success for unverified behavior.
