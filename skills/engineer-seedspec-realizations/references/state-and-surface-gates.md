# State and surface gates

## G3 — State and effects

### Control objective

Keep lifecycle invariants and external effects correct under collision,
repetition, partial failure, restart, and stale information.

### Inspect

- state model, allowed transitions, terminal states, and forbidden transitions;
- authoritative write boundary and persistence semantics;
- atomicity across related state and side effects;
- concurrent attempts that compete for the same resource or decision;
- retry, replay, duplicate delivery, cancellation, timeout, and reordering;
- crash or downstream failure between steps;
- restart, malformed stored state, migration, and recovery behavior;
- record-shape, reference, and cross-record lifecycle invariants at both the
  commit and load boundaries;
- clocks, time zones, identifiers, and ordering assumptions.

Select failure cases from the actual design. Do not add distributed-systems
machinery to a local, reversible workflow without a material reason.

### Pass condition

Each material invariant has one authoritative control, and realistic tests or
exercises attempt to violate it through the relevant collision, retry, or
failure path. Failed operations leave state and external effects in a known,
recoverable condition. Recovery behavior matches the promised operating model.
Persisted state is not trusted merely because it parses or contains expected
top-level collections: the load boundary reuses or matches the authoritative
semantic invariant checks applied before commit. At least one plausible
well-formed-but-inconsistent snapshot is exercised when persisted corruption
could violate a material invariant.
Stored events and records that attribute a protected action also preserve its
authority provenance: changing the actor, resource, or transition in an
otherwise valid snapshot must not manufacture a historically authorized act.

### Stop or qualify when

- two valid callers can both obtain an exclusive outcome;
- a retry can duplicate a material effect;
- memory state is treated as durable without an explicit local-only boundary;
- persistence failure leaves memory and stored state silently divergent;
- partial failure can report success while required work is missing;
- corrupted or stale state is accepted in a way that violates an invariant.
- stored records, references, or lifecycle combinations can bypass checks that
  ordinary writes must satisfy.
- persisted action attribution can claim an actor or authority that the
  corresponding transition would have rejected.

### Record

Record the state transitions, protected invariants, chosen atomicity and
idempotency mechanisms, failure cases exercised, and environmental limits.

## G4 — Operational surface

### Control objective

Make the realization usable through its intended interface and diagnosable
when real inputs, environments, or dependencies differ from the happy path.

### Inspect

- primary task through the real UI, API, command, automation, or integration;
- startup and configuration from a fresh environment;
- empty, invalid, denied, loading, unavailable, stale, and repeated-action
  behavior where material;
- input bounds, output encoding, and safe error disclosure;
- semantic validity of material structured values, not merely a matching shape
  or permissive parser result; consider normalization, coercion, overflow,
  impossible combinations, and configured-versus-host-default interpretation;
- narrow displays, keyboard operation, focus, labels, and recovery for
  user-facing interfaces;
- API status and error contracts for machine-facing interfaces;
- timeouts, rate limits, degraded dependencies, logs, and actionable operator
  feedback for services and workflows;
- hard-coded subject data, credentials, or environment assumptions.

### Pass condition

The primary task completes through the intended boundary, material failures are
truthful and recoverable, configuration is explicit, and an operator or caller
can distinguish success from failure. Relevant access and usability needs are
exercised in the actual interface rather than inferred from source alone.

### Stop or qualify when

- a control has no working handler or a handler returns fabricated success;
- the interface bypasses the authoritative domain path;
- local seeded values are presented as production identity or access control;
- a missing dependency, invalid input, or denied action appears successful;
- the claimed interface was not run in an environment capable of exercising
  it.

### Record

Record the exercised primary path, material degraded paths, configuration and
runtime assumptions, and any surface that could not be observed directly.
