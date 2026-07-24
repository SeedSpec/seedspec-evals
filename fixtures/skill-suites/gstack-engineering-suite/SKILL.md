---
name: gstack-engineering-suite
version: 0.1.0
description: Controlled implementation-quality adapter for gstack's planning, review, QA, and local shipping gates.
---

# gstack engineering suite

This evaluation adapter exposes a frozen, implementation-focused portion of
gstack's sprint as a coordinated package-scoped suite. Upstream member skills
are mounted under `members/`:

1. `members/plan-eng-review/SKILL.md`
2. `members/review/SKILL.md`
3. `members/qa/SKILL.md`
4. `members/ship/SKILL.md`

## Controlled sequence

1. Treat the immutable SeedSpec package and resolved end-user choices as the
   requirements source. Write
   `workspace/realization/TECHNICAL_PLAN.md`.
2. Consult `plan-eng-review` before implementation. Run its substantive
   architecture, data-flow, failure-mode, test-plan, performance, security, and
   completion gates in spawned/headless mode.
3. Implement the reviewed plan with ordinary implementation judgment while
   preserving package authority and acceptance obligations.
4. Consult `review` against the realized diff. Run its applicable critical,
   testing, maintainability, security, performance, API, and adversarial passes;
   apply supported fixes and rerun affected verification.
5. Consult `qa` only if a local browser interface and usable local browser
   driver exist. Otherwise record a capability-based skip rather than simulating
   browser evidence.
6. Consult `ship` only for its local tests, coverage audit, plan-completion,
   scope-drift, review, and fresh-verification gates. Stop before versioning,
   changelog edits, commits, push, documentation sync, PR creation, deployment,
   or telemetry.
7. Run the realization's complete declared verification and acceptance evidence
   before finishing.

## Evaluation adaptations

- Work only with local files, runtimes, and dependencies.
- The installed gstack binaries and global state are unavailable. Resolve
  hard-coded member references relative to `members/<skill>/`.
- Do not run update checks, telemetry, global-brain, remote-git, Greptile,
  external Codex, deployment, or publishing integrations.
- Treat the run as spawned/headless. Take explicit recommended decisions unless
  they conflict with package authority. Never invent a simulated human answer.
- If specialist agents are unavailable, run applicable review passes inline or
  serially and record the adaptation.

## Required suite record

Write `workspace/realization/SUITE_EXECUTION.md` with one section per member:

- status: `consulted`, `skipped`, or `unavailable`;
- execution order;
- exact upstream files read;
- produced artifact or gate result;
- material influence on implementation;
- findings applied, rejected, or left unresolved;
- controlled-run adaptations used.

The suite is implementation guidance. The SeedSpec package remains authoritative
for obligations, boundaries, constraints, and success.
