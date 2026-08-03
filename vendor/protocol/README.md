# `@seedspec/protocol`

Canonical schemas and version metadata for portable SeedSpec packages and
resolved handoffs.

The [SeedSpec language definition](https://github.com/SeedSpec/seedspec/blob/main/docs/01-language.md)
is the first reference for protocol concepts, authority, processing, operations,
and claims. This package supplies the exact machine-valid shapes and release
metadata for that language.

SeedSpec is a broader authoring-and-distribution system built around this
protocol package. Guided authoring helps people produce useful seeds; this npm
package supplies the neutral schemas and identifiers that let independent tools
interpret them consistently.

SeedSpec packages describe package-author intent, context, configuration,
capabilities, optional structured capability changes and conformance suites,
recursively bundled child SeedSpecs, prose integration seams, ordered
implementation task runbooks, implementation resources, context modules and
bridge bindings, and observable success. The protocol separately records end-user applied intent,
pre-implementation verification plans, and actual realization or outcome
evidence while leaving execution to an implementing agent under the end user's
direction.

Protocol validity establishes interoperable structure. It does not establish
that an author supplied a complete specification or that a later realization is
correct.

Capability-conformance result schemas are separate from project completion
state so tools can bind a provider evaluation to exact contract and suite bytes
without turning a project-specific success claim into a reusable certification.
Task-runbook and resolved-task-index schemas preserve author sequencing without
introducing dependencies, branches, or package-owned progress state.

## Install

```bash
npm install @seedspec/protocol
```

## Use

```js
import {
  conformanceSuiteVersion,
  protocolPackageVersion,
  protocolRelease,
  protocolReleaseDigest,
  protocolSchemaNames,
  protocolVersion,
  protocolDocumentDirectory,
  schemaDirectory
} from "@seedspec/protocol";
```

Individual Protocol 0.3 schemas are exported from
`@seedspec/protocol/schemas/v0.3/`. Historical schema directories can remain in
the source repository, but the 0.3 package does not ship them.
Normative documents are exported beneath `@seedspec/protocol/documents/`.
The exact release manifest is exported as
`@seedspec/protocol/protocol-release.json`, and the portable suite is bundled as
`@seedspec/protocol/conformance-bundle.json` so an installed runtime can verify
itself offline. The package contains declarative schemas, release metadata, and
fixtures only; it does not execute SeedSpec package content.

The protocol is experimental. Pin exact versions when building interoperable
tools.

- Documentation: [seedspec.dev](https://seedspec.dev)
- Language definition: [SeedSpec language](https://github.com/SeedSpec/seedspec/blob/main/docs/01-language.md)
- Why semantic structure matters: [guide](https://github.com/SeedSpec/seedspec/blob/main/docs/semantic-structure.md)
- Context modules and bridge Skills: [guide](https://github.com/SeedSpec/seedspec/blob/main/docs/context-modules.md)
- Specification: [SeedSpec Protocol](https://github.com/SeedSpec/seedspec/blob/main/docs/protocol.md)
- Schemas: [package directory](https://github.com/SeedSpec/seedspec/tree/main/packages/protocol/schemas)
- Conformance suite: [cases.yaml](https://github.com/SeedSpec/seedspec/blob/main/conformance/cases.yaml)
- Source: [SeedSpec/seedspec](https://github.com/SeedSpec/seedspec)
