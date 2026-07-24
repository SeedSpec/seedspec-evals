# Planning and authority gates

## G1 — Obligations

### Control objective

Make the implementation answer to the governing intent without turning
intentionally open implementation space into accidental product policy.

### Inspect

- target state, actors, resources, material behaviors, and success conditions;
- invariants, constraints, non-goals, and forbidden states;
- evidence the author or end user considers distinguishing;
- selected implementation-profile assumptions and prerequisites;
- contradictions, missing policy, and illustrative content that must not become
  a subject-specific fact;
- existing-system behavior and conventions when adapting an application.

Build an obligation map:

| Obligation | Authority | Implementation boundary | Falsification method | Status |
| --- | --- | --- | --- | --- |

Keep it material. Do not turn every sentence into a separate requirement.

### Pass condition

Every material obligation has an authoritative source, an intended
implementation boundary, and a credible way to expose a violation. Any
unresolved item is either a reversible implementation detail the agent may
choose or an explicit blocker or qualification.

### Stop or qualify when

- governing inputs materially contradict one another;
- success cannot be recognized;
- a missing decision changes user rights, product policy, destructive scope,
  or compliance posture;
- the proposed plan implements a convenient subset while implying full
  coverage.

### Record

Record the obligation map, the resolution or owner of each material unknown,
and decisions the agent is permitted to make.

## G2 — Trust and authority

### Control objective

Ensure sensitive actions and data cross explicit, enforceable trust boundaries
with the correct actor, scope, and authority.

### Inspect

- actor/action/resource combinations and who may perform each material action;
- source and lifecycle of identity, membership, roles, and credentials;
- where authorization is enforced and whether all entry paths converge there;
- secrets, personal or regulated data, logs, exports, and retention;
- untrusted inputs from people, agents, packages, webhooks, files, models, and
  external systems;
- destructive, irreversible, billable, or externally visible effects;
- least-privilege behavior for integrations and automation.

Trace at least one allowed and one denied path from entry point to authoritative
effect. For higher-risk work, trace confused-deputy, replay, enumeration,
tampering, and privilege-change paths that plausibly apply.

### Pass condition

Every material action is authorized at a trusted boundary using trustworthy
identity and server- or platform-owned state. Input is validated before it can
cross that boundary, secrets are not exposed to an untrusted surface, and
irreversible effects have an authority-appropriate confirmation or safeguard.

### Stop or qualify when

- the client or caller can assert identity, ownership, role, or successful
  completion without authoritative verification;
- hiding a control is the only authorization mechanism;
- privileged paths bypass the central policy boundary;
- sensitive data or credentials are hard-coded, broadly exposed, or retained
  without a governing basis;
- the implementation needs authority the package or end user did not grant.

### Record

Record the trust boundaries, authoritative policy location, material denial
paths exercised, and any accepted residual risk with its authority.
