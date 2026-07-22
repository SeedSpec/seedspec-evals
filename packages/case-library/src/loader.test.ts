import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { CaseLibraryError, caseLibraryErrorCodes } from "./errors.js";
import {
  discoverCaseFiles,
  loadCaseFile,
  loadCaseLibrary,
} from "./loader.js";

const committedCasesDirectory = resolve(import.meta.dirname, "../../../cases");
const temporaryDirectories: string[] = [];

function validCase(id: string): object {
  return {
    schemaVersion: 1,
    id,
    version: "1.0.0",
    title: `Test case ${id}`,
    authorship: {
      mode: "sparse-application",
      sourceMaterials: [
        {
          id: "prompt",
          label: "Prompt",
          mediaType: "text/plain",
          content: "A sparse, untrusted request.",
          origin: { kind: "inline" },
          trust: "untrusted",
        },
      ],
      constraints: [],
      variants: {
        "raw-source": {
          objective: "Write implementation-ready instructions.",
          deliverables: [{ id: "instructions", description: "Instructions", required: true, path: "instructions.md" }],
        },
        "markdown-authored": {
          objective: "Write a Markdown specification.",
          deliverables: [{ id: "instructions", description: "Instructions", required: true, path: "instructions.md" }],
        },
        "seedspec-minimal": {
          objective: "Author a small evaluation package.",
          deliverables: [{ id: "package", description: "A package", required: true, path: "seedspec.yaml", mediaType: "application/yaml" }],
        },
        "seedspec-guided": {
          objective: "Author a guided evaluation package.",
          deliverables: [{ id: "package", description: "A package", required: true, path: "seedspec.yaml", mediaType: "application/yaml" }],
        },
        "seedspec-restructured": {
          objective: "Author a small evaluation package.",
          deliverables: [{ id: "package", description: "A package", required: true, path: "seedspec.yaml", mediaType: "application/yaml" }],
        },
      },
    },
    successCriteria: [
      {
        id: "valid",
        stage: "authorship",
        description: "The package is valid.",
        measure: {
          kind: "deterministic",
          check: "seedspec.package.valid",
          target: true,
        },
      },
    ],
    hiddenExpectations: [],
    permittedVariability: [],
    simulatedToolResponses: [],
  };
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "seedspec-case-library-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeCase(
  root: string,
  relativePath: string,
  value: object,
): Promise<string> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  const content = filePath.endsWith(".json")
    ? JSON.stringify(value)
    : stringify(value);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("case discovery and loading", () => {
  it("loads the committed corpus in stable path order through the core schema", async () => {
    const first = await loadCaseLibrary(committedCasesDirectory);
    const second = await loadCaseLibrary(committedCasesDirectory);

    expect(first.map(({ relativePath }) => relativePath)).toEqual([
      "01-sparse-application/case.yaml",
      "02-existing-product-feature/case.yaml",
      "03-cross-system-workflow/case.yaml",
      "04-extract-existing-solution/case.yaml",
    ]);
    expect(second.map(({ case: evaluationCase }) => evaluationCase.id)).toEqual(
      first.map(({ case: evaluationCase }) => evaluationCase.id),
    );
    expect(first).toHaveLength(4);
    expect(
      first.map(({ case: evaluationCase }) => evaluationCase.authorship.mode),
    ).toEqual([
      "sparse-application",
      "existing-product-feature",
      "cross-system-workflow",
      "extract-existing-solution",
    ]);
    for (const { case: evaluationCase } of first) {
      expect(
        evaluationCase.authorship.sourceMaterials.every(
          ({ trust }) => trust === "untrusted",
        ),
      ).toBe(true);
      expect(evaluationCase.authorship.constraints.length).toBeGreaterThan(0);
      expect(evaluationCase.successCriteria.length).toBeGreaterThan(0);
      expect(evaluationCase.hiddenExpectations.length).toBeGreaterThan(0);
      expect(evaluationCase.permittedVariability.length).toBeGreaterThan(0);
      expect(evaluationCase.simulatedToolResponses.length).toBeGreaterThan(0);
      expect(evaluationCase.technicalExpectations.length).toBeGreaterThan(0);
      expect(evaluationCase.adaptationChallenges.length).toBeGreaterThan(0);
    }
    expect(first.every(({ case: evaluationCase }) => Object.isFrozen(evaluationCase))).toBe(
      true,
    );
  });

  it("discovers YAML and JSON manifests with bytewise-stable ordering", async () => {
    const root = await makeTemporaryDirectory();
    await writeCase(root, "z-last/case.json", validCase("json-case"));
    await writeCase(root, "a-first/case.yaml", validCase("yaml-case"));
    await writeFile(join(root, "not-a-case.yaml"), "ignored: true\n", "utf8");

    const discovered = await discoverCaseFiles(root);
    const loaded = await loadCaseLibrary(root);

    const canonicalRoot = dirname(dirname(discovered[0] ?? root));
    expect(discovered.map((filePath) => relative(canonicalRoot, filePath))).toEqual([
      "a-first/case.yaml",
      "z-last/case.json",
    ]);
    expect(loaded.map(({ case: evaluationCase }) => evaluationCase.id)).toEqual([
      "yaml-case",
      "json-case",
    ]);
  });

  it("rejects lexical path traversal before reading a file", async () => {
    const temporary = await makeTemporaryDirectory();
    const root = join(temporary, "cases");
    await mkdir(root);
    await writeCase(temporary, "outside/case.json", validCase("outside"));

    await expect(loadCaseFile(root, "../outside/case.json")).rejects.toMatchObject({
      code: caseLibraryErrorCodes.outsideRoot,
    });
    await expect(loadCaseFile(root, "../outside/case.json")).rejects.toThrow(
      "escapes the configured root",
    );
  });

  it("rejects a path that resolves outside the root through a directory symlink", async () => {
    const temporary = await makeTemporaryDirectory();
    const root = join(temporary, "cases");
    const outside = join(temporary, "outside");
    await mkdir(root);
    await writeCase(outside, "case.json", validCase("outside"));
    await symlink(outside, join(root, "linked-outside"), "dir");

    await expect(
      loadCaseFile(root, "linked-outside/case.json"),
    ).rejects.toMatchObject({ code: caseLibraryErrorCodes.outsideRoot });
  });

  it("enforces the configured byte bound before parsing", async () => {
    const root = await makeTemporaryDirectory();
    await mkdir(join(root, "large"));
    await writeFile(join(root, "large/case.yaml"), "x".repeat(65), "utf8");

    await expect(
      loadCaseFile(root, "large/case.yaml", { maxCaseBytes: 64 }),
    ).rejects.toMatchObject({ code: caseLibraryErrorCodes.tooLarge });
    await expect(
      loadCaseFile(root, "large/case.yaml", { maxCaseBytes: 64 }),
    ).rejects.toThrow("the limit is 64 bytes");
  });

  it("reports duplicate YAML keys as a malformed document", async () => {
    const root = await makeTemporaryDirectory();
    await mkdir(join(root, "duplicate"));
    await writeFile(
      join(root, "duplicate/case.yaml"),
      "schemaVersion: 1\nschemaVersion: 1\n",
      "utf8",
    );

    await expect(
      loadCaseFile(root, "duplicate/case.yaml"),
    ).rejects.toMatchObject({ code: caseLibraryErrorCodes.malformedDocument });
    await expect(
      loadCaseFile(root, "duplicate/case.yaml"),
    ).rejects.toThrow("Map keys must be unique");
  });

  it("reports core-schema issue paths for structurally invalid cases", async () => {
    const root = await makeTemporaryDirectory();
    const invalid = validCase("invalid") as Record<string, unknown>;
    invalid["schemaVersion"] = 2;
    await writeCase(root, "invalid/case.json", invalid);

    await expect(loadCaseFile(root, "invalid/case.json")).rejects.toMatchObject({
      code: caseLibraryErrorCodes.validationFailed,
    });
    await expect(loadCaseFile(root, "invalid/case.json")).rejects.toThrow(
      "schemaVersion",
    );
  });

  it("rejects duplicate case ids with both source paths in the error", async () => {
    const root = await makeTemporaryDirectory();
    await writeCase(root, "first/case.json", validCase("duplicate-id"));
    await writeCase(root, "second/case.yaml", validCase("duplicate-id"));

    await expect(loadCaseLibrary(root)).rejects.toMatchObject({
      code: caseLibraryErrorCodes.duplicateId,
    });
    await expect(loadCaseLibrary(root)).rejects.toThrow(
      /first\/case\.json.*second\/case\.yaml/,
    );
  });

  it("uses a typed error for inaccessible roots", async () => {
    const root = join(await makeTemporaryDirectory(), "missing");

    const promise = discoverCaseFiles(root);
    await expect(promise).rejects.toBeInstanceOf(CaseLibraryError);
    await expect(promise).rejects.toMatchObject({
      code: caseLibraryErrorCodes.invalidRoot,
    });
  });
});
