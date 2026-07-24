import type { RunAgentConfig } from "./contracts.js";

export function equalRunAgentConfigs(left: RunAgentConfig, right: RunAgentConfig): boolean {
  return (
    left.runId === right.runId &&
    left.caseId === right.caseId &&
    left.stage === right.stage &&
    left.variant === right.variant &&
    left.model === right.model &&
    left.gatewayId === right.gatewayId &&
    left.maxSteps === right.maxSteps &&
    left.untrustedMaterial === right.untrustedMaterial &&
    left.authoredInput?.artifactId === right.authoredInput?.artifactId &&
    left.guidanceInput?.artifactId === right.guidanceInput?.artifactId &&
    equalStringRecords(left.simulatedAuthorResponses, right.simulatedAuthorResponses) &&
    left.trustedInstructions.length === right.trustedInstructions.length &&
    left.trustedInstructions.every(
      (instruction, index) => instruction === right.trustedInstructions[index],
    )
  );
}

export function conflictingRunConfigFields(
  existing: RunAgentConfig,
  requested: RunAgentConfig,
): string[] {
  const fields: string[] = [];
  if (existing.runId !== requested.runId) fields.push("runId");
  if (existing.caseId !== requested.caseId) fields.push("caseId");
  if (existing.stage !== requested.stage) fields.push("stage");
  if (existing.variant !== requested.variant) fields.push("variant");
  if (existing.model !== requested.model) fields.push("model");
  if (existing.gatewayId !== requested.gatewayId) fields.push("gatewayId");
  if (existing.maxSteps !== requested.maxSteps) fields.push("maxSteps");
  if (existing.untrustedMaterial !== requested.untrustedMaterial) fields.push("untrustedMaterial");
  if (existing.authoredInput?.artifactId !== requested.authoredInput?.artifactId) {
    fields.push("authoredInput");
  }
  if (existing.guidanceInput?.artifactId !== requested.guidanceInput?.artifactId) {
    fields.push("guidanceInput");
  }
  if (!equalStringRecords(existing.simulatedAuthorResponses, requested.simulatedAuthorResponses)) {
    fields.push("simulatedAuthorResponses");
  }
  if (
    existing.trustedInstructions.length !== requested.trustedInstructions.length ||
    !existing.trustedInstructions.every(
      (instruction, index) => instruction === requested.trustedInstructions[index],
    )
  ) {
    fields.push("trustedInstructions");
  }
  return fields;
}

function equalStringRecords(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
}
