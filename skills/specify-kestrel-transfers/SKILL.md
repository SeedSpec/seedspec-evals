---
name: specify-kestrel-transfers
description: Shape requirements, acceptance criteria, or implementation guidance for inventory transfers through the fictional Kestrel Transfer API 3.2. Use when a workflow moves serialized or bulk stock between Kestrel-managed sites, consumes Kestrel transfer events, or must preserve Kestrel command, ordering, custody, cancellation, and reconciliation invariants.
---

# Specify Kestrel transfers

Preserve Kestrel's platform contract while keeping product-policy decisions
with the appropriate author or end user. Treat these rules as constraints of the
named existing system, not as proof that a proposed realization satisfies them.

## Separate authority

- Attribute the rules in this skill to Kestrel Transfer API 3.2.
- Ask the author about roles, approval policy, supported inventory classes, and
  exception ownership when those choices are not supplied.
- Keep architecture, framework, hosting, interface structure, and projection
  storage open unless the surrounding request constrains them.
- Surface a conflict when author intent cannot be realized without violating a
  Kestrel invariant. Do not silently weaken either source.

## Preserve the transfer lifecycle

Use these canonical states and transitions:

1. `requested`: a destination requests one or more inventory lines.
2. `reserved`: the source accepts and Kestrel atomically reserves every accepted
   line against currently available source inventory.
3. `in_transit`: the source dispatches the reserved transfer. Source reservation
   becomes outbound custody; destination inventory has not increased.
4. `partially_received`: the destination has received at least one, but not all,
   dispatched line quantities or serials.
5. `received`: every dispatched unit is accounted for at the destination.
6. `exception`: dispatched inventory is missing, damaged, rejected, or otherwise
   cannot be received normally.
7. `cancelled`: a request or reservation was cancelled before dispatch.

Never model a direct source decrement plus destination increment as the transfer
workflow. Kestrel is authoritative for reservation, custody, and receipt state;
a local system may retain a projection but must not overwrite Kestrel inventory.

Cancellation is valid only from `requested` or `reserved` and releases any
reservation. After dispatch, record an exception and use a separately
authorized Kestrel compensating action. Never cancel, delete, or backdate an
in-transit movement to repair history.

## Preserve inventory invariants

- A reservation and every receipt must be atomic per accepted command.
- Available inventory must never become negative.
- One serialized unit may belong to only one open reservation or transfer.
- Serialized lines identify every serial explicitly; quantity alone is
  insufficient.
- Bulk lines use a positive whole-unit quantity and a lot identifier.
- Partial receipt records the exact received serials or quantities. It does not
  imply that missing units were received.
- A transfer reaches `received` only when every dispatched unit is received.
  Otherwise it remains `partially_received` or enters `exception`.

## Make commands idempotent

Every create, accept, dispatch, receive, cancel, and exception command carries a
caller-generated idempotency key.

- Repeating a key with the same canonical payload returns the original result
  without applying another transition.
- Reusing a key with a different canonical payload returns an idempotency
  conflict and changes no state.
- Timeouts and ambiguous network failures are retried with the original key.
  Never generate a new key merely because the response was lost.

Acceptance criteria must distinguish a safe retry from a conflicting key reuse.

## Consume events safely

Kestrel webhooks are delivered at least once, may arrive out of order, and are
not authoritative commands.

- Deduplicate by immutable `event_id`.
- Order state changes by the monotonically increasing `transfer_sequence` for
  one transfer, not by delivery time or event timestamp.
- Apply only the next expected sequence. Park a future event until every prior
  sequence is present; do not skip the gap or roll state backward.
- A replayed event produces no additional state change or side effect.
- A conflicting event for an already-applied sequence is quarantined for human
  review; it must not replace the recorded event.
- Acknowledge delivery independently from completing downstream projections so
  retries cannot create duplicate notifications or receipts.

Record Kestrel event timestamps in UTC. Use each site's configured IANA time
zone only for display and operational-day reporting. Timestamps never override
`transfer_sequence` ordering.

## Plan reconciliation and failure evidence

Require a reconciliation path that compares the local projection with Kestrel's
authoritative transfer state. A discrepancy becomes visible and reviewable; it
does not authorize an automatic inventory mutation.

Include distinguishing evidence for at least:

- competing reservations where only one can consume the last available unit;
- same-key retry and different-payload key conflict;
- duplicate delivery with one resulting projection and side effect;
- a future sequence parked until the missing event arrives;
- a conflicting applied sequence quarantined without rollback;
- partial receipt that preserves missing inventory;
- cancellation before dispatch and rejection of cancellation after dispatch;
- serialized-unit uniqueness and bulk-lot quantity validation;
- UTC event storage with site-local operational-day display; and
- reconciliation drift surfaced without an unapproved write to Kestrel.

Describe these as future verification plans until a realization actually
produces the observations. Package validation and a complete checklist are not
evidence that the integration behaves correctly.
