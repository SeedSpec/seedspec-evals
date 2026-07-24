import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const protocolPackageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
).version;

export const protocolReleasePath = fileURLToPath(
  new URL("../protocol-release.json", import.meta.url)
);
export const conformanceBundlePath = fileURLToPath(
  new URL("../conformance-bundle.json", import.meta.url)
);
const protocolReleaseBytes = readFileSync(protocolReleasePath);
export const protocolRelease = Object.freeze(JSON.parse(protocolReleaseBytes));
export const protocolVersion = protocolRelease.protocol_family;
export const conformanceSuiteVersion = protocolRelease.conformance.suite_version;
export const protocolReleaseDigest = `sha256:${createHash("sha256")
  .update(protocolReleaseBytes)
  .digest("hex")}`;

export const protocolSchemaNames = Object.freeze([
  "seedspec.schema.json",
  "application.schema.json",
  "feature.schema.json",
  "project.schema.json",
  "component-index.schema.json",
  "artifact-index.schema.json",
  "artifact-selections.schema.json",
  "configuration-selections.schema.json",
  "applied-intent-input.schema.json",
  "resolved-intent.schema.json",
  "completion-scope-input.schema.json",
  "completion-scope.schema.json",
  "verification-state.schema.json",
  "task-runbook.schema.json",
  "task-index.schema.json",
  "capability-conformance-suite.schema.json",
  "capability-scenarios.schema.json",
  "capability-conformance-result.schema.json",
  "technical-preferences.schema.json",
  "implementation-resource-manifest.schema.json",
  "implementation-resource-index.schema.json",
  "implementation-resource-state.schema.json",
  "implementation-profile-state.schema.json",
  "lock.schema.json",
  "resolved-config.schema.json",
  "conformance.schema.json",
  "protocol-release.schema.json",
  "conformance-report.schema.json",
  "resolution-receipt.schema.json"
]);

export const schemaDirectory = fileURLToPath(
  new URL("../schemas/v0.2/", import.meta.url)
);
export const protocolDocumentDirectory = fileURLToPath(
  new URL("../documents/", import.meta.url)
);
