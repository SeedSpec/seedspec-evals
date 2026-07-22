# `@seedspec/protocol`

Canonical schemas and version metadata for the SeedSpec Protocol.

SeedSpec packages describe package-author intent, context, configuration,
capabilities, optional implementation resources, and observable success. The
protocol separately records end-user applied intent, pre-implementation
verification plans, and actual realization or outcome evidence while leaving
execution to an implementing agent under the end user's direction.

## Install

```bash
npm install @seedspec/protocol@next
```

## Use

```js
import {
  conformanceSuiteVersion,
  protocolPackageVersion,
  protocolSchemaNames,
  protocolVersion,
  schemaDirectory
} from "@seedspec/protocol";
```

Individual schemas are exported beneath `@seedspec/protocol/schemas/v0.1/`.
The package contains declarative schemas and metadata only; it does not execute
SeedSpec package content.

Protocol `0.1` is a design alpha. Pin exact prerelease versions when building
interoperable tools.

- Documentation: [seedspec.dev](https://seedspec.dev)
- Specification: [Protocol 0.1](https://github.com/SeedSpec/seedspec/blob/main/docs/protocol.md)
- Canonical schemas: [seedspec.dev/schemas/v0.1](https://seedspec.dev/schemas/v0.1/seedspec.schema.json)
- Conformance suite: [cases.yaml](https://github.com/SeedSpec/seedspec/blob/main/conformance/cases.yaml)
- Source: [SeedSpec/seedspec](https://github.com/SeedSpec/seedspec)
