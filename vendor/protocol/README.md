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
ordered implementation task runbooks, implementation resources, and observable
success. The protocol separately records end-user applied intent, pre-implementation
verification plans, and actual realization or outcome evidence while leaving
execution to an implementing agent under the end user's direction.

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
npm install @seedspec/protocol@0.2.0
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

Individual schemas are exported beneath `@seedspec/protocol/schemas/v0.2/`.
Normative documents are exported beneath `@seedspec/protocol/documents/`.
The exact release manifest is exported as
`@seedspec/protocol/protocol-release.json`, and the portable suite is bundled as
`@seedspec/protocol/conformance-bundle.json` so an installed runtime can verify
itself offline. The package contains declarative schemas, release metadata, and
fixtures only; it does not execute SeedSpec package content.

Protocol `0.2` is experimental. Pin exact versions when building interoperable
tools.

- Documentation: [seedspec.dev](https://seedspec.dev)
- Language definition: [SeedSpec language](https://github.com/SeedSpec/seedspec/blob/main/docs/01-language.md)
- Why semantic structure matters: [guide](https://github.com/SeedSpec/seedspec/blob/main/docs/semantic-structure.md)
- Specification: [Protocol 0.2](https://github.com/SeedSpec/seedspec/blob/main/docs/protocol.md)
- Exact schemas: [seedspec.dev/releases/0.2.0/schemas](https://seedspec.dev/releases/0.2.0/schemas/seedspec.schema.json)
- Conformance suite: [cases.yaml](https://github.com/SeedSpec/seedspec/blob/main/conformance/cases.yaml)
- Source: [SeedSpec/seedspec](https://github.com/SeedSpec/seedspec)
