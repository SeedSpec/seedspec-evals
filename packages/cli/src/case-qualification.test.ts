import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  artifactTreeDigest,
  finalizeCaseQualificationFile,
} from "./case-qualification.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});
describe("case qualification files", () => {
  it("infers the adjacent case from a qualification directory", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "seedspec-qualification-test-"));
    temporaryDirectories.push(root);
    const result = await finalizeCaseQualificationFile({
      draft: resolve(
        "cases/02-existing-product-feature/qualification/qualification-draft.yaml",
      ),
      caseRoot: resolve("cases"),
      out: resolve(root, "qualification.json"),
    });
    expect(result.qualification.case.id).toBe("existing-ledger-recurring-templates");
    expect(result.qualification.status).toBe("draft");
  });

  it("rejects a symbolic link as the root of a frozen artifact", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "seedspec-qualification-link-test-"));
    temporaryDirectories.push(root);
    const target = resolve(
      "cases/02-existing-product-feature/qualification/candidates/known-bad",
    );
    const link = resolve(root, "candidate-link");
    await symlink(target, link);
    await expect(artifactTreeDigest(link)).rejects.toThrow(/cannot be symbolic links/);
  });
});
