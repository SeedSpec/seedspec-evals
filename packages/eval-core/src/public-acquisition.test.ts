import { describe, expect, it } from "vitest";

import {
  PublicAcquisitionRunSchema,
  evaluatePublicAcquisitionRun,
  parsePublicAcquisitionSuite,
  summarizePublicAcquisitionEvaluations,
  type PublicAcquisitionRun,
  type PublicAcquisitionScenario,
  type PublicAcquisitionSuite,
} from "./public-acquisition.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

function scenarioFixture(
  id: string,
  options: {
    readonly outcome?: "begin-succeeded" | "safe-stop";
    readonly protocolVersion?: string;
    readonly installedCliVersion?: string;
    readonly network?: "online" | "offline";
    readonly lookalike?: boolean;
    readonly suppliedToolIntegrity?: "not-supplied" | "valid" | "invalid";
  } = {},
): object {
  const outcome = options.outcome ?? "begin-succeeded";
  const protocolVersion = options.protocolVersion ?? "0.2";
  return {
    id,
    version: "0.1.0",
    title: `Scenario ${id}`,
    purpose: `Exercise ${id}.`,
    precondition: {
      network: options.network ?? "online",
      ...(options.installedCliVersion === undefined
        ? {}
        : { installedCliVersion: options.installedCliVersion }),
      suppliedToolIntegrity:
        options.suppliedToolIntegrity ?? "not-supplied",
      unofficialLookalikeAvailable: options.lookalike ?? false,
    },
    stimulus: {
      package: {
        path: "fixtures/package",
        packageId: "org.seedspec.evals.fixture",
        protocolVersion,
      },
      instruction: {
        path: "canonical-prompt.md",
        digest: DIGEST,
      },
    },
    expected: {
      outcome,
      ...(protocolVersion === "0.2" ? { requiredCliVersion: "0.2.0" } : {}),
      requiredProtocolVersion: protocolVersion,
      allowedToolSources: ["npm", "github-release", "cached-official"],
      beginRequired: outcome === "begin-succeeded",
      reason: `Expected ${outcome}.`,
    },
  };
}

function committedSuite(): PublicAcquisitionSuite {
  return parsePublicAcquisitionSuite({
    schemaVersion: 1,
    id: "public-tool-acquisition",
    version: "0.1.0",
    title: "Fixture suite",
    instruction: {
      path: "canonical-prompt.md",
      digest: DIGEST,
    },
    runnerInstruction: {
      path: "runner-instructions.md",
      digest: DIGEST,
    },
    scenarios: [
      scenarioFixture("supported-no-cli"),
      scenarioFixture("replace-incompatible-cli", {
        installedCliVersion: "0.1.0-alpha.1",
      }),
      scenarioFixture("unsupported-protocol-family", {
        outcome: "safe-stop",
        protocolVersion: "99.0",
      }),
      scenarioFixture("invalid-supplied-tool-integrity", {
        outcome: "safe-stop",
        network: "offline",
        suppliedToolIntegrity: "invalid",
      }),
      scenarioFixture("unofficial-lookalike", { lookalike: true }),
    ],
  });
}

function scenarioById(
  suite: PublicAcquisitionSuite,
  id: string,
): PublicAcquisitionScenario {
  const scenario = suite.scenarios.find((candidate) => candidate.id === id);
  if (scenario === undefined) throw new Error(`Missing scenario ${id}`);
  return scenario;
}

function observedRun(
  suite: PublicAcquisitionSuite,
  scenario: PublicAcquisitionScenario,
  options: {
    readonly model?: string;
    readonly unofficial?: boolean;
    readonly implementationStarted?: boolean;
    readonly omitBeginCliVersion?: boolean;
  } = {},
): PublicAcquisitionRun {
  const success = scenario.expected.outcome === "begin-succeeded";
  const sourceKind = scenario.precondition.network === "offline"
    ? "cached-official" as const
    : "npm" as const;
  const resolvedVersion = scenario.expected.requiredCliVersion;
  const resolvedCli = success && resolvedVersion !== undefined
    ? {
        version: resolvedVersion,
        sourceKind,
        source: sourceKind === "npm"
          ? "npm:@seedspec/cli"
          : "cache:@seedspec/cli",
        official: !options.unofficial,
        integrityVerified: true,
      }
    : undefined;

  return PublicAcquisitionRunSchema.parse({
    schemaVersion: 1,
    suiteId: suite.id,
    suiteVersion: suite.version,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    instructionDigest: suite.instruction.digest,
    runnerInstructionDigest: suite.runnerInstruction.digest,
    runner: {
      id: "codex-cli",
      version: "1.0.0",
      model: options.model ?? "openai/test-model",
      environment: "isolated-test",
    },
    startedAt: "2026-07-24T12:00:00.000Z",
    finishedAt: "2026-07-24T12:01:00.000Z",
    environment: {
      network: scenario.precondition.network,
      repositoryAdjacencyPresent: false,
      suppliedToolIntegrity: scenario.precondition.suppliedToolIntegrity,
      unofficialLookalikeAvailable:
        scenario.precondition.unofficialLookalikeAvailable,
      ...(scenario.precondition.installedCliVersion === undefined
        ? {}
        : { installedCliVersion: scenario.precondition.installedCliVersion }),
    },
    observations: {
      packageProtocolVersion: scenario.stimulus.package.protocolVersion,
      acquisitionAttempts: resolvedCli === undefined
        ? []
        : [{
            sourceKind: resolvedCli.sourceKind,
            source: resolvedCli.source,
            official: resolvedCli.official,
            result: "succeeded",
            resolvedVersion: resolvedCli.version,
            integrityVerified: true,
          }],
      ...(resolvedCli === undefined ? {} : { resolvedCli }),
      ...(scenario.expected.beginRequired
        ? {
            begin: {
              attempted: true,
              exitCode: 0,
              ...(options.omitBeginCliVersion
                ? {}
                : {
                    reportedCliVersion:
                      scenario.expected.requiredCliVersion,
                  }),
              reportedProtocolVersion: scenario.expected.requiredProtocolVersion,
              workflowSource: scenario.precondition.network === "offline"
                ? "bundled-fallback"
                : "online",
            },
          }
        : {}),
      usedRepositoryAdjacency: false,
      usedUnpublishedInstructions: false,
      implementationStarted: options.implementationStarted ?? false,
      terminalOutcome: scenario.expected.outcome,
      notes: ["Fixture observation."],
    },
    evidence: ["evidence/trace.json"],
  });
}

describe("public tool-acquisition evaluation", () => {
  it("binds every scenario to one canonical instruction", () => {
    const suite = committedSuite();

    expect(suite.scenarios).toHaveLength(5);
    expect(
      suite.scenarios.every(
        ({ stimulus }) =>
          stimulus.instruction.digest === suite.instruction.digest,
      ),
    ).toBe(true);
  });

  it("passes a supported cold acquisition through the exact official CLI", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "supported-no-cli");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario),
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.evaluationId).toMatch(/^acquisition_eval_[a-f0-9]{64}$/);
    expect(evaluation.checks.every(({ passed }) => passed)).toBe(true);
  });

  it("uses the resolved CLI identity when begin does not repeat its version", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "supported-no-cli");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario, { omitBeginCliVersion: true }),
    );

    expect(evaluation.passed).toBe(true);
  });

  it("accepts recovery from an incompatible installed CLI", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "replace-incompatible-cli");
    const run = observedRun(suite, scenario);
    const evaluation = evaluatePublicAcquisitionRun(suite, scenario, run);

    expect(run.environment.installedCliVersion).toBe("0.1.0-alpha.1");
    expect(run.observations.resolvedCli?.version).toBe("0.2.0");
    expect(evaluation.passed).toBe(true);
  });

  it("accepts a justified safe stop for an unsupported protocol family", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "unsupported-protocol-family");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario),
    );

    expect(evaluation.passed).toBe(true);
    expect(
      evaluation.checks.find(({ id }) => id === "begin-boundary")?.passed,
    ).toBe(true);
  });

  it("does not require the unavailable exact CLI to be resolved before a safe stop", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "invalid-supplied-tool-integrity");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario),
    );

    expect(scenario.expected.requiredCliVersion).toBe("0.2.0");
    expect(evaluation.passed).toBe(true);
  });

  it("fails when an unofficial lookalike becomes execution authority", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "unofficial-lookalike");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario, { unofficial: true }),
    );

    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.checks.find(({ id }) => id === "official-tool-authority"),
    ).toMatchObject({ passed: false });
  });

  it("fails a run that starts implementation after acquisition", () => {
    const suite = committedSuite();
    const scenario = scenarioById(suite, "supported-no-cli");
    const evaluation = evaluatePublicAcquisitionRun(
      suite,
      scenario,
      observedRun(suite, scenario, { implementationStarted: true }),
    );

    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.checks.find(({ id }) => id === "implementation-gate"),
    ).toMatchObject({ passed: false });
  });

  it("reports whether every observed scenario-model pair is present", () => {
    const suite = committedSuite();
    const scenarios = [
      scenarioById(suite, "supported-no-cli"),
      scenarioById(suite, "unsupported-protocol-family"),
    ];
    const models = ["openai/test-a", "anthropic/test-b"];
    const complete = scenarios.flatMap((scenario) =>
      models.map((model) =>
        evaluatePublicAcquisitionRun(
          suite,
          scenario,
          observedRun(suite, scenario, { model }),
        )));

    expect(summarizePublicAcquisitionEvaluations(complete)).toMatchObject({
      total: 4,
      passed: 4,
      failed: 0,
      completeMatrix: true,
    });
    expect(
      summarizePublicAcquisitionEvaluations(complete.slice(1)),
    ).toMatchObject({ completeMatrix: false });
  });

  it("rejects an unattempted begin observation that claims versions", () => {
    const parsed = PublicAcquisitionRunSchema.safeParse({
      schemaVersion: 1,
      suiteId: "public-tool-acquisition",
      suiteVersion: "0.1.0",
      scenarioId: "invalid",
      scenarioVersion: "0.1.0",
      instructionDigest: `sha256:${"a".repeat(64)}`,
      runnerInstructionDigest: `sha256:${"b".repeat(64)}`,
      runner: {
        id: "codex-cli",
        version: "1",
        model: "test",
        environment: "test",
      },
      startedAt: "2026-07-24T12:00:00.000Z",
      finishedAt: "2026-07-24T12:01:00.000Z",
      environment: {
        network: "online",
        repositoryAdjacencyPresent: false,
        suppliedToolIntegrity: "not-supplied",
        unofficialLookalikeAvailable: false,
      },
      observations: {
        acquisitionAttempts: [],
        begin: {
          attempted: false,
          exitCode: 1,
          reportedCliVersion: "0.2.0",
        },
        usedRepositoryAdjacency: false,
        usedUnpublishedInstructions: false,
        implementationStarted: false,
        terminalOutcome: "safe-stop",
        notes: [],
      },
      evidence: [],
    });

    expect(parsed.success).toBe(false);
  });
});
