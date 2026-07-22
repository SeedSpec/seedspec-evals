import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { parseAuthoredInputBundle } from "@seedspec/eval-core";
import { afterEach, describe, expect, it } from "vitest";

import { bundleAuthoredInput } from "./authored-input.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "seedspec-authored-input-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("authored implementation input bundles", () => {
  it("content-addresses ordered UTF-8 files and detects descriptor tampering", async () => {
    const directory = await temporaryDirectory();
    await mkdir(resolve(directory, "definition"));
    await Promise.all([
      writeFile(resolve(directory, "seedspec.yaml"), "seedspec: 0.1\n", "utf8"),
      writeFile(resolve(directory, "definition/application.md"), "# Intent\n", "utf8"),
    ]);

    const bundle = await bundleAuthoredInput(directory);
    expect(bundle.files.map(({ path }) => path)).toEqual(["definition/application.md", "seedspec.yaml"]);
    expect(bundle.artifactId).toMatch(/^artifact_[a-f0-9]{64}$/);
    expect(bundle.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const tampered = JSON.parse(JSON.stringify(bundle)) as { digest: string };
    tampered.digest = `sha256:${"f".repeat(64)}`;
    expect(() => parseAuthoredInputBundle(tampered)).toThrow(/digest does not match file descriptors/);
  });

  it("rejects binary input that the common parity workspace cannot mount", async () => {
    const directory = await temporaryDirectory();
    await writeFile(resolve(directory, "resource.bin"), Uint8Array.from([0xff, 0xfe, 0xfd]));
    await expect(bundleAuthoredInput(directory)).rejects.toThrow(/not UTF-8 text/);
  });
});
