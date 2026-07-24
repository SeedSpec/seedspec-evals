# SeedSpec Protocol 0.2: Package and Handoff Specification

**Status:** Experimental

| Release identifier | Value |
| --- | --- |
| Protocol family | `0.2` |
| Schema package / exact release | `@seedspec/protocol@0.2.0` |
| Conformance suite | `0.2.0` |

The normative `docs/01-language.md` definition is the first reference for
SeedSpec concepts, authority, processing, operations, and claims. This document
defines their exact package and handoff behavior for Protocol 0.2. The
normative release bundle consists of the language definition, this
specification, the JSON Schemas in `packages/protocol/schemas/v0.2/`, the
operation contracts in `docs/operations.md`, and the conformance contract
indexed by `conformance/cases.yaml`. `protocol-release.json` binds their exact
revisions.

These surfaces are parts of one contract. A contradiction among them is a
protocol defect; an implementation MUST NOT silently choose a preferred source
and claim conformance.

Documents marked informative explain authoring, runtime use, security, and
examples. Architecture decision records preserve non-normative rationale. The
informative `docs/glossary.md` defines the terminology used across those public
surfaces.

SeedSpec also includes guided authoring, reference runtime and CLI tooling, and
independent distribution systems. Those layers can help improve or curate a
package, but this document governs only interoperable package and handoff
behavior. Informative explanations of the distinction are available in
`ARCHITECTURE.md`, `docs/semantic-structure.md`, and `docs/evaluations.md`.

Informative release guidance for the independent version domains is available
in `docs/versioning.md`.

Protocol 0.2 is available for implementation and interoperability testing.
Pre-1.0 releases may contain incompatible corrections. Each release MUST
identify its exact protocol family, schema-package version, and conformance-suite
version; tooling and integrations that require reproducibility SHOULD pin those
revisions explicitly.

Format validation constrains SeedSpec artifacts and deterministic runtime
output. It does not establish semantic completeness or authoring quality, make
agent execution deterministic, or constrain the architecture, vocabulary,
tools, or implementation decisions used to realize the packaged intent.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** describe interoperability requirements as defined by BCP 14 when shown in uppercase.

## Normative references

- [BCP 14 / RFC 2119](https://www.rfc-editor.org/info/rfc2119/) and its [RFC 8174 clarification](https://www.rfc-editor.org/info/rfc8174/) define requirement keywords.
- [YAML 1.2.2](https://yaml.org/spec/1.2.2/) defines YAML syntax and data model used by protocol YAML documents.
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) defines manifest-adjacent configuration and protocol schemas.
- [Semantic Versioning 2.0.0](https://semver.org/) defines package-version syntax and compatibility intent.
- [NIST FIPS 180-4, updated 2015](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) defines SHA-256.

## 1. Scope

The SeedSpec Protocol defines portable, agent-ready packages containing
semantically distinct intent, configuration, decisions, context, resources,
success criteria, and related artifacts. A package can help an agent produce
software, adapt a feature, configure an external system, establish an
automation, generate an operational artifact, or realize a composite solution.
The protocol standardizes package identity,
discovery, configuration, capabilities, artifact relationships, composition,
decisions, applied intent, evidence subjects, integrity, and resolved project
state.

The protocol standardizes how those concerns are identified, related,
preserved, and handed off. It does not assess whether an author supplied enough
substantive content for a strong seed. Authoring tools and publishers may make
separate, evidence-scoped quality claims without changing package conformance.

It does not standardize programming languages, frameworks, data stores, clouds,
repository layouts, user interfaces, deployment, external-service operation,
marketplace policy, payment, licensing enforcement, or the substantive content
of agent guidance. It standardizes how authors declare, version, resolve, and
preserve optional implementation resources without granting them automatic
authority.

## 2. Package model

A SeedSpec package is a dedicated directory whose root contains
`seedspec.yaml`. Every manifest carries one author-supplied `kind` hint:

- `solution`: a compound outcome or one whose realization form is intentionally
  broad;
- `application`: a user-facing software system or product;
- `feature`: behavior intended to extend or change an existing solution;
- `workflow`: a coordinated process across people, agents, or systems;
- `automation`: scheduled or event-driven behavior intended to run with limited
  human involvement;
- `configuration`: desired state primarily realized inside an existing system;
  or
- `integration`: a connection or coordinated behavior across systems.

Publishers MAY use a namespaced custom hint when none of the core suggestions
communicates the outcome adequately. Generic tooling MUST preserve unknown
namespaced hints and SHOULD fall back to `solution`-style guidance.

`kind` is communicative metadata, not a type system. It guides authoring tools,
quality checks, discovery, and agent handoff, but it MUST NOT determine whether
a package may be selected as a composition root or addition and MUST NOT impose
kind-specific required fields. Authoring tools SHOULD request the hint early,
adapt their prompts and recommendations to it, and identify likely omissions or
scope mismatches. They MUST present those findings separately from protocol
validity, MUST NOT silently rewrite the package, and SHOULD let the author keep
an unusual but intentional shape. Generic tools receiving a namespaced custom
kind SHOULD apply `solution` guidance while preserving the declared value.

Resolution position establishes composition role: the first selected package
is the root and every other selected package is an addition. The expected
authoring lens and reference diagnostics for each core kind are defined in
`docs/kind-guidance.md`. See also
`docs/decisions/0009-kind-hints-and-implementation-profiles.md`.

Every package MUST contain:

```text
package/
├── seedspec.yaml
├── definition/
│   └── <entrypoint>.md
└── configuration/
    ├── schema.json
    └── example.yaml
```

The manifest MAY discover optional components. Empty directories have no protocol meaning.

## 3. Serialization and paths

`seedspec.yaml`, package configuration, decision answers, and resolved YAML documents MUST be UTF-8 YAML 1.2 mappings. Duplicate mapping keys MUST be rejected. JSON documents MUST be UTF-8 JSON.

Conformance is determined from the materialized declarative package. Authors
MAY use language-specific builders, forms, agentic workflows, or other
authoring frontends to produce that package, but consumers MUST NOT require or
implicitly execute the authoring frontend. No particular authoring frontend or
implementation language is part of package conformance.

Protocol paths use `/` regardless of host operating system. Every path segment MUST:

- begin with an ASCII letter or digit;
- contain only ASCII letters, digits, `.`, `_`, or `-` after its first character;
- not be `.` or `..`;
- match case exactly.

Directory references MAY end in `/`. Absolute paths, backslashes, empty segments, hidden leading-dot segments, control characters, symlinks, case-only collisions, devices, sockets, and other non-regular file types are forbidden.

A conforming runtime MUST verify all package contents, not only manifest-referenced files. This conservative rule makes the same package safe and addressable on common case-sensitive and case-insensitive filesystems.

## 4. Identity

Package, capability, implementation resource, resource catalog, target, domain, artifact type, concern, relationship, adapter, and extension identifiers use lowercase reverse-DNS form with at least three segments:

```text
org.example.solutions.allowance-tracker
org.seedspec.core.transactions
org.example.vendor-extension
```

Each segment begins with an alphanumeric character and may then contain lowercase alphanumerics or hyphens.

Publishers SHOULD use a DNS namespace they control. Namespace syntax prevents accidental global collisions; it does not prove ownership or trust.

Local decision, artifact, task, implementation-profile, and profile-condition
IDs use lowercase hyphenated form within one package.

## 5. Versions

Four version domains are independent:

### 5.1 Protocol version

`protocol_version` selects the manifest, composition, integrity, and
resolved-state rules. This release requires the string `"0.2"`.

A runtime MUST reject an unsupported protocol version with `UNSUPPORTED_PROTOCOL_VERSION`. It MUST NOT guess compatibility from a numerically close version.

`"0.2"` identifies the protocol family. The exact contract is identified by the
published schema-package and conformance-suite versions. An implementation MUST
report those exact versions when presenting conformance results.

### 5.2 Package version

`version` is the package's Semantic Version. It may contain prerelease and build identifiers. Package versioning communicates product-definition evolution and is independent of capability contract versions.

### 5.3 Capability revision

A provider publishes the exact `major.minor.patch` revision of its current Markdown capability contract. A consumer records the exact revision it was designed or tested against through `tested_against`.

The revision is evidence, not a traditional package constraint. Exactly one
other-package declaration at the tested revision produces a `declared-aligned`
binding. Missing, multiple, self-provided, or different-revision declarations
produce `review` context and instruct the implementing agent to inspect the
actual realization. These states describe package declarations only and never
reject composition by themselves.

Older contract text may be retained in a package reference component or
external history so an agent can understand changes. Capability IDs act as
lineage identifiers and need not match the realized solution's user-facing
terminology.

### 5.4 Implementation resource version

Implementation resources use Semantic Versioning independently from the
protocol, CLI, package, and capability contracts. A package records a requested
version, update policy, canonical manifest URL, optional canonical digest, and
optional bundled fallback version and digest. Resolution MUST record the actual
version and source used.

## 6. Manifest

The normative shape is `packages/protocol/schemas/v0.2/seedspec.schema.json`.

Required fields are:

- `protocol_version`
- `id`
- `name`
- `version`
- `kind`
- `definition`
- `configuration`
- `provides`

Unknown top-level fields are forbidden. Publisher- or tool-specific data belongs under `extensions`.

### 6.1 Definition

`definition.entrypoint` references the package author's primary Markdown intent
definition. It
SHOULD describe what should be accomplished, why it matters, relevant actors
and permissions, desired outcomes, invariants, constraints, forbidden states,
non-goals, concepts, workflows, state transitions, rules, configuration
behavior, failures, edge cases, decision latitude, and observable success
without prescribing an execution path that the intended outcome does not
require.

The entrypoint MAY use native SeedSpec Markdown or another declared intent
format. `definition.artifact`, when present, references an artifact declared by
the same package. That artifact MUST use a package-local `path` identical to
`definition.entrypoint` and MUST declare
`org.seedspec.concern.intent`. The artifact's `type`, `format_version`, and
`conforms_to` metadata identify the entrypoint's native format.

An artifact used this way is the primary intent source and therefore
participates in core intent. Package validation still MUST NOT invoke the
external format's parser implicitly. Reading the intent content does not
activate the external format's skills, MCP server, synchronization behavior,
or other workflow.

### 6.2 Configuration

Every package declares:

- `configuration.schema`: JSON Schema Draft 2020-12;
- `configuration.example`: one complete valid configuration;
- optional `configuration.guide`.

The example MUST validate against the declared schema. Configuration describes
meaningful variations in intended solution behavior; technical implementation
preferences remain separate.

The example is author-supplied package material. It is not a default selected by
the user merely because the package was handed to an agent.

An optional resolution input conforming to
`configuration-selections.schema.json` records exactly one selection for every
selected root and addition package:

- `example` selects the package's exact validated example; or
- `custom` supplies a complete configuration object that MUST validate against
  the package schema.

Custom values are complete, not partial overrides. A runtime MUST NOT merge
omitted values from the example. Duplicate entries, entries for unselected
packages, and a selection file that omits a selected package are invalid.

When no configuration-selection input is supplied, resolution MAY preserve each
example as `example-unreviewed` so the handoff remains inspectable, but it MUST
set `configuration_status: review` and MUST NOT report the project as ready.

Root and addition configurations remain namespaced by package ID. A runtime MUST NOT flatten them into one keyspace.

### 6.3 Optional components

`components` discovers protocol-recognized files or directories: acceptance, integration, evals, examples, reference, deployment, maintenance, migration, compatibility, assets, security, and generation reports.

Presence makes a component discoverable but does not imply a standardized execution contract unless another protocol document defines one.

### 6.4 Ordered implementation tasks

`tasks`, when present, references one package-relative regular YAML file
conforming to `task-runbook.schema.json`. The runbook contains a non-empty
`tasks` array. Every task has a unique package-local `id`, a non-empty
`instruction`, and MAY have a non-empty, duplicate-free `references` array.
Each reference is a package-relative path to an existing regular file. Remote
URLs, directories, and paths outside the package are forbidden.

Tasks are package-author implementation reminders. Within one runbook, a
consumer MUST preserve and present array order. The list order is the only core
sequencing mechanism: protocol 0.1 defines no dependencies, branches,
conditions, checkpoints, jumps, or parallel-execution semantics. A selected
project containing multiple runbooks preserves each package's authored order
but derives no cross-package task order.

A task instruction and its references are implementation context, not product
intent, an additional acceptance requirement, executable content, authority to
change an external system, or evidence that a realization conforms. Finishing
the list MUST NOT be represented as proof of package or capability completion.
Merely referencing a script, prompt, tool, or instruction file MUST NOT execute
or activate it.
Mutable progress, skip reasons, blocking conditions, decisions, and evidence
belong to project or agent-run state outside the published package.

Resolution MUST preserve each selected package's runbook in `tasks.yaml`, copy
referenced files into the resolved workspace, and record source and resolved
paths. An implementing agent SHOULD address tasks in authored order, consult
their references as relevant context, and record rather than silently conceal
an inapplicable or blocked reminder.

### 6.5 Related artifacts

`artifacts` declares material preserved in its native format. Supporting
artifacts are optional; an artifact referenced by `definition.artifact` is the
primary intent source. Every artifact has:

- a package-local `id`;
- a globally namespaced `type`;
- exactly one package-relative `path` or absolute `url`.

An artifact MAY also declare a label, description, media type, native format
version, conformance URI, namespaced `concerns`, and `evidence_for` claims.
`evidence_for` is limited to the `package` subject: it states which package
claim the artifact is offered to support and MUST NOT be represented as proof
of a later realization. Concern identifiers are descriptive classification.
Core conventions include:

- `org.seedspec.concern.intent`
- `org.seedspec.concern.design`
- `org.seedspec.concern.execution`
- `org.seedspec.concern.infrastructure`
- `org.seedspec.concern.evidence`

A package-local artifact path MUST exist and may reference a regular file or directory. Core package validation verifies the reference but MUST NOT invoke a format-specific parser, load instructions or skills contained by the artifact, or fetch a remote artifact URL.

`relationships` MAY connect two artifact IDs declared by the same package. The relationship `type` is globally namespaced and descriptive. Examples such as `org.seedspec.relation.derived-from`, `org.seedspec.relation.implements`, and `org.seedspec.relation.validates` communicate traceability but have no automatic execution semantics in protocol 0.1. Both endpoints MUST exist.

Artifact declaration alone is discovery, not activation or authority. Protocol
0.1 deliberately has no generic artifact `authority`, `governing`, or
`advisory` field.
Lineage or precedence claims may be recorded as descriptive relationships, but
they do not require an implementing agent to adopt the artifact's workflow,
keep a realized solution synchronized with it, or treat it as current system
truth. Adapter-specific behavior requires explicit invocation by a user or
execution environment.

`definition.artifact` is the narrow exception to artifact-only discovery: it
identifies that artifact's content as the package's primary intent. Resolution
MUST preserve it with `intent_role: primary` and `disposition: selected`. An
artifact-selection input MUST NOT decline or defer it. These rules select the
content's intent role, not its native tooling or lifecycle.

### 6.6 Metadata

`metadata` MAY declare license and URI links. These values are self-asserted. They do not establish package authenticity or publisher authority.

### 6.7 Extensions

`extensions` is a mapping keyed by reverse-DNS identifiers. Values may contain any YAML/JSON-compatible data.

Core runtimes:

- MUST ignore extension semantics they do not understand;
- MUST retain extension data when copying or recording the source manifest;
- MUST include extension bytes in the package digest;
- MUST NOT promote an extension into core behavior without a protocol revision.

An extension cannot relax core validation or override a core field.

### 6.8 Implementation resources

`implementation_resources` is an optional author declaration. When omitted,
the author's position on additional SeedSpec guidance is `unspecified`; a
runtime MUST NOT reinterpret omission as acceptance or rejection.

An authoring or execution environment MAY separately recommend relevant
guidance when the package author is silent. It MUST identify the recommendation
as tooling, agent, or end-user direction; MUST NOT attribute it to the package
author; and MUST NOT automatically add it to the package, consult it, or promote
it into solution intent. `additional_guidance: none` is the package author's
explicit direction not to discover additional SeedSpec resources.

When present it declares `additional_guidance` as `none` or
`agent-delegated`, zero or more public versioned catalogs, and zero or more
author-selected resources. Catalogs are permitted only with
`agent-delegated`. Core defines catalog identity and discovery metadata but does
not define catalog search or ranking in protocol 0.1.

Every resource declares a namespaced ID, kind, description, usage, entrypoint,
requested version, update policy, and at least one canonical or bundled source.
Kinds are `skill`, `instructions`, `verification`, `tool`, and
`target-profile`. Usage is `expected`, `recommended`, or `available` and
expresses author intent only.

An optional `applies_to` mapping may name capability and target IDs. Matching is
advisory context. It does not prove that a capability exists in an
implementation, that a target is selected, or that the resource is suitable.

Canonical sources point to HTTPS resource manifests conforming to
`implementation-resource-manifest.schema.json`. An `exact` policy MUST declare
the expected canonical digest. `latest-compatible` accepts no older version
with the same major version; `latest` accepts no version older than the
requested baseline.

Bundled sources are package-local directory fallbacks with an exact version,
digest, and `exact` or `author-declared-compatible` relationship to the
requested version. The latter is an author claim, not proof. The runtime MUST
validate the directory, entrypoint, digest, and skill
frontmatter when applicable. Bundled fallback use MUST be visible with the
canonical failure reason. A runtime MUST NOT silently present fallback bytes as
the requested online version.

Resource discovery, author usage, content consultation, and tool activation are
separate. Resolving a resource MAY make verified instruction bytes available to
an agent. It MUST NOT execute a tool or grant permission for external effects.
See `docs/implementation-resources.md`.

A resource with `kind: skill` is a package-scoped skill. Its entrypoint MUST be
named `SKILL.md` and MUST contain non-empty `name` and `description` frontmatter.
That frontmatter is descriptive metadata for validation and agent review. A
SeedSpec runtime MUST NOT treat it as an automatic invocation rule, install the
skill into an environment-wide skill registry, or promote its instructions into
solution intent merely because the resource was declared or resolved. An
external agent environment MAY install the skill through a separate,
user-directed action outside SeedSpec resolution.

After resource resolution, the runtime MUST expose the verified resource kind,
root path, and entrypoint. An implementing agent can therefore explicitly
consult `path + entrypoint` and resolve supporting-file references from the
resource root. Consultation means the agent considered the guidance; it does
not imply that the guidance was followed, that a tool was executed, or that the
resulting solution satisfies the SeedSpec. Resource-use state records
`consulted` or `skipped`, not native skill activation.

### 6.9 Implementation profiles

The definition, configuration, capabilities, and acceptance material express
the package's **core intent**. An optional `implementation_profiles` array may
preserve materially different candidate directions for realizing that intent.
Each profile declares a package-local ID, name, and description and MAY declare:

- package-relative Markdown `guidance`;
- declarative `prerequisites` that must hold for the profile to be viable;
- declarative `blockers` whose presence prevents faithful use of the profile;
- human-readable `tradeoffs`; and
- references to implementation resources declared by the same package.

Every prerequisite and blocker has a local ID, a declarative statement, and a
`verification` object. The object declares a `method`, an `evidence`
expectation, and optional guidance. Core methods are `user-confirmation`,
`environment-inspection`, `tool-check`, `document-review`, and
`manual-observation`; `evidence` is `none`, `optional`, or `required`.
Publishers MAY use a namespaced custom method. Generic tooling MUST preserve
it and SHOULD surface supplied guidance and any need for user direction.

These are conditions to establish, not predetermined question wording or
authorization to perform the check. Generated handoff guidance SHOULD direct an
implementing agent to use available read-only evidence first and request user
confirmation when access or consequential interpretation is required. Package
validation and profile resolution MUST NOT execute a tool, access an account,
or claim that a condition holds.

A new verification method belongs in the core enum only when it has recurring
use across independent packages, is semantically distinct from existing
methods, gives a generic agent a clear responsibility, has a documented
evidence and trust model, has safe fallback behavior, and is covered by schema,
conformance, authoring-diagnostic, and end-to-end example tests. Namespaced
experimentation should precede core promotion. See
`docs/implementation-profiles.md`.

Profile IDs MUST be unique within a package. Condition IDs MUST be unique within
one profile. Guidance paths MUST exist, and implementation-resource references
MUST resolve to resources declared by the same package.

An implementation-profile preference is a package/profile pair. A root profile
MAY be selected by local ID shorthand. The preference is strong implementation
guidance from whoever initiated resolution; it is not a change to core intent,
an authorization for external effects, proof that prerequisites hold, or an
irreversible execution command.

When a selected package declares multiple profiles and no preference is
recorded, resolution MUST set `implementation_profile_status: review`, MUST set project
`status: needs-input`, and MUST instruct the implementing agent to explain the
material differences and ask which direction to prefer. When a preference is
recorded, the handoff MUST preserve all candidates, emphasize the preferred
profile, and instruct the agent to verify its prerequisites and blocker
conditions. If the preference conflicts with the actual environment or core
intent, the handoff MUST instruct the implementing agent to present the conflict
and request direction rather than silently switching profiles.

Resolution MUST produce exactly one project-level implementation profile state.
That state preserves the profiles from every selected package and records at
most one preferred profile for each package. It does not create a separate
state for every candidate. Comparing mutually exclusive project realizations
requires separate resolution runs or workspaces; one handoff MUST NOT contain
competing project-level profile states.

## 7. Capability contracts

A capability is an observable solution contract, not a screen, class, endpoint,
datastore, framework module, or vendor-specific implementation mechanism.

Every `provides.capabilities` item declares:

- globally namespaced `id`;
- exact contract `version`;
- Markdown `contract` path.

The contract MUST identify the capability and version and SHOULD define concepts, authorization expectations, invariants, state behavior, atomicity, retry behavior, failure behavior, and what consumers may rely upon.

Every `requires.capabilities` item declares an ID and a `tested_against` contract
revision. It records what the package author designed or tested against. The
implementing agent maps that behavioral lineage to the actual realization's
code, configuration, external state, and concepts; absence of a provider
declaration is not proof that the behavior is absent.

A provision MAY declare `change_history`. Each entry names an older `from`
revision, a newer `to` revision, and one or more changes with a stable local ID,
`breaking`, `additive`, or `clarifying` type, summary, and optional contract
references. Declared history MUST be a contiguous ascending chain ending at the
provided revision. A major transition MUST contain a breaking change; a minor
transition MUST contain no breaking change and at least one additive change; a
patch transition MUST contain only clarifying changes. When a capability
steward publishes a revision that replaces a prior revision, it MUST include
the applicable structured history. A publisher or registry with access to the
prior revision MUST reject a replacement that omits it; standalone package
validation cannot infer whether an earlier revision exists. History is an author declaration, not a
machine-derived semantic diff.

A provision MAY declare a `conformance.suite` path. The file MUST conform to
`capability-conformance-suite.schema.json`, identify the same capability ID and
revision, declare `partial` or `full` coverage, and contain unique checks. Core
check kinds are:

- `json-schema`, referencing a compilable JSON Schema file;
- `acceptance-scenarios`, referencing a document conforming to
  `capability-scenarios.schema.json` and naming a runner; and
- `eval-suite`, referencing a file or directory and naming a runner.

Check subjects are `data-shape`, `behavior`, `interaction`, or `outcome`.
Referenced paths MUST remain within the package and MUST exist. JSON Schema and
acceptance-scenario checks MUST reference files. Acceptance-scenario documents
MUST identify the same capability revision and contain unique scenario IDs.
Runners are namespaced identifiers. Declaring a runner does not install or
authorize it, and package validation MUST NOT execute conformance material.

`capability-conformance-result.schema.json` records the evaluation of one
realization against one exact suite. It binds the capability ID and revision,
contract digest, suite digest, realization reference and optional digest,
evaluator identity, evaluation time, derived status, per-check results, and
evidence. Result check IDs MUST exactly cover the suite without duplicates.
`pass` and `fail` checks require evidence; `not-run` checks forbid it. Status is
`not-run` when no check ran, `failed` when any check failed, `incomplete` when
some but not all checks ran, and `passed` only when every check passed.

The contract digest is SHA-256 over the exact Markdown contract bytes. The suite
digest is SHA-256 over the UTF-8 JSON encoding of an object whose ordered keys
are `suite` then `checks`. `suite` has ordered keys `path` then `digest` and
contains the declared suite path and its content digest. `checks` contains one
object per check, sorted by check ID in ascending UTF-8 byte order, with ordered keys `id`, `path`, then
`digest`. A file content digest is SHA-256 over exact bytes. A directory content
digest uses the canonical directory-digest algorithm in section 11. Digest
strings include the `sha256:` prefix inside the encoded object. Any changed
contract, suite, or check bytes make a preserved result stale.

A passed partial suite establishes only that declared subset. `full` is the
capability steward's coverage claim; it does not convert finite tests into a
proof that prose has no unexercised meaning. Capability conformance state is
separate from project completion state. A project MAY cite a capability result
as realization evidence, but neither evidence subject substitutes for the
other.

Within one package, required capability IDs, provided capability IDs, decision IDs, and artifact IDs MUST be unique.

### 7.1 Compatibility scope

Any package may declare `compatibility.scope` as `generic`, `domain`, or
`application`. Domain scope supplies a namespaced domain ID. Application scope
supplies one or more package IDs.

This is an author statement about intended, generalized, or tested context. A
runtime MAY use it to explain why a package deserves review, but MUST NOT treat
the scope as proof of compatibility or incompatibility with an actual
implementation.

## 8. Declared conflicts

A package MAY declare conflicts with package IDs or capability IDs and MUST
supply a human-readable reason.

When a declaration matches selected packages or capability declarations,
resolution preserves a review record with the declaring author's reason. It
does not reject the handoff. The implementing agent determines whether
the concern applies to the actual code, configuration, or external state and
resolve consequential conflicts with the end user.

Conflicts express known author concerns. Their presence is not proof of actual
incompatibility, and their absence is not proof of compatibility.

## 9. Solution decisions

A package MAY declare solution decisions containing local ID, question,
required flag, and optional allowed answers.

Answers are supplied as a mapping from package ID to decision ID and non-empty string answer. Unknown packages, unknown decision IDs, non-string answers, and answers outside declared options are invalid.

Resolution preserves unanswered declarations. A project has:

- `configuration_status: selected` when every package has an explicit
  configuration selection;
- `configuration_status: review` when examples are only unreviewed placeholders;
- `intent_status: affirmed` when the end user has recorded how every selected
  package applies and no project-local agent proposal remains unconfirmed;
- `intent_status: review` otherwise;
- `status: ready` only when configuration is selected, no required decision is
  unanswered, applied intent is affirmed, and no implementation-profile choice
  requires review; and
- `status: needs-input` otherwise.

Unanswered decisions and unselected configuration do not disappear or silently
become defaults. A handoff with `status: needs-input` MUST identify the unresolved
inputs and instruct the implementing agent not to make consequential choices
until they are resolved.

### 9.1 Applied intent and fit

An optional resolution input conforming to
`applied-intent-input.schema.json` records the end user's application of the
selected package intent. It MAY include at most one entry for each selected
package and records that package as `as-authored`, `adapted`, or `partial`.
`adapted` and `partial` MUST include a note explaining the intended difference.
Duplicate or unselected package references are invalid. Applied intent is
`affirmed` only when every selected package has an entry.

The input MAY add project-local contributions categorized as `objective`,
`outcome`, `invariant`, `constraint`, `forbidden-state`, `non-goal`,
`preference`, `decision-right`, or `baseline-observation`. Every contribution
records its source as `end-user` or `agent` and its status as `affirmed`,
`proposed`, or `observed`. An agent-proposed contribution MUST remain
`proposed` until the end user affirms it. A baseline observation MUST be
`observed` and MUST include one or more baseline evidence references. Each
reference identifies its source and MAY record when it was observed. It
describes current state and does not prove completion.

A contribution MAY include a verification plan specifying a `baseline`,
`realization`, or `outcome` subject, a core or namespaced method, timing,
required or optional evidence, and guidance. The plan describes how a claim
could be established. It is not verification state and is not evidence.

Resolution produces `resolved-intent.yaml`, preserving for every package its
version, digest, entrypoint, package-author provenance, native format, and
recorded use. It also preserves every local contribution and unresolved agent
proposal. When the input is omitted, any selected package is missing, or a
proposal remains unconfirmed, resolution MUST set `intent_status: review` and
MUST NOT report the project as ready.

An implementing agent SHOULD compare resolved intent with observed environment
state before selecting an implementation path. It MAY recommend adaptation,
partial reuse, or rejection when the package is a poor fit. It MUST NOT silently
cherry-pick package material and claim the complete package was satisfied.

### 9.2 Completion scope, verification plan, and verification state

Implementation readiness and completion are independent. An optional input
conforming to `completion-scope-input.schema.json` records project-local scope
items for selected packages.

A component item references the package's declared `acceptance` component and
selects either all material or a named subset. A subset MUST name included
references and MAY record deferred or excluded references. A criterion item
states an observable project-local expectation and marks it `included`,
`deferred`, or `excluded`.

Every included component or criterion item MUST declare a verification plan.
The plan identifies whether the item proves the `realization` or a later
`outcome`, the observation method, `completion` or `post-realization` timing,
and required evidence. It MAY include human-readable guidance. A verification
plan is agreed before implementation and MUST NOT be treated as a passing
result.

The runtime MUST validate selected package and component relationships,
project-local item ID uniqueness, and non-overlapping included, deferred, and
excluded references. Because acceptance components may be arbitrary Markdown,
the runtime does not claim that a named reference exists inside the prose.

Every selected package needs at least one included component or criterion item
for `completion_scope_status: recorded`. Otherwise the resolved scope lists the
package under `uncovered_packages` and reports `review`. Completion-scope review
does not change project input readiness. Completion tooling MUST NOT report
`verified` while selected packages remain uncovered.

Resolution creates `verification-state.yaml` only when missing. It binds to a
canonical digest of `completion-scope.yaml` and creates one result for every
included criterion or component item. Non-`not-run` results require evidence.
Runtimes MUST detect a stale scope digest, missing or extra item results, and a
recorded status that contradicts deterministic derivation.

Every evidence reference records a `realization` or `outcome` subject, a
reference, and its source. Its subject MUST match the completion item's
verification plan. Evidence MAY describe code and test results or observable
external state such as created resource identifiers, permission checks, queries
against known data, delivered messages, screenshots, or platform audit records.
Protocol validity does not establish that the evidence is truthful or
sufficient.

Package evidence, verification plans, baseline evidence, realization evidence,
and outcome evidence have different subjects. No one category proves another.
In particular, author evidence about a package does not prove a resolved
realization, and a successful realization does not prove that the package is
generally trustworthy or portable.

Core derived completion statuses are `scope-review`, `not-started`,
`in-progress`, `failed`, `verified-with-gaps`, and `verified`. Any failure yields
`failed`; unfinished included items yield `not-started` or `in-progress`; a
partial result or explicit deferral yields `verified-with-gaps`; only all-pass
evidence with no deferral yields `verified`. Exclusions narrow the stated scope
and do not themselves create a verification gap.

### 9.3 Artifact dispositions

Artifact discovery, preservation, disposition, review timing, and activation are
separate concepts.

An optional artifact-selection input conforms to
`artifact-selections.schema.json`. It records a package ID, package-local
artifact ID, and one of:

- `selected`: the user intends the artifact to inform the implementation;
- `declined`: the user does not want the artifact applied;
- `deferred`: the user explicitly postponed the choice.

Every declared artifact omitted from the input resolves as `unreviewed`. This is
not equivalent to an explicit deferral. Unknown selected packages, unknown
artifact IDs, and duplicate package/artifact entries are invalid.

Disposition is project state, not authority. Even `selected` MUST NOT by itself
load a skill, execute a script or command, fetch a remote URL, invoke an
adapter, or adopt an external workflow. Those actions require specific user or
execution-environment direction outside core resolution.

### 9.3 Implementation targets

Technical preferences MAY contain `implementation_targets` conforming to
`technical-preferences.schema.json`. A target declares:

- a project-local ID;
- a namespaced target kind such as `org.seedspec.target.hosting`;
- a namespaced provider or product target ID; and
- one or more guidance references to components, artifacts, or implementation
  resources in selected packages.

Every guidance reference MUST resolve. Referenced artifact guidance MUST have a
`selected` disposition. Component guidance is preserved package context and
does not require an artifact disposition. Implementation-resource guidance
MUST name an author-declared resource and MUST be resolved through the resource
lifecycle before its contents are loaded.

An implementation target is strong user-supplied planning context. It does not
prove that a realized solution is compatible with, deployable to, or accepted
by that target. Providers remain independent of SeedSpec core, and the
implementing agent remains responsible for applying the guidance to the actual
environment.

## 10. Composition: `declaration-review-v1`

Given one root package and zero or more additions, conforming runtimes perform
these steps in order:

1. Validate every package, referenced file, configuration example, semantic
   declaration, path, and digestability rule.
2. Require one root and unique selected package IDs. Package `kind` does not
   constrain composition position.
3. Sort selected additions by package ID using ascending UTF-8 byte order. This
   is deterministic recording order, not implementation or dependency order.
4. Record every provided capability declaration with its declaring package.
   Multiple declarations for one ID remain visible.
5. For every root or addition requirement, record zero or more declared
   provider candidates and compare each exact revision with `tested_against`,
   retaining revision direction, semver difference, review severity, and any
   relevant structured provider change history.
6. Record `no-declared-provider`, `multiple-declared-providers`,
   `self-declared-provider`, and `revision-difference` issues as applicable.
7. Record matched package conflicts, capability conflicts, and deterministic
   declared requirement cycles as review context.
8. Resolve applied intent and preserve the package-author and project-local
   provenance of every intent source. Require review for missing package use or
   unconfirmed agent proposals.
9. Resolve implementation-profile preferences. Preserve every candidate, make
   a recorded preference prominent, and require user review when a selected
   package has multiple candidates without a preference.
10. Generate the resolved handoff without treating those review records as
   installation gates.

CLI argument order has no semantic effect. Structural invalidity, unsafe
content and duplicate package selection remain errors.
Capability, compatibility, conflict, and cycle declarations are author-supplied
evidence. SeedSpec does not inspect the implementation and therefore cannot use
them to prove that a feature is compatible, incompatible, present, or absent.

Revision comparison uses `exact`, `provider-newer`, or `provider-older`
direction and `none`, `patch`, `minor`, or `major` difference. Exact matches
have no review severity. A newer patch provider is low, a newer minor provider
is medium, and a newer major provider is high. An older patch provider is
medium; an older minor or major provider is high. Other composition review
severities are high for no declared provider and declared package or capability
conflicts, and medium for multiple providers, self-provision, and declared
requirement cycles. Severity prioritizes
investigation and MUST NOT by itself permit or reject composition.

## 11. Package integrity

The canonical package digest is `sha256:<lowercase hex>` and ignores timestamps, permissions, and empty directories.

To calculate it:

1. Recursively enumerate every regular file under the package root, including `seedspec.yaml` and unreferenced files.
2. Reject forbidden paths, symlinks, case-only collisions, and non-regular entries.
3. Express each relative path with `/` and sort paths by ascending UTF-8 byte order.
4. For each file, calculate the lowercase hexadecimal SHA-256 of its exact bytes.
5. Feed the package SHA-256 stream these UTF-8/ASCII bytes for each sorted file:

```text
<relative-path> NUL <64-character-file-sha256> LF
```

6. Prefix the resulting lowercase hexadecimal digest with `sha256:`.

Formatting changes are byte changes and therefore change the digest. A resolved lock MUST record exact package versions and digests.

The digest proves content identity, not publisher identity, safety, or trust. Signing and registry attestations are outside this protocol release.

## 12. Resolved project state

Resolution writes a `.seedspec/` workspace without modifying source packages:

```text
.seedspec/
├── project.yaml
├── agent-guide.md
├── resolved-intent.yaml
├── tasks.yaml
├── task-references/
├── components.yaml
├── components/
├── artifacts.yaml
├── artifacts/
├── implementation-resources.yaml
├── implementation-resource-state.yaml
├── implementation-resources/
├── implementation-profile-state.yaml
├── implementation-profiles/
├── implementation-notes.md
├── verification-report.md
├── completion-scope.yaml
├── verification-state.yaml
├── resolution-receipt.json
├── resolved-spec.md
├── resolved-config.yaml
├── dependencies.lock.yaml
└── additions/
```

`project.yaml` conforms to `packages/protocol/schemas/v0.2/project.schema.json`.
It records combined readiness, `affirmed` or `review` intent status, `selected`
or `review` configuration status, `not-declared`, `recorded`, or `review`
implementation-profile status, independent `recorded` or `review`
completion-scope status, `no-declared-concerns` or `review` declaration status,
`recorded` or `review` artifact status, exact root and addition references, and
handoff file locations. Declaration status summarizes package evidence only; it
is not an implementation-compatibility verdict. Artifact status is `review`
while any non-primary artifact remains `unreviewed`; it does not make every
optional artifact a product-readiness gate.

`resolved-intent.yaml` conforms to `resolved-intent.schema.json`. It records the
package-author primary intent source, format, exact package revision, and end-
user use disposition for every selected package, plus project-local intent
contributions and unconfirmed agent proposals. It is the first provenance index
an implementing agent reads; the full content remains in `resolved-spec.md` and
preserved artifact paths.

`tasks.yaml` conforms to `task-index.schema.json`. It groups task sequences by
selected package, preserves every package's authored array order, and maps each
package-relative reference to its copied path beneath
`.seedspec/task-references/<package-id>/`. It contains no progress state and
defines no task ordering between packages.

`components.yaml` conforms to `packages/protocol/schemas/v0.2/component-index.schema.json`. It records every protocol-recognized optional component and its source and resolved paths. Resolution copies component files beneath `.seedspec/components/<package-id>/<component-name>/` and assigns deterministic review timing such as `before-planning` or `before-completion-claim`. Preservation and review timing do not activate component content or make author guidance authoritative.

`artifacts.yaml` conforms to
`packages/protocol/schemas/v0.2/artifact-index.schema.json`. It records every
selected package's artifact metadata, package-evidence claims, relationships,
deterministic review timing, and `selected`, `declined`, `deferred`, or
`unreviewed` disposition. A primary intent artifact is labeled
`intent_role: primary` and selected as core intent. Execution artifacts also
record that activation requires specific user direction. Resolution copies
package-local artifacts beneath
`.seedspec/artifacts/<package-id>/<artifact-id>/` and records both the source
package path and resolved path regardless of disposition. Remote URLs remain
URLs and are not fetched. Materialization preserves auditability and later
choice without activating an artifact-specific workflow.

`implementation-resources.yaml` conforms to
`implementation-resource-index.schema.json`. It preserves each selected
package's additional-guidance policy, catalogs, author-selected resource
metadata, canonical references, capability and target applicability, and copied
bundled fallbacks. `implementation-resource-state.yaml` conforms to
`implementation-resource-state.schema.json`, binds to the exact index digest,
and records each resource's kind and entrypoint, its canonical, bundled,
fallback, or unavailable resolution, and its consulted or skipped use state.
When resolution succeeds, `path` is the verified resource root and
`path + entrypoint` locates the agent-facing entry file. Resource use state is
local telemetry; the protocol does not transmit it.

`implementation-profile-state.yaml` conforms to
`implementation-profile-state.schema.json`. It is the single project-level
record for every selected package's kind hint, candidate profiles,
prerequisites, blockers, tradeoffs, and preferred profile when supplied. Each
package has at most one preferred profile. `implementation-profiles/` contains
copied profile guidance so the handoff remains durable without the source
package.

`dependencies.lock.yaml` conforms to `packages/protocol/schemas/v0.2/lock.schema.json`. It records exact package digests, deterministic addition order, every capability declaration, every requirement's declared provider candidates and revision comparisons, and all composition review records. It does not claim a provider is installed or that a capability exists in the actual realization.

Capability records in the lock preserve declared structured history and the
conformance-suite path when supplied. Provider candidates preserve revision
direction, semver difference, review severity, available change evidence, and
whether that evidence is complete, partial, unavailable, or unnecessary.
Revision-difference review records repeat the exact compared versions,
direction, semver difference, change-evidence status, and relevant declared
changes so a review queue need not reconstruct severity from prose or join an
opaque flag before prioritizing it.

`resolved-config.yaml` conforms to `packages/protocol/schemas/v0.2/resolved-config.schema.json`. It preserves root configuration, addition configurations keyed by package ID, and each configuration's `example-unreviewed`, `example`, or `custom` selection provenance. Answered decisions and technical preferences remain separate namespaces. Technical preferences remain extensible while the optional `implementation_targets` envelope receives core structural and reference validation.

`completion-scope.yaml` conforms to `completion-scope.schema.json` and records
included, deferred, excluded, and uncovered completion context plus the agreed
verification plan for every included item.
`verification-state.yaml` conforms to `verification-state.schema.json`, remains
bound to the exact scope digest, and is created only when missing so resolution
does not erase implementation evidence. Every evidence reference identifies the
realization or outcome subject it proves. `verification-report.md` remains the
human-readable detailed evidence companion.

`resolution-receipt.json` conforms to
`resolution-receipt.schema.json`. Its content-addressed subject binds the exact
protocol release, selected package identities and digests, supplied
resolution-input digests, project status, and aggregate digest of
protocol-owned output. Producer metadata is outside the subject digest. The
receipt contains no package prose, absolute paths, credentials, or arbitrary
project content and is not transmitted by the protocol.

`resolved-spec.md` is human- and agent-readable solution intent.
`agent-guide.md` explains how to interpret it. `implementation-notes.md`,
`verification-report.md`, and `verification-state.yaml` are created only when
missing so later resolution does not erase project memory. Notes may record
code mappings, architecture, external resource identifiers, configured state,
and material deviations. A changed scope intentionally makes preserved
verification state stale until an agent reconciles it.

## 13. Conformance

An implementation conforms to one exact Protocol 0.2 release when it:

1. passes every case in the conformance corpus bound by that release;
2. produces schema-valid project and lock documents;
3. calculates identical package digests;
4. produces the declared deterministic addition order; and
5. returns the specified stable error code for negative cases.

Human-readable error wording MAY vary. Stable error codes are interoperability
outputs asserted by the conformance suite.

The run MUST produce a schema-valid `conformance-report.schema.json` document
whose release-manifest digest, index digest, bundle digest, suite version,
runtime identity, environment, totals, and case results describe the exact run.
Only a complete bound suite with no failed or skipped case is `conformant`.
Passing another subset is an `incomplete` coverage report, not a conformance
claim.

Schema validation alone is insufficient because content safety, digests,
deterministic declaration analysis, review records, reference integrity, and
decisions require semantic validation.

Conformance establishes agreement with the package and handoff contract. It
does not certify a package, evaluate an implementing agent, or prove that a
realization satisfies its core intent.

## 14. Trust and non-goals

Protocol validity does not mean a package is safe, accurate, certified, legally usable, or faithfully implementable. Marketplaces may add review, certification, signatures, reputation, malware scanning, and policy, but those claims remain outside the neutral package format.

Protocol 0.2 does not define package registries, related-solution or
realization ranking, guidance-catalog search or ranking, signing, capability
delegation, provider selection, package dependency acquisition,
update/migration execution, eval execution, automatic artifact or tool
activation, telemetry transmission, continuous synchronization with code or
external systems, or code-generation adapters.
