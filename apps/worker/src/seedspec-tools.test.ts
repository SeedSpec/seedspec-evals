import type { WorkspaceLike } from "@cloudflare/think";
import { sha256Hex } from "@seedspec/eval-core";
import { describe, expect, it } from "vitest";

import { checkPackage, digestPackage } from "./seedspec-tools.js";

function fakeWorkspace(files: Record<string, string>): WorkspaceLike {
  const entries = Object.entries(files).map(([path, content]) => ({
    path,
    name: path.split("/").at(-1) ?? path,
    type: "file" as const,
    mimeType: "text/plain",
    size: new TextEncoder().encode(content).byteLength,
    createdAt: 0,
    updatedAt: 0,
  }));
  return {
    readFile: (path) => Promise.resolve(files[path] ?? null),
    readFileBytes: (path) => Promise.resolve(files[path] === undefined ? null : new TextEncoder().encode(files[path])),
    writeFile: () => Promise.resolve(),
    readDir: () => Promise.resolve(entries),
    rm: () => Promise.resolve(),
    glob: () => Promise.resolve(entries),
    mkdir: () => Promise.resolve(),
    stat: (path) => Promise.resolve(entries.find((entry) => entry.path === path) ?? null),
  };
}

const files = {
  "seedspec.yaml": [
    "protocol_version: '0.2'",
    "id: dev.seedspec.test-package",
    "name: Test package",
    "version: 0.1.0",
    "kind: application",
    "definition:",
    "  entrypoint: spec.md",
    "configuration:",
    "  schema: config.schema.json",
    "  example: config.example.yaml",
    "provides:",
    "  capabilities: []",
  ].join("\n"),
  "spec.md": "# Intent\n",
  "config.schema.json": "{\"type\":\"object\"}\n",
  "config.example.yaml": "enabled: true\n",
};

describe("Think SeedSpec workspace tools", () => {
  it("uses the canonical protocol schema and validates referenced files", async () => {
    await expect(checkPackage(fakeWorkspace(files), ".")).resolves.toMatchObject({
      ok: true,
      canonicalManifestSchema: {
        package: "@seedspec/protocol",
        version: "0.2.0",
      },
      packageValidationAdapter: "think-workspace",
      manifest: { id: "dev.seedspec.test-package", kind: "application" },
    });
  });

  it("uses the portable path-and-file-digest algorithm", async () => {
    const sorted = Object.entries(files).sort(([left], [right]) => compareUtf8(left, right));
    const packageInput = sorted.map(([path, content]) => `${path}\0${sha256Hex(content)}\n`).join("");
    await expect(digestPackage(fakeWorkspace(files), ".")).resolves.toMatchObject({
      ok: true,
      digest: `sha256:${sha256Hex(packageInput)}`,
      fileCount: 4,
    });
  });

  it("rejects fields forbidden by the canonical manifest schema", async () => {
    const invalid = { ...files, "seedspec.yaml": `${files["seedspec.yaml"]}\nunexpected: true\n` };
    await expect(checkPackage(fakeWorkspace(invalid), ".")).resolves.toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "MANIFEST_SCHEMA_INVALID" })],
    });
  });

  it("validates the example against its declared configuration schema", async () => {
    const invalid = {
      ...files,
      "config.schema.json": JSON.stringify({
        type: "object",
        required: ["enabled"],
        properties: { enabled: { type: "boolean" } },
      }),
      "config.example.yaml": "enabled: not-a-boolean\n",
    };
    await expect(checkPackage(fakeWorkspace(invalid), ".")).resolves.toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "CONFIGURATION_EXAMPLE_INVALID" })],
    });
  });

  it("applies package semantics beyond JSON Schema", async () => {
    const duplicateCapabilities = {
      ...files,
      "contract.md": "# Contract\n",
      "seedspec.yaml": files["seedspec.yaml"].replace(
        "  capabilities: []",
        [
          "  capabilities:",
          "    - id: dev.seedspec.test-capability",
          "      version: 1.0.0",
          "      contract: contract.md",
          "    - id: dev.seedspec.test-capability",
          "      version: 1.0.0",
          "      contract: contract.md",
        ].join("\n"),
      ),
    };
    await expect(checkPackage(fakeWorkspace(duplicateCapabilities), ".")).resolves.toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "MANIFEST_SEMANTICS_INVALID" })],
    });
  });
});

function compareUtf8(left: string, right: string): number {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}
