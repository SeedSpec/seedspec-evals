import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parsePublicAcquisitionSuite,
  sha256Hex,
} from "@seedspec/eval-core";
import { describe, expect, it } from "vitest";

const SUITE_DIRECTORY = resolve(
  import.meta.dirname,
  "../../../suites/public-tool-acquisition",
);

describe("committed public tool-acquisition suite", () => {
  it("loads seven scenarios bound to exact public and runner instructions", async () => {
    const source = await readFile(resolve(SUITE_DIRECTORY, "suite.json"), "utf8");
    const suite = parsePublicAcquisitionSuite(JSON.parse(source) as unknown);
    const prompt = await readFile(
      resolve(SUITE_DIRECTORY, suite.instruction.path),
      "utf8",
    );
    const runnerInstruction = await readFile(
      resolve(SUITE_DIRECTORY, suite.runnerInstruction.path),
      "utf8",
    );

    expect(suite.scenarios).toHaveLength(7);
    expect(suite.instruction.digest).toBe(`sha256:${sha256Hex(prompt)}`);
    expect(suite.runnerInstruction.digest).toBe(
      `sha256:${sha256Hex(runnerInstruction)}`,
    );
    expect(new Set(suite.scenarios.map(({ id }) => id)).size).toBe(7);
    expect(
      suite.scenarios.map(({ id }) => id),
    ).toEqual([
      "supported-no-cli",
      "replace-incompatible-cli",
      "unavailable-cli-release",
      "unsupported-protocol-family",
      "invalid-supplied-tool-integrity",
      "offline-official-reuse",
      "unofficial-lookalike",
    ]);
  });

});
