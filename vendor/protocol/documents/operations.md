# SeedSpec protocol operations

> **Normative operation contract.** This document defines the observable
> behavior of the SeedSpec operations named by `docs/01-language.md`.

Protocol operations are intentionally few. A conforming runtime may expose
additional commands and user experiences, but those surfaces do not gain
protocol meaning unless an exact protocol release adds them here.

## Shared rules

Every operation:

- is bound to one exact `protocol-release.json`;
- treats package and handoff content as untrusted input;
- returns stable diagnostic codes for errors covered by conformance cases;
- does not execute package artifacts, tasks, instructions, skills, or tools;
- does not claim authoring quality, implementation success, or outcome success;
  and
- preserves namespaced extension data where the package and handoff
  specifications require it.

## `validate`

**Purpose:** Determine whether one package follows the exact protocol release.

**Reads:** The complete package directory, its manifest, package-local files
required by validation, locally available context-module entrypoints and bridge
Skill frontmatter, and every recursively bundled child package.

**Writes:** Nothing.

**Network:** Forbidden.

**Success:** Returns the package identity, version, kind hint, protocol family,
canonical digest, parsed manifest, validated configuration example, and other
validated package data needed by later operations.

**Failure:** Returns a stable diagnostic without modifying the package or any
project state.

**Repeat behavior:** Identical package bytes under the same exact protocol
release produce the same validity result and canonical digest.

Validation establishes protocol validity and content identity only.

## `digest`

**Purpose:** Calculate the canonical identity of a valid package.

**Reads:** The complete package directory.

**Writes:** Nothing.

**Network:** Forbidden.

**Success:** Returns one lowercase `sha256:` digest calculated by the package
digest algorithm in `docs/protocol.md`.

**Failure:** Returns the applicable validation, path-safety, or content-safety
diagnostic.

**Repeat behavior:** Identical portable package bytes produce the same digest
regardless of timestamps, permissions, or empty directories.

The reference runtime validates a package before presenting its package digest.
A lower-level directory-digest utility is not the protocol `digest` operation.

## `resolve`

**Purpose:** Convert selected packages and recorded adopter inputs into one
durable project handoff.

**Reads:** A valid root package, zero or more valid explicit additions, every
recursively bundled child, and any supplied configuration selections, applied
intent, completion scope, technical preferences, artifact selections, decision
answers, or implementation-profile preferences.

**Writes:** One `.seedspec/` workspace and, when missing, the project-root
`AGENTS.md` handoff notice defined by the reference tooling.

**Network:** Forbidden.

**Success:** Produces schema-valid resolved state, deterministic protocol-owned
files, preserved parent-to-child composition edges and integration Markdown,
preserved project-memory files, and `resolution-receipt.json`. The project
status is `ready` or `needs-input`.

Success also produces `context-index.yaml`, materializes locally available
module bytes under `context/`, and binds the index and directories into the
resolution receipt. Declared remote module sources remain unavailable until
their source operation makes verified bytes available.

**Failure:** Leaves the previously complete `.seedspec/` workspace unchanged.
When no previous workspace exists, failure leaves no `.seedspec/` workspace.
A failed resolve never publishes a partially updated handoff.

**Repeat behavior:**

- the same exact release, package bytes, and resolution inputs produce
  byte-identical protocol-owned output;
- re-resolution replaces protocol-owned derived output as one commit;
- implementation notes and verification evidence are preserved;
- verification state becomes stale when its bound completion scope changes;
  and
- material copied from removed additions or declarations is removed from the
  new handoff.

Resolution analyzes declarations and records review. It does not install a
provider, execute an artifact, consult a Skill, prepare request-specific
context, or observe the actual realization.

## `discover-integrations`

**Purpose:** Report format integrations compatible with declared context
modules.

**Reads:** One valid package and explicitly supplied local integration
descriptors and assets.

**Writes:** Nothing.

**Network:** Forbidden.

**Success:** Reports compatible and incompatible integrations, exact descriptor
digests, advertised adapters, and default bridges.

**Failure:** Returns a stable descriptor, path, digest, duplicate, or
compatibility diagnostic.

**Repeat behavior:** Identical package, descriptor, and asset bytes produce the
same discovery result.

Discovery validates metadata and asset identity. It MUST NOT import adapter
code, install a Skill, or modify the package.

## `validate-context-module`

**Purpose:** Apply explicit format-specific validation to one context module.

**Reads:** One valid package, one declared module with local bytes, and one
explicitly registered compatible adapter.

**Writes:** Nothing.

**Network:** Forbidden.

**Success:** Reports the package, qualified module identity, source digest,
adapter identity, validity, issues, and optional summary.

**Failure:** Returns a stable module, availability, adapter, ambiguity, or
adapter-result diagnostic.

**Repeat behavior:** Determinism beyond the exact input bytes and adapter
version is an adapter claim, not a core protocol claim.

Native validity does not replace SeedSpec package validity.

## `prepare-context`

**Purpose:** Prepare request-specific context from one resolved project.

**Reads:** `context-index.yaml`, the bound resolution receipt, materialized
module bytes, one valid context request, and any adapters explicitly registered
by the host.

**Writes:** One context-bundle directory containing prepared module files,
selected source files, bridge assets, `context-bundle.yaml`, and
`preparation-receipt.json`.

**Network:** Forbidden.

**Success:** Verifies the resolution receipt, protocol-owned handoff bytes, and
source digests; applies deterministic applicability; selects native adapter,
bridge Skill, or plain-Markdown mechanisms; validates the bundle and receipt;
and commits the separate output atomically.

**Failure:** Leaves the previous complete output unchanged. It never publishes
a partial bundle.

**Repeat behavior:** The same exact release, resolved bytes, request, adapter
versions, and adapter results produce the same bundle identity. A use receipt
is not part of preparation identity.

Preparation does not execute scripts, install Skills, use credentials, access
the network, or authorize external effects.

## `record-context-use`

**Purpose:** Record what one consumer reports doing with a prepared bundle.

**Reads:** One valid bundle, its preparation receipt, and one use report that
covers every prepared module.

**Writes:** One `context-use-receipt.json` at the caller-selected location.

**Network:** Forbidden.

**Success:** Rechecks bundle and receipt identities plus all prepared output,
source, and bridge bytes. It then binds the consumer claim to the exact
preparation receipt and bundle. Each module is `consulted`,
`partially-consulted`, or `skipped`.

**Failure:** Does not change the prepared bundle or publish a partial receipt.

**Repeat behavior:** The receipt ID binds the reported subject. `observed_at`
records when the claim was written.

This operation records telemetry. It does not prove compliance, correctness,
or outcome success.

## `resolve-resources`

**Purpose:** Make explicitly declared implementation-resource bytes available
to an existing resolved project.

**Reads:** The resolved implementation-resource index and state, bundled
fallbacks, and canonical resource manifests when acquisition is necessary.

**Writes:** Verified resource directories and
`implementation-resource-state.yaml` inside the resolved workspace.

**Network:** Permitted only for canonical implementation-resource HTTPS URLs
declared by selected packages. This is the only network-capable protocol
operation.

**Success:** Records the exact resource version, digest, source, path, kind, and
entrypoint made available. Downloaded file and aggregate digests match the
declared manifest and any package pin.

**Failure:** Does not expose unverified downloaded bytes as a resolved resource.
It preserves an existing verified resource unless the requested update
completes successfully.

**Repeat behavior:** A resource already resolved to acceptable verified bytes
may be reused without changing its content identity. Resource-use state remains
separate from acquisition.

Resolving a resource does not install it globally, activate it, execute it, or
prove that an agent consulted it.

## `capability-conformance`

**Purpose:** Inspect whether a supplied capability-conformance result is
correctly bound to an exact package declaration, contract, suite, check set,
realization subject, and evidence set.

**Reads:** One valid package, one declared capability, its package-local
conformance material, and an optional supplied result document.

**Writes:** Nothing.

**Network:** Forbidden.

**Success:** Returns `not-evaluated`, `not-run`, `incomplete`, `failed`, or
`passed` from the supplied and validated state.

**Failure:** Returns a stable diagnostic for stale bindings, invalid result
shape, incomplete check identity, or inconsistent derived status.

**Repeat behavior:** Identical package and result bytes produce the same status.

This operation never runs the capability suite. A runner may produce the result,
but suite execution is outside the core protocol operation.

## Reference-tool commands

The reference CLI also exposes commands such as `begin`, `inspect`, `lint`,
`audit`, `conformance`, `doctor`, `completion`, and `verify-lock`. They compose
or explain protocol behavior but are not additional normative operations.

In particular:

- `conformance` evaluates the release's portable behavioral suite;
- `doctor` checks whether one installed toolchain is internally coherent;
- `begin` presents the safe pre-resolution handoff; and
- `lint` and `audit` produce quality guidance distinct from package validity.
