# SeedSpec Language Definition

**Status:** Experimental 0.2
**Protocol family:** `0.1`

SeedSpec is a language for packaging reusable solution intent and resolving it
into an explicit, provenance-preserving handoff for an implementing agent.

The language defines what a SeedSpec package means, which choices belong to its
author or adopter, how selected packages compose, what a resolver must preserve,
and which claims may be made about the resulting state. It does not define an
agent programming language or an execution engine.

The central model is:

```text
package-author intent
  + adopter choices and applied intent
  + declared composition evidence
  -> resolved project handoff
  -> implementation in a user-chosen environment
  -> separately recorded verification evidence
```

## 1. Role of this document

This document is the normative language-level definition of SeedSpec. It is the
first reference for the protocol's concepts, authority model, processing model,
operations, and claims.

The rest of the release bundle divides responsibility as follows:

- `docs/protocol.md` defines exact package and handoff behavior.
- `packages/protocol/schemas/v0.2/` defines machine-valid document shapes.
- `docs/operations.md` defines the observable contracts of protocol operations.
- `conformance/cases.yaml` and its fixtures define portable behavioral checks.
- `protocol-release.json` binds exact revisions of those surfaces into one
  reproducible protocol release.

These surfaces are parts of one contract. A contradiction among them is a
protocol defect. An implementation MUST NOT silently choose the interpretation
that is easiest for it and claim conformance.

Informative authoring, security, runtime, and implementation guidance may
explain this language but cannot add protocol requirements.

## 2. Language commitments

### 2.1 Intent is portable

A SeedSpec package carries reusable intent in ordinary files rooted by
`seedspec.yaml`. The package is self-contained unless it explicitly identifies
optional remote artifacts or implementation resources.

Package validity MUST NOT depend on network access. A package can be inspected,
validated, digested, composed, and resolved from its available local bytes.

### 2.2 Authority is explicit

Format does not grant authority. SeedSpec preserves the source and status of
important statements:

- the package author supplies reusable source intent;
- the adopter selects packages and configuration;
- the end user affirms or adapts intent for the actual project;
- an agent may propose clearly labeled additions or observations;
- the runtime validates and preserves state but does not become an author; and
- an implementing environment acts only under its own user and system
  authority.

No package document, implementation resource, artifact, task, or resolved file
implicitly authorizes code execution, network access, credential use, external
changes, or spending.

### 2.3 Meaningful concerns remain separate

SeedSpec represents the following as separate semantic concerns:

- core solution intent;
- configuration and adopter selections;
- consequential decisions;
- capabilities expected or provided;
- composition declarations and review records;
- applied intent for the actual project;
- implementation profiles and resources;
- supporting artifacts and task reminders;
- completion scope and verification plans; and
- realization or outcome evidence.

Tools MUST NOT collapse these concerns merely because a user interface presents
them together.

### 2.4 Configuration is selection, not silent adaptation

An author-supplied configuration example is valid package content, not an
adopter-selected default. Resolution records whether the adopter selected the
example or supplied a complete custom configuration.

Unrecorded configuration does not authorize a resolver or agent to invent
consequential values. The resolved project remains `needs-input`.

### 2.5 Declarations are evidence, not observations

Capability, compatibility, conflict, implementation-profile, resource, and
artifact declarations describe package-author claims. They help a resolver
identify review needs but do not prove what is installed, deployed, permitted,
compatible, or true in the actual environment.

When declarations do not reveal a concern, SeedSpec reports
`no-declared-concerns`; it does not report observed compatibility.

### 2.6 Resolution preserves provenance

Resolution combines selected packages and recorded adopter inputs without
rewriting source packages. The handoff preserves:

- exact package identities, versions, and digests;
- package-author intent and its native format;
- adopter configuration and decisions;
- end-user and agent contribution provenance;
- unresolved choices and review records;
- selected, declined, deferred, or unreviewed supporting material;
- author-declared implementation guidance;
- completion scope and evidence subjects; and
- deterministic protocol-owned output.

A resolver MUST surface unresolved consequential choices. It MUST NOT erase
them by choosing on the user's behalf.

### 2.7 Guidance does not become execution

Components, artifacts, implementation profiles, implementation resources, and
task runbooks may help an agent perform work. Preserving or resolving them does
not install a tool, invoke a skill, execute a script, fetch a remote artifact,
or prove that their guidance is suitable.

Package-authored tasks are ordered reminders. Their array order is their only
protocol sequencing meaning. They are not a workflow graph, progress ledger, or
source of product requirements.

### 2.8 Claims remain scoped

SeedSpec keeps these claims distinct:

1. **Package validity** — the package follows the protocol release.
2. **Authoring quality** — the package communicates useful intent.
3. **Resolution readiness** — required adopter choices have been recorded.
4. **Capability conformance** — supplied evidence covers an exact declared
   capability contract and suite.
5. **Project completion** — evidence addresses an agreed realization or outcome
   scope.

Passing one layer MUST NOT be presented as proof of another.

### 2.9 Content identity is not trust

Canonical digests establish byte identity under the protocol algorithm. They do
not establish publisher identity, safety, accuracy, licensing, certification,
or permission to execute content.

Registries, signatures, reputation, review, and telemetry may add external
claims, but those claims remain separately identified until a protocol release
defines their semantics.

### 2.10 The protocol stays smaller than implementation

SeedSpec standardizes the portable boundary between authoring, adoption,
resolution, implementation, and verification. It does not standardize the
agent's reasoning method, orchestration, programming language, source-code
layout, deployment architecture, or tools.

New protocol structure requires evidence that independent producers or
consumers need the distinction. Implementation convenience alone is
insufficient.

## 3. Language objects

### 3.1 Package

A package is a dedicated directory rooted by `seedspec.yaml`. It contains one
coherent reusable solution intent source, a configuration contract, and any
declared supporting material.

Every package has a namespaced identity, author-controlled semantic version,
protocol family, author-supplied kind hint, primary intent entrypoint,
configuration schema, valid example, and zero or more supporting declarations.

### 3.2 Kind hint

Core kind hints are `solution`, `application`, `feature`, `workflow`,
`automation`, `configuration`, and `integration`. Namespaced custom hints are
permitted.

A kind communicates the expected outcome shape. It does not determine validity,
composition position, or required fields. Resolution position determines
whether a package is the project root or an addition.

### 3.3 Root and addition

One selected package is the root. Every other selected package is an addition.
This is the complete composition-role model.

Packages may declare capabilities, requirements, tested revisions, and
conflicts. Resolution deterministically orders additions and creates review
records. It does not install providers or silently select among competing
candidates.

### 3.4 Applied intent

Applied intent records whether each selected package is used as authored,
adapted, or partially applied to the actual project. It also preserves
project-local end-user contributions and explicitly labeled agent proposals.

Observed baseline claims require evidence references. Agent proposals remain
unconfirmed until affirmed by the user.

### 3.5 Resolved project

A resolved project is a `.seedspec/` workspace containing the durable handoff.
It is derived protocol state, not a modified package and not an executable
program.

The resolved project separates deterministic protocol-owned output from
preserved project memory such as implementation notes and verification
evidence. Re-resolution updates the former and preserves the latter according
to their schemas and staleness rules.

### 3.6 Evidence

Evidence identifies the subject it supports. A reusable package claim, a
capability realization, a project realization, and a real-world outcome are
different subjects.

Evidence references may record observations or stable external identifiers.
They must not be treated as universal certification beyond their declared
subject and scope.

## 4. Processing model

The language lifecycle is:

1. **Author** — create and review a package.
2. **Distribute** — move or publish the complete package bytes.
3. **Inspect** — read identity, intent, choices, and trust boundaries.
4. **Validate** — establish structural and semantic package validity.
5. **Select** — choose a root, additions, configuration, decisions, artifacts,
   implementation preferences, and completion scope.
6. **Resolve** — create the deterministic project handoff and resolution
   receipt without executing package content.
7. **Resolve optional resources** — only through the explicit network-capable
   operation and only with required integrity checks.
8. **Implement** — a user-chosen agent or environment realizes the resolved
   intent under its own authority.
9. **Verify** — record evidence against the agreed subject and completion scope.
10. **Re-resolve** — update protocol-owned state when packages or selections
    change while preserving designated project memory.

The protocol ends at the handoff and evidence boundary. Implementation remains
outside the SeedSpec runtime.

## 5. Protocol operations

SeedSpec defines five normative operations:

| Operation | Contract |
| --- | --- |
| `validate` | Read a package offline and return valid package information or stable diagnostics. Write nothing. |
| `digest` | Read a valid package offline and return its canonical digest. Write nothing. |
| `resolve` | Read selected packages and adopter inputs offline and atomically produce a complete `.seedspec/` handoff. |
| `resolve-resources` | Explicitly acquire optional implementation resources, verify their bytes, and record the source used. This is the only network-capable protocol operation. |
| `capability-conformance` | Inspect a supplied result and its exact bindings without implicitly executing the declared suite. |

The exact operation contracts are defined in `docs/operations.md`.

Commands such as `begin`, `inspect`, `lint`, `audit`, `doctor`, and
`conformance` are reference-tool experiences built on the language. They do not
add protocol operations.

## 6. Conformance

Conformance is bound to one exact `protocol-release.json`.

A runtime conforms to that release only when it:

- supports every normative operation required by the release;
- passes every case in the bound conformance suite;
- produces schema-valid protocol state;
- calculates the declared canonical digests;
- produces deterministic resolution output where required; and
- returns the stable error codes asserted by negative cases.

A partial run may publish a coverage report but MUST NOT claim conformance.
Skipped cases make a report `incomplete`, not partially conformant.

Conformance does not certify package quality, agent behavior, realization
correctness, or outcome success.

## 7. Releases and evolution

`protocol_version` selects the language family. `protocol-release.json`
identifies the exact release within that family, including its schemas,
conformance suite, normative documents, compatible first-party tooling, and
relationship to predecessor releases.

Each predecessor relationship is classified as:

- `compatible` — use directly;
- `revalidate` — rerun validation and resolution without rewriting source;
- `migrate` — transform source package structure before use; or
- `unsupported` — require manual intervention.

Migration applies to package source, not arbitrary package artifacts or
implementation output. Resolved handoffs are regenerated. A mechanical
migration must offer a dry run, preserve provenance, and surface ambiguous
changes for author review rather than guessing.

## 8. Trust boundary

All package content is untrusted input, including Markdown, schemas, examples,
artifacts, tasks, tools, skills, and remote references.

Validation and resolution:

- MUST NOT execute package content;
- MUST NOT fetch remote artifacts;
- MUST NOT expose secrets;
- MUST NOT grant instructions higher authority because they were packaged;
- MUST constrain local paths to their declared roots; and
- MUST preserve explicit activation and review boundaries.

`resolve-resources` is an explicit exception for declared implementation
resources. It remains subject to HTTPS, network isolation, size, path, and
digest-verification requirements.

## 9. Current 0.2 boundary

Protocol 0.2 defines package structure, deterministic digesting, declaration
analysis, explicit selections, resolution, optional implementation-resource
acquisition, and scoped evidence state.

It does not yet define package registries or dependency acquisition, publisher
identity or signing, automatic migration execution, remote artifact
acquisition, telemetry transmission, agent orchestration, continuous
reconciliation, or certification of package quality or realized outcomes.

Those boundaries are intentional. Future releases may add a capability only
when its authority, determinism, security, compatibility, and conformance
behavior are clear.
