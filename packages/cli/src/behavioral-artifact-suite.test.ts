import { readFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BehavioralSeamCaseSchema,
  evaluateBehavioralArtifactAssertion,
  type JsonValue,
} from "@seedspec/eval-core";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";

import { runBehavioralArtifactProbe } from "./behavioral-seam.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const suite = parseDocument(readFileSync(
  resolve(REPOSITORY_ROOT, "suites/behavioral/implement-stateful-workflows-artifacts.yaml"),
  "utf8",
), {
  schema: "core",
  strict: true,
  uniqueKeys: true,
  version: "1.2",
}).toJS({ maxAliasCount: 0 }) as { cases: unknown[] };
const controls = JSON.parse(readFileSync(
  resolve(
    REPOSITORY_ROOT,
    "suites/behavioral/implement-stateful-workflows-artifact-controls.json",
  ),
  "utf8",
)) as Record<string, { validAlternative: JsonValue; knownBad: JsonValue }>;
const executableSuite = parseDocument(readFileSync(
  resolve(
    REPOSITORY_ROOT,
    "suites/behavioral/implement-stateful-workflows-executable.yaml",
  ),
  "utf8",
), {
  schema: "core",
  strict: true,
  uniqueKeys: true,
  version: "1.2",
}).toJS({ maxAliasCount: 0 }) as { cases: unknown[] };
const executableControls: Record<string, { valid: string; knownBad: string }> = {
  "executable-reservation-transition": {
    valid: "reservation-service-valid.mjs",
    knownBad: "reservation-service-known-bad.mjs",
  },
  "executable-custody-transfer": {
    valid: "custody-transfer-service-valid.mjs",
    knownBad: "custody-transfer-service-known-bad.mjs",
  },
  "executable-state-outbox-recovery": {
    valid: "shipment-readiness-service-valid.mjs",
    knownBad: "shipment-readiness-service-known-bad.mjs",
  },
  "executable-async-guard-freshness": {
    valid: "async-guard-service-valid.mjs",
    knownBad: "async-guard-service-known-bad.mjs",
  },
};

describe("stateful workflow artifact suite", () => {
  for (const input of suite.cases) {
    const seam = BehavioralSeamCaseSchema.parse(input);
    it(`${seam.id} accepts a valid alternative and rejects a known-bad control`, () => {
      const control = controls[seam.id];
      expect(control).toBeDefined();
      expect(seam.artifact).toBeDefined();
      const assertions = seam.artifact?.assertions ?? [];
      const validResults = assertions.map((assertion) =>
        evaluateBehavioralArtifactAssertion(control!.validAlternative, assertion));
      const badResults = assertions.map((assertion) =>
        evaluateBehavioralArtifactAssertion(control!.knownBad, assertion));

      expect(validResults.every(({ passed }) => passed)).toBe(true);
      expect(badResults.filter(({ passed }) => !passed).length)
        .toBeGreaterThanOrEqual(Math.ceil(assertions.length / 3));
    });
  }

  for (const input of executableSuite.cases) {
    const seam = BehavioralSeamCaseSchema.parse(input);
    it.runIf(process.platform === "darwin")(
      `${seam.id} accepts a working executable control and rejects a broken one`,
      async () => {
      const artifact = seam.artifact;
      if (artifact?.probe === undefined) throw new Error("Executable suite lacks its probe.");
      const probe = artifact.probe;
      const control = executableControls[seam.id];
      if (control === undefined) throw new Error(`Executable controls missing for ${seam.id}.`);
      const roots = await Promise.all([
        mkdtemp(resolve(tmpdir(), "seedspec-valid-control-")),
        mkdtemp(resolve(tmpdir(), "seedspec-bad-control-")),
      ]);
      try {
        await Promise.all([
          cp(
            resolve(
              REPOSITORY_ROOT,
              "suites/behavioral/controls",
              control.valid,
            ),
            resolve(roots[0], artifact.path),
          ),
          cp(
            resolve(
              REPOSITORY_ROOT,
              "suites/behavioral/controls",
              control.knownBad,
            ),
            resolve(roots[1], artifact.path),
          ),
        ]);
        const [valid, knownBad] = await Promise.all([
          runBehavioralArtifactProbe(roots[0], artifact.path, probe),
          runBehavioralArtifactProbe(roots[1], artifact.path, probe),
        ]);

        expect(valid.every(({ passed }) => passed)).toBe(true);
        expect(knownBad.filter(({ passed }) => !passed).length).toBeGreaterThanOrEqual(4);
      } finally {
        await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
      }
      },
    );
  }
});
