# Verification and readiness gates

## G5 — Distinguishing verification

### Control objective

Produce evidence that separates a correct realization from plausible but
materially wrong alternatives.

### Inspect

- which obligation each test or observation is meant to distinguish;
- whether evidence exercises behavior or merely finds code and text;
- allowed, denied, boundary, repeated, collision, and failure paths that are
  material to the design;
- whether mocks remove the exact boundary being claimed;
- whether commands were executed against the delivered artifact;
- whether self-authored reports overstate the underlying observation.
- whether a verification adapter distinguishes capability absence and setup
  failure from assertion failure, unexpected exception, or wrong behavior.

Prefer tests that fail when a control is removed, an authority is swapped, a
transition is reordered, a retry is repeated, or a dependency fails. Use the
cheapest evidence that can genuinely distinguish the obligation, not the
cheapest evidence that can be made to pass.

### Pass condition

Every material obligation is connected to executed evidence capable of
exposing its plausible failure. Critical controls are exercised at their
authoritative boundary. Claims state what the observation establishes and what
remains inferred or unobserved.

### Stop or qualify when

- a test repeats an implementation constant without exercising behavior;
- source inspection is presented as runtime proof;
- a mocked dependency bypasses the trust or failure boundary under review;
- a generated report is the only evidence for its own claim;
- an assertion failure or unexpected exception is caught and relabeled as an
  environment limitation, qualification, or skipped check;
- important verification did not run or its result cannot be attributed to the
  delivered artifact.

### Record

Record executed commands and observations, their results, obligation links,
evidence strength, and explicit limits.

## G6 — Adversarial change review

### Control objective

Find defects and unnecessary complexity that survived implementation by
challenging the realized change rather than confirming the plan.

### Inspect

- diff or delivered artifact against the obligation map and chosen profile;
- ways an unauthorized, impatient, mistaken, or concurrent actor could misuse
  the system;
- failure ordering, conditional side effects, error swallowing, and misleading
  success;
- trust-boundary bypasses and unsafe data exposure;
- brittle coupling, duplicated policy, dead paths, hidden global state, and
  abstractions with no current leverage;
- one representative future policy or integration change named by the package
  or made likely by the realized design: trace where it would propagate and
  whether a material rule has more than one canonical owner;
- dependencies, migrations, performance cliffs, and operational assumptions;
- likely future policy or integration changes identified by the package.

Classify findings by material impact and confidence. Fix supported material
findings. Reject false positives with a reason. Defer adjacent improvements
that do not protect an obligation or materially improve safe change.

### Pass condition

No supported material finding remains open. Corrective changes have relevant
verification, and the realized scope still matches the governing inputs. A
representative likely change has a bounded propagation path, or the remaining
coupling is explicitly justified as simpler and safer for the declared scope.

### Stop or qualify when

- a high-impact or authority-boundary concern remains uncertain;
- a supported finding can violate a material obligation;
- review reveals the implementation followed the plan but not the governing
  intent;
- corrective work introduces unverified scope or invalidates earlier evidence.

### Record

Record material findings, confidence, disposition, corrective changes, and
verification rerun.

## G7 — Readiness

### Control objective

Make the final completion claim reproducible, current, and no stronger than the
delivered behavior and evidence.

### Inspect

- fresh setup and execution from the documented starting state;
- complete relevant verification after the last material change;
- package obligations, selected profile, and end-user additions against the
  delivered behavior;
- placeholders, dead controls, debug access, seeded credentials, and misleading
  comments or reports;
- configuration, operating limits, unresolved risks, and recovery instructions;
- produced files and scope drift.

### Pass condition

The delivered realization starts and performs its primary job in the intended
environment; fresh verification supports every material completion claim; all
other applicable gates passed; and limitations are precise enough for the next
person or agent to act on.

### Stop or qualify when

- verification predates a material change;
- setup depends on undocumented state or credentials;
- a placeholder or non-production boundary is presented as complete;
- an applicable gate is open, qualified, or blocked;
- the final report omits a known limitation or implies evidence that was never
  produced.

### Record

Record the fresh verification result, final gate states, delivered artifacts,
known limitations, and the exact completion status: `ready`, `qualified`, or
`blocked`.
