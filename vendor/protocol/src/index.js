import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const protocolVersion = "0.1";
export const protocolPackageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
).version;
export const conformanceSuiteVersion = "2.1.0";

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
  "conformance.schema.json"
]);

export const schemaDirectory = fileURLToPath(
  new URL("../schemas/v0.1/", import.meta.url)
);
