import type { Deliverable } from "@seedspec/eval-core";
import { describe, expect, it } from "vitest";

import { assessCompletion } from "./completion-check.js";
import type { PortablePackageDigest } from "./seedspec-tools.js";

const requiredInstructions: Deliverable[] = [{
  id: "instructions",
  description: "Implementation instructions",
  required: true,
  path: "instructions.md",
}];

function digest(paths: string[]): PortablePackageDigest {
  return {
    ok: true,
    algorithm: "seedspec-package-sha256-v1",
    digest: `sha256:${"0".repeat(64)}`,
    fileCount: paths.length,
    files: paths.map((path) => ({
      path,
      digest: `sha256:${"1".repeat(64)}`,
      size: 1,
    })),
  };
}

describe("Think completion check", () => {
  it("marks a completed submission successful when its required artifacts exist", () => {
    expect(assessCompletion("completed", requiredInstructions, digest(["instructions.md"]))).toEqual({
      passed: true,
      traceStatus: "succeeded",
      submissionStatus: "completed",
      workspaceDigestAvailable: true,
      requiredDeliverablePaths: ["instructions.md"],
      missingRequiredDeliverablePaths: [],
      unverifiableRequiredDeliverableIds: [],
      failureCodes: [],
    });
  });

  it("downgrades a completed submission when a required artifact is missing", () => {
    expect(assessCompletion("completed", requiredInstructions, digest(["notes.md"]))).toMatchObject({
      passed: false,
      traceStatus: "failed",
      missingRequiredDeliverablePaths: ["instructions.md"],
      failureCodes: ["required-deliverable-missing"],
    });
  });

  it("downgrades a completed submission when the workspace digest is unavailable", () => {
    expect(assessCompletion("completed", requiredInstructions, {
      ok: false,
      code: "PATH_NOT_PORTABLE",
      paths: ["/instructions.md"],
    })).toMatchObject({
      passed: false,
      traceStatus: "failed",
      workspaceDigestAvailable: false,
      missingRequiredDeliverablePaths: ["instructions.md"],
      failureCodes: ["workspace-digest-unavailable", "required-deliverable-missing"],
    });
  });

  it("requires an adapter-verifiable path for every required deliverable", () => {
    expect(assessCompletion("completed", [{
      id: "external-change",
      description: "An external system was changed",
      required: true,
    }], digest([]))).toMatchObject({
      passed: false,
      traceStatus: "failed",
      unverifiableRequiredDeliverableIds: ["external-change"],
      failureCodes: ["required-deliverable-unverifiable"],
    });
  });

  it("checks delivery rather than trying to judge hostile artifact semantics", () => {
    const hostileContentStillHasTheSameArtifactPath = digest(["instructions.md"]);
    expect(assessCompletion(
      "completed",
      requiredInstructions,
      hostileContentStillHasTheSameArtifactPath,
    )).toMatchObject({
      passed: true,
      traceStatus: "succeeded",
    });
  });

  it("preserves terminal submission outcomes when artifact delivery passes", () => {
    expect(assessCompletion("aborted", requiredInstructions, digest(["instructions.md"]))).toMatchObject({
      passed: false,
      traceStatus: "cancelled",
    });
    expect(assessCompletion("skipped", requiredInstructions, digest(["instructions.md"]))).toMatchObject({
      passed: false,
      traceStatus: "rejected",
    });
    expect(assessCompletion("error", requiredInstructions, digest(["instructions.md"]))).toMatchObject({
      passed: false,
      traceStatus: "failed",
    });
  });
});
