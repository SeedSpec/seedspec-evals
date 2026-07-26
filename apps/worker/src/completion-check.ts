import type { Deliverable } from "@seedspec/eval-core";
import type { SubmissionStatus } from "@seedspec/eval-harness";

import type { PortablePackageDigest } from "./seedspec-tools.js";

export type CompletionCheck = {
  passed: boolean;
  traceStatus: "succeeded" | "failed" | "cancelled" | "rejected";
  submissionStatus: SubmissionStatus;
  workspaceDigestAvailable: boolean;
  requiredDeliverablePaths: string[];
  missingRequiredDeliverablePaths: string[];
  unverifiableRequiredDeliverableIds: string[];
  failureCodes: string[];
};

export function assessCompletion(
  submissionStatus: SubmissionStatus,
  deliverables: readonly Deliverable[],
  artifactDigest: PortablePackageDigest,
): CompletionCheck {
  const required = deliverables.filter((deliverable) => deliverable.required);
  const requiredWithPaths = required.filter(
    (deliverable): deliverable is Deliverable & { path: string } => deliverable.path !== undefined,
  );
  const requiredDeliverablePaths = requiredWithPaths.map(({ path }) => path);
  const unverifiableRequiredDeliverableIds = required
    .filter(({ path }) => path === undefined)
    .map(({ id }) => id);
  const artifactPaths = artifactDigest.ok
    ? artifactDigest.files.map(({ path }) => path)
    : [];
  const missingRequiredDeliverablePaths = requiredDeliverablePaths.filter(
    (requiredPath) => !artifactPaths.some(
      (artifactPath) => artifactPath === requiredPath || artifactPath.startsWith(`${requiredPath}/`),
    ),
  );
  const failureCodes = [
    ...(artifactDigest.ok ? [] : ["workspace-digest-unavailable"]),
    ...(missingRequiredDeliverablePaths.length === 0 ? [] : ["required-deliverable-missing"]),
    ...(unverifiableRequiredDeliverableIds.length === 0 ? [] : ["required-deliverable-unverifiable"]),
  ];
  const artifactGatePassed = failureCodes.length === 0;
  const passed = submissionStatus === "completed" && artifactGatePassed;
  const traceStatus = submissionStatus === "completed"
    ? artifactGatePassed ? "succeeded" : "failed"
    : submissionStatus === "aborted"
      ? "cancelled"
      : submissionStatus === "skipped"
        ? "rejected"
        : "failed";

  return {
    passed,
    traceStatus,
    submissionStatus,
    workspaceDigestAvailable: artifactDigest.ok,
    requiredDeliverablePaths,
    missingRequiredDeliverablePaths,
    unverifiableRequiredDeliverableIds,
    failureCodes,
  };
}
