import type { WorkspaceLike } from "@cloudflare/think";
import type { EvaluationStage, EvaluationVariant } from "@seedspec/eval-core";
import seedSpecManifestSchema from "@seedspec/protocol/schemas/v0.3/seedspec.schema.json" with { type: "json" };
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { tool, type ToolSet } from "ai";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { FROZEN_PROTOCOL_SNAPSHOT } from "./protocol-snapshot.generated.js";

const PROTOCOL_VERSION = "0.3";
const PROTOCOL_PACKAGE_VERSION = FROZEN_PROTOCOL_SNAPSHOT.version;
const TOOL_FORMAT_VERSION = "0.2.0";
const KINDS = ["solution", "application", "feature", "workflow", "automation", "configuration", "integration"] as const;
const AREAS = [
  "concern-separation",
  "kind-aware-discovery",
  "material-ambiguity",
  "decision-provenance",
  "internal-consistency",
  "progressive-hardening",
  "agent-ready-handoff",
] as const;

type Diagnostic = { code: string; path: string; message: string };
type Reference = { label: string; path: string; expected: "file" | "exists" };
export type PortablePackageDigest =
  | {
      ok: true;
      algorithm: "seedspec-package-sha256-v1";
      digest: string;
      fileCount: number;
      files: Array<{ path: string; digest: string; size: number }>;
    }
  | {
      ok: false;
      code: "SYMLINK_NOT_PORTABLE" | "PATH_NOT_PORTABLE" | "PATH_OUTSIDE_ROOT" | "PATH_CASE_COLLISION";
      paths: string[];
    };
type ValidationResult = {
  ok: boolean;
  check: string;
  toolFormatVersion: string;
  protocolVersion: string;
  canonicalManifestSchema: { package: string; version: string; revision: string; schemaId: string };
  packageValidationAdapter: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  next: string[];
};

const RootSchema = z.string().max(500).default(".").refine(isSafeRoot, "root must be a safe relative workspace path");
const protocolAjv = createAjv();
const validateCanonicalManifest = protocolAjv.compile<Record<string, unknown>>(seedSpecManifestSchema);

const KIND_LENSES: Record<string, readonly string[]> = {
  solution: ["compound outcome and boundary", "participants, dependencies, and authority", "coordination and failure behavior", "evidence the overall outcome works"],
  application: ["actors and permissions", "domain rules and lifecycle", "primary and exceptional workflows", "failure and recovery", "observable product success"],
  feature: ["host boundary", "behavior added or changed", "capabilities and integration expectations", "host-safe failure", "host-independent acceptance"],
  workflow: ["participants and authority", "stages, decisions, and handoffs", "information passed", "retry, compensation, escalation, and duplicates", "completion evidence"],
  automation: ["trigger, cadence, and timezone", "allowed side effects", "idempotency and replay", "monitoring and recovery", "per-run evidence"],
  configuration: ["desired-state boundary", "existing-state discovery", "safe reruns and drift", "rollback and partial recovery", "durable verification"],
  integration: ["participating systems and outcome", "concept and field mappings", "authority, direction, ordering, and reconciliation", "credential boundaries", "partial failure and verification"],
};

export function createSeedSpecTools(
  workspace: WorkspaceLike,
  stage: EvaluationStage,
  variant: EvaluationVariant,
): ToolSet {
  if (["raw-source", "markdown-authored"].includes(variant)) return {};
  const shared = {
    seedspec_package_check: tool({
      description: "Validate a SeedSpec 0.3 package in the Think workspace using the canonical @seedspec/protocol manifest schema plus package references, semantics, configuration, resources, and digest checks.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => checkPackage(workspace, root),
    }),
    seedspec_package_digest: tool({
      description: "Compute the portable SeedSpec package digest from workspace files using the canonical path-and-file-digest algorithm.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => digestPackage(workspace, root),
    }),
  };
  if (stage === "implementation" || variant === "seedspec-minimal") return shared;
  return {
    ...shared,
    seedspec_kind_lint: tool({
      description: "Return kind-aware deterministic and semantic review prompts for the package. Kind is a steering hint, not a validity discriminator.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => kindLint(workspace, root),
    }),
    seedspec_audit_guidance: tool({
      description: "Return current, versioned SeedSpec authoring instructions for one of the seven audit areas.",
      inputSchema: z.strictObject({
        area: z.enum(AREAS),
        kind: z.union([z.enum(KINDS), z.string().min(1).max(160)]),
        target: z.enum(["capture", "shape", "harden", "compose", "package"]).default("shape"),
      }),
      execute: ({ area, kind, target }) => auditGuidance(area, kind, target),
    }),
  };
}

export function seedSpecToolNamesForVariant(
  stage: EvaluationStage,
  variant: EvaluationVariant,
): string[] {
  if (["raw-source", "markdown-authored"].includes(variant)) return [];
  const shared = ["seedspec_package_check", "seedspec_package_digest"];
  return stage === "implementation" || variant === "seedspec-minimal"
    ? shared
    : [...shared, "seedspec_kind_lint", "seedspec_audit_guidance"];
}

export async function checkPackage(workspace: WorkspaceLike, root: string): Promise<unknown> {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const manifestPath = joinRoot(root, "seedspec.yaml");
  const source = await workspace.readFile(manifestPath);
  if (source === null) {
    return result(false, [{ code: "MANIFEST_MISSING", path: manifestPath, message: "seedspec.yaml was not found." }], warnings);
  }
  if (new TextEncoder().encode(source).byteLength > 256 * 1024) {
    return result(false, [{ code: "MANIFEST_TOO_LARGE", path: manifestPath, message: "seedspec.yaml exceeds 256 KiB." }], warnings);
  }
  let input: unknown;
  try {
    input = parseYaml(source);
  } catch {
    return result(false, [{ code: "MANIFEST_YAML_INVALID", path: manifestPath, message: "seedspec.yaml is not valid YAML." }], warnings);
  }
  if (!isRecord(input) || !validateCanonicalManifest(input)) {
    errors.push(...formatAjvErrors(validateCanonicalManifest.errors, manifestPath, "MANIFEST_SCHEMA_INVALID"));
    return result(false, errors, warnings);
  }
  const manifest = input;
  errors.push(...manifestSemanticErrors(manifest).map((message) => ({ code: "MANIFEST_SEMANTICS_INVALID", path: manifestPath, message })));
  const references = collectReferences(manifest);
  for (const reference of references) {
    if (!isSafePackagePath(reference.path)) {
      errors.push({ code: "PATH_NOT_PORTABLE", path: reference.path, message: `${reference.label} must be a normalized, portable, relative path.` });
      continue;
    }
    const stat = await workspace.stat(joinRoot(root, reference.path));
    if (stat === null) errors.push({ code: "REFERENCE_MISSING", path: reference.path, message: `${reference.label} does not exist.` });
    else if (reference.expected === "file" && stat.type !== "file") errors.push({ code: "REFERENCE_NOT_FILE", path: reference.path, message: `${reference.label} must reference a regular file.` });
  }
  errors.push(...await configurationErrors(workspace, root, manifest));
  errors.push(...await implementationResourceErrors(workspace, root, manifest));
  const kind = manifest["kind"];
  if (typeof kind === "string" && !KINDS.includes(kind as (typeof KINDS)[number])) {
    warnings.push({ code: "CUSTOM_KIND_GUIDANCE_LIMITED", path: "seedspec.yaml:kind", message: "The custom kind is valid as a hint, but bundled kind-aware guidance falls back to solution." });
  }
  const packageDigest = await digestPackage(workspace, root);
  if (!isRecord(packageDigest) || packageDigest["ok"] !== true) {
    const digestCode = isRecord(packageDigest) && typeof packageDigest["code"] === "string" ? packageDigest["code"] : "unknown";
    errors.push({ code: "PACKAGE_DIGEST_FAILED", path: root, message: `Package digest failed: ${digestCode}.` });
  }
  return {
    ...result(errors.length === 0, errors, warnings),
    manifest: { id: manifest["id"], version: manifest["version"], kind },
    referencedEntries: references.length,
    digest: packageDigest.ok ? packageDigest.digest : null,
  };
}

export async function digestPackage(workspace: WorkspaceLike, root: string): Promise<PortablePackageDigest> {
  const normalizedRoot = root === "." ? "." : root.replace(/\/+$/, "");
  const prefix = normalizedRoot === "." ? "" : `${normalizedRoot}/`;
  const entries = await workspace.glob(`${prefix}**/*`);
  const normalizedEntries = entries.map((entry) => ({
    entry,
    path: normalizeWorkspaceEntryPath(entry.path),
  }));
  const outsideRoot = prefix === ""
    ? []
    : normalizedEntries.filter(({ path }) => path !== normalizedRoot && !path.startsWith(prefix));
  if (outsideRoot.length > 0) {
    return {
      ok: false,
      code: "PATH_OUTSIDE_ROOT",
      paths: outsideRoot.map(({ entry }) => entry.path).sort(),
    };
  }
  const files = normalizedEntries.filter(({ entry }) => entry.type === "file");
  const unsupported = normalizedEntries.filter(({ entry }) => entry.type === "symlink");
  if (unsupported.length > 0) {
    return {
      ok: false,
      code: "SYMLINK_NOT_PORTABLE",
      paths: unsupported.map(({ path }) => path).sort(),
    };
  }
  const relative = files.map(({ entry, path }) => ({
    entry,
    path: prefix === "" ? path : path.slice(prefix.length),
  }));
  const invalid = relative.filter(({ path }) => !isSafePackagePath(path));
  if (invalid.length > 0) return { ok: false, code: "PATH_NOT_PORTABLE", paths: invalid.map(({ path }) => path).sort() };
  const collisions = findCaseCollisions(relative.map(({ path }) => path));
  if (collisions.length > 0) return { ok: false, code: "PATH_CASE_COLLISION", paths: collisions };
  relative.sort((left, right) => compareUtf8(left.path, right.path));
  const records: Array<{ path: string; digest: string; size: number }> = [];
  let packageInput = "";
  for (const file of relative) {
    const bytes = await workspace.readFileBytes(file.entry.path);
    if (bytes === null) throw new Error(`Workspace file disappeared during digest: ${file.entry.path}`);
    const digest = await sha256Bytes(bytes);
    records.push({ path: file.path, digest: `sha256:${digest}`, size: bytes.byteLength });
    packageInput += `${file.path}\0${digest}\n`;
  }
  return { ok: true, algorithm: "seedspec-package-sha256-v1", digest: `sha256:${await sha256Bytes(new TextEncoder().encode(packageInput))}`, fileCount: records.length, files: records };
}

async function kindLint(workspace: WorkspaceLike, root: string): Promise<unknown> {
  const source = await workspace.readFile(joinRoot(root, "seedspec.yaml"));
  if (source === null) return { ok: false, diagnostics: [{ code: "MANIFEST_MISSING", severity: "error", message: "seedspec.yaml was not found." }] };
  let manifest: unknown;
  try { manifest = parseYaml(source); }
  catch { return { ok: false, diagnostics: [{ code: "MANIFEST_INVALID", severity: "error", message: "The manifest must pass package validation before kind lint." }] }; }
  if (!isRecord(manifest) || !validateCanonicalManifest(manifest)) return { ok: false, diagnostics: [{ code: "MANIFEST_INVALID", severity: "error", message: "The manifest must pass package validation before kind lint." }] };
  const declaredKind = typeof manifest["kind"] === "string" ? manifest["kind"] : "solution";
  const kind = KINDS.includes(declaredKind as (typeof KINDS)[number]) ? declaredKind : "solution";
  return {
    ok: true,
    kind: declaredKind,
    effectiveLens: kind,
    diagnostics: [],
    review: (KIND_LENSES[kind] ?? KIND_LENSES["solution"]!).map((concern) => ({ concern, expectedAssessment: ["established", "unclear", "materially missing", "not material"] })),
    note: "No diagnostic is emitted merely because a topic is absent. The implementing agent must judge materiality from the package.",
  };
}

function auditGuidance(area: (typeof AREAS)[number], kind: string, target: string): unknown {
  const objectives: Record<(typeof AREAS)[number], readonly string[]> = {
    "concern-separation": ["Separate primary author intent, meaningful configuration, additions, implementation profiles, artifacts, implementation resources, future applied end-user intent, and scoped evidence.", "Give each material concern one canonical owner. Treat agent instructions as routing rather than a shadow specification, and report both duplicated authority and unnecessary fragmentation."],
    "kind-aware-discovery": (KIND_LENSES[kind] ?? KIND_LENSES["solution"]!).map((item) => `Assess ${item} as established, unclear, materially missing, or not material, citing package evidence.`),
    "material-ambiguity": ["Find wording with multiple plausible interpretations that materially change realization.", "Record competing interpretations, consequence, reversibility, and whether deferral is safe. Ask at most three related questions at once."],
    "decision-provenance": ["Inventory consequential decisions and classify critical, material, or minor materiality with evidence.", "Separate who proposed, selects, constrains, and implements each decision. Classify expected latitude as fixed, preferred, delegated, open, or unresolved; greater author control is not inherently better.", "Treat reference decisions as normative, preferred, or illustrative only when evidence establishes that influence. Preserve mixed and unknown attribution."],
    "internal-consistency": ["Run deterministic checks first, then cite both sides of semantic contradictions.", "Check objectives, obligations, forbidden states, configuration effects, profile authority, terminology, capability contracts, and the evidence claimed for each success scope."],
    "progressive-hardening": [`Review only to the requested ${target} depth.`, "Report material gaps, intentional omissions, and blockers separately. Do not manufacture scope or enterprise requirements."],
    "agent-ready-handoff": ["Read the package as an implementing agent without the authoring conversation.", "Identify facts it would guess, authority that could be misread, buried material, unjustified prescription, and success claims that cannot be observed."],
  };
  return {
    instructionFormat: "0.1",
    toolFormatVersion: TOOL_FORMAT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    area,
    sequence: { index: AREAS.indexOf(area) + 1, total: AREAS.length, all: AREAS },
    kind,
    target,
    operatingContract: [
      "Inspect package sources before proposing changes; do not invent details to make the package look mature.",
      "Keep speculative work out of the distributable package until the author confirms it.",
      "Ask only questions that materially change behavior, authority, data treatment, accounting, portability, or observable success.",
      "Use package validation, kind lint, and digest before claiming the pass is complete; record exact tool and protocol-package versions.",
    ],
    objectives: objectives[area],
  };
}

function result(ok: boolean, errors: Diagnostic[], warnings: Diagnostic[]): ValidationResult {
  return {
    ok,
    check: "seedspec-think-workspace-validator",
    toolFormatVersion: TOOL_FORMAT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    canonicalManifestSchema: {
      package: "@seedspec/protocol",
      version: PROTOCOL_PACKAGE_VERSION,
      revision: FROZEN_PROTOCOL_SNAPSHOT.sourceDigest,
      schemaId: seedSpecManifestSchema.$id,
    },
    packageValidationAdapter: "think-workspace",
    errors,
    warnings,
    next: ok ? ["Use kind lint and the authoring audit as appropriate; run the portable digest before recording completion."] : ["Correct deterministic validation errors, then rerun this tool."],
  };
}

function collectReferences(manifest: Record<string, unknown>): Reference[] {
  const configuration = asRecord(manifest["configuration"]);
  const references: Reference[] = [
    { label: "configuration.schema", path: String(configuration["schema"]), expected: "file" },
    { label: "configuration.example", path: String(configuration["example"]), expected: "file" },
  ];
  if (typeof configuration["guide"] === "string") references.push({ label: "configuration.guide", path: configuration["guide"], expected: "file" });
  const components = asRecord(manifest["components"]);
  for (const [name, value] of Object.entries(components)) if (typeof value === "string") references.push({ label: `components.${name}`, path: value, expected: "exists" });
  const profiles = asRecordArray(manifest["implementation_profiles"]);
  for (const profile of profiles) {
    const guidance = profile["guidance"];
    if (typeof guidance === "string") references.push({ label: `implementation_profiles.${String(profile["id"])}.guidance`, path: guidance, expected: "file" });
  }
  for (const capability of asRecordArray(asRecord(manifest["provides"])["capabilities"])) {
    if (typeof capability["contract"] === "string") references.push({ label: `provides.capabilities.${String(capability["id"])}.contract`, path: capability["contract"], expected: "file" });
  }
  const artifacts = asRecordArray(manifest["artifacts"]);
  for (const artifact of artifacts) {
    const path = artifact["path"];
    if (typeof path === "string") references.push({ label: `artifacts.${String(artifact["id"])}.path`, path, expected: "exists" });
  }
  const resources = asRecordArray(asRecord(manifest["implementation_resources"])["resources"]);
  for (const module of asRecordArray(asRecord(manifest["context"])["modules"])) {
    const source = asRecord(module["source"]);
    const entrypoint = String(module["entrypoint"]);
    const moduleId = String(module["id"]);
    if (source["kind"] === "package" && typeof source["path"] === "string") {
      references.push({ label: `context.modules.${moduleId}.source.path`, path: source["path"], expected: "exists" });
      if (!source["path"].endsWith(`/${entrypoint}`) && source["path"] !== entrypoint) {
        references.push({ label: `context.modules.${moduleId}.entrypoint`, path: joinPath(source["path"], entrypoint), expected: "file" });
      }
    } else if (source["kind"] === "artifact") {
      const artifact = artifacts.find((candidate) => candidate["id"] === source["id"]);
      if (typeof artifact?.["path"] === "string") {
        references.push({ label: `context.modules.${moduleId}.entrypoint`, path: moduleEntrypointPath(artifact["path"], entrypoint), expected: "file" });
      }
    } else if (source["kind"] === "resource") {
      const resource = resources.find((candidate) => candidate["id"] === source["id"]);
      const bundled = asRecord(resource?.["bundled"]);
      if (typeof bundled["path"] === "string") {
        references.push({ label: `context.modules.${moduleId}.entrypoint`, path: joinPath(bundled["path"], entrypoint), expected: "file" });
      }
    }
  }
  return references.toSorted((left, right) => compareUtf8(left.path, right.path));
}

async function configurationErrors(workspace: WorkspaceLike, root: string, manifest: Record<string, unknown>): Promise<Diagnostic[]> {
  const errors: Diagnostic[] = [];
  const configuration = asRecord(manifest["configuration"]);
  const schemaPath = String(configuration["schema"]);
  const examplePath = String(configuration["example"]);
  const schemaSource = await workspace.readFile(joinRoot(root, schemaPath));
  const exampleSource = await workspace.readFile(joinRoot(root, examplePath));
  if (schemaSource === null || exampleSource === null) return errors;
  let configurationSchema: unknown;
  try { configurationSchema = JSON.parse(schemaSource) as unknown; }
  catch { return [{ code: "CONFIGURATION_SCHEMA_INVALID", path: schemaPath, message: "The configuration schema must be valid JSON." }]; }
  if (!isRecord(configurationSchema)) return [{ code: "CONFIGURATION_SCHEMA_INVALID", path: schemaPath, message: "The configuration schema must be a JSON object." }];
  let validateConfiguration;
  try { validateConfiguration = createAjv().compile(configurationSchema); }
  catch (error) { return [{ code: "CONFIGURATION_SCHEMA_INVALID", path: schemaPath, message: error instanceof Error ? error.message : "The configuration schema could not be compiled." }]; }
  let example: unknown;
  try { example = parseYaml(exampleSource); }
  catch { return [{ code: "CONFIGURATION_EXAMPLE_INVALID", path: examplePath, message: "The example configuration is not valid YAML." }]; }
  if (!isRecord(example)) return [{ code: "CONFIGURATION_EXAMPLE_INVALID", path: examplePath, message: "The example configuration must be a YAML mapping." }];
  if (!validateConfiguration(example)) errors.push(...formatAjvErrors(validateConfiguration.errors, examplePath, "CONFIGURATION_EXAMPLE_INVALID"));
  return errors;
}

function manifestSemanticErrors(manifest: Record<string, unknown>): string[] {
  const details: string[] = [];
  const required = asRecordArray(asRecord(manifest["requires"])["capabilities"]);
  const provided = asRecordArray(asRecord(manifest["provides"])["capabilities"]);
  for (const id of duplicateIds(required)) details.push(`requires.capabilities repeats ${id}`);
  for (const id of duplicateIds(provided)) details.push(`provides.capabilities repeats ${id}`);
  for (const id of duplicateIds(asRecordArray(manifest["decisions"]))) details.push(`decisions repeats ${id}`);

  const resources = asRecordArray(asRecord(manifest["implementation_resources"])["resources"]);
  const resourceIds = new Set(resources.map((resource) => String(resource["id"])));
  const profiles = asRecordArray(manifest["implementation_profiles"]);
  for (const id of duplicateIds(profiles)) details.push(`implementation_profiles repeats ${id}`);
  for (const profile of profiles) {
    const profileId = String(profile["id"]);
    const conditions = [...asRecordArray(profile["prerequisites"]), ...asRecordArray(profile["blockers"])];
    for (const id of duplicateIds(conditions)) details.push(`implementation_profiles.${profileId} repeats condition ${id}`);
    for (const resourceId of stringArray(profile["implementation_resources"])) {
      if (!resourceIds.has(resourceId)) details.push(`implementation_profiles.${profileId} references unknown implementation resource ${resourceId}`);
    }
  }

  const artifacts = asRecordArray(manifest["artifacts"]);
  const artifactIds = new Set(artifacts.map((artifact) => String(artifact["id"])));
  for (const id of duplicateIds(artifacts)) details.push(`artifacts repeats ${id}`);
  for (const relationship of asRecordArray(manifest["relationships"])) {
    const from = String(relationship["from"]);
    const to = String(relationship["to"]);
    if (!artifactIds.has(from)) details.push(`relationships references unknown source artifact ${from}`);
    if (!artifactIds.has(to)) details.push(`relationships references unknown target artifact ${to}`);
  }

  const modules = asRecordArray(asRecord(manifest["context"])["modules"]);
  const moduleIds = new Set(modules.map((module) => String(module["id"])));
  for (const id of duplicateIds(modules)) details.push(`context.modules repeats ${id}`);
  const primaryModule = asRecord(manifest["definition"])["module"];
  if (!moduleIds.has(String(primaryModule))) details.push(`definition.module references unknown context module ${String(primaryModule)}`);
  for (const module of modules) {
    const source = asRecord(module["source"]);
    if (source["kind"] === "artifact" && !artifactIds.has(String(source["id"]))) {
      details.push(`context module ${String(module["id"])} references unknown artifact ${String(source["id"])}`);
    }
    if (source["kind"] === "resource" && !resourceIds.has(String(source["id"]))) {
      details.push(`context module ${String(module["id"])} references unknown implementation resource ${String(source["id"])}`);
    }
    for (const bridge of asRecordArray(module["bridges"])) {
      if (!moduleIds.has(String(bridge["skill"]))) {
        details.push(`context module ${String(module["id"])} references unknown bridge Skill ${String(bridge["skill"])}`);
      }
    }
  }

  const conflicts = asRecord(manifest["conflicts"]);
  const packageConflicts = asRecordArray(conflicts["packages"]);
  if (packageConflicts.some((conflict) => conflict["id"] === manifest["id"])) details.push("a package cannot conflict with itself");
  for (const id of duplicateIds(packageConflicts)) details.push(`conflicts.packages repeats ${id}`);
  for (const id of duplicateIds(asRecordArray(conflicts["capabilities"]))) details.push(`conflicts.capabilities repeats ${id}`);
  return [...new Set(details)];
}

function joinPath(root: string, entrypoint: string): string {
  return `${root.replace(/\/$/u, "")}/${entrypoint}`;
}

function moduleEntrypointPath(sourcePath: string, entrypoint: string): string {
  return sourcePath.endsWith(`/${entrypoint}`) || sourcePath === entrypoint
    ? sourcePath
    : joinPath(sourcePath, entrypoint);
}

async function implementationResourceErrors(workspace: WorkspaceLike, root: string, manifest: Record<string, unknown>): Promise<Diagnostic[]> {
  const declaration = asRecord(manifest["implementation_resources"]);
  if (Object.keys(declaration).length === 0) return [];
  const errors: Diagnostic[] = [];
  const resources = asRecordArray(declaration["resources"]);
  const catalogs = asRecordArray(declaration["catalogs"]);
  for (const id of duplicateIds(resources)) errors.push({ code: "IMPLEMENTATION_RESOURCE_INVALID", path: "seedspec.yaml:implementation_resources.resources", message: `Resource ID repeats: ${id}.` });
  for (const id of duplicateIds(catalogs)) errors.push({ code: "IMPLEMENTATION_RESOURCE_INVALID", path: "seedspec.yaml:implementation_resources.catalogs", message: `Catalog ID repeats: ${id}.` });
  if (declaration["additional_guidance"] === "none" && catalogs.length > 0) errors.push({ code: "IMPLEMENTATION_RESOURCE_INVALID", path: "seedspec.yaml:implementation_resources", message: "Catalogs require additional_guidance: agent-delegated." });
  for (const catalog of catalogs) {
    const url = catalog["url"];
    if (typeof url === "string" && !isSafeHttpsUrl(url)) errors.push({ code: "IMPLEMENTATION_RESOURCE_URL_INVALID", path: `seedspec.yaml:implementation_resources.catalogs.${String(catalog["id"])}`, message: "Catalog URLs must use public HTTPS endpoints." });
  }
  for (const resource of resources) {
    const id = String(resource["id"]);
    const canonical = asRecord(resource["canonical"]);
    if (typeof canonical["manifest_url"] === "string" && !isSafeHttpsUrl(canonical["manifest_url"])) errors.push({ code: "IMPLEMENTATION_RESOURCE_URL_INVALID", path: `seedspec.yaml:implementation_resources.resources.${id}.canonical`, message: "Canonical manifest URLs must use public HTTPS endpoints." });
    const bundled = asRecord(resource["bundled"]);
    if (Object.keys(bundled).length === 0) continue;
    const bundlePath = String(bundled["path"]).replace(/\/+$/, "");
    const bundleStat = await workspace.stat(joinRoot(root, bundlePath));
    if (bundleStat === null || bundleStat.type !== "directory") {
      errors.push({ code: "IMPLEMENTATION_RESOURCE_BUNDLE_INVALID", path: bundlePath, message: `Bundled resource ${id} must reference a directory.` });
      continue;
    }
    if (bundled["compatibility"] === "exact" && bundled["version"] !== resource["version"]) errors.push({ code: "IMPLEMENTATION_RESOURCE_BUNDLE_INVALID", path: bundlePath, message: `Bundled resource ${id} declares exact compatibility with a different version.` });
    const entrypoint = String(resource["entrypoint"]);
    const entrypointPath = joinRoot(joinRoot(root, bundlePath), entrypoint);
    const entrypointStat = await workspace.stat(entrypointPath);
    if (entrypointStat === null || entrypointStat.type !== "file") errors.push({ code: "IMPLEMENTATION_RESOURCE_BUNDLE_INVALID", path: entrypointPath, message: `Bundled resource ${id} entrypoint must reference a file.` });
    else if (resource["kind"] === "skill") {
      if (entrypoint.split("/").at(-1) !== "SKILL.md") errors.push({ code: "IMPLEMENTATION_RESOURCE_SKILL_INVALID", path: entrypointPath, message: `Skill resource ${id} entrypoint must be named SKILL.md.` });
      const skillSource = await workspace.readFile(entrypointPath);
      if (skillSource !== null && !hasValidSkillFrontmatter(skillSource)) errors.push({ code: "IMPLEMENTATION_RESOURCE_SKILL_INVALID", path: entrypointPath, message: `Skill resource ${id} requires YAML frontmatter with non-empty name and description.` });
    }
    const digest = await digestPackage(workspace, joinRoot(root, bundlePath));
    const actualDigest = digest.ok ? digest.digest : null;
    if (actualDigest !== bundled["digest"]) errors.push({ code: "IMPLEMENTATION_RESOURCE_DIGEST_MISMATCH", path: bundlePath, message: `Bundled resource ${id} digest does not match its contents.` });
  }
  return errors;
}

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat("uri", { type: "string", validate: isAbsoluteUri });
  return ajv;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined, path: string, code: string): Diagnostic[] {
  return (errors ?? []).map((error) => ({
    code,
    path: `${path}${error.instancePath || "/"}`,
    message: `${error.message ?? "schema validation failed"}${typeof error.params["additionalProperty"] === "string" ? ` (${error.params["additionalProperty"]})` : ""}`,
  }));
}

function duplicateIds(items: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const item of items) {
    const id = String(item["id"]);
    if (seen.has(id)) duplicate.add(id);
    seen.add(id);
  }
  return [...duplicate];
}

function hasValidSkillFrontmatter(source: string): boolean {
  if (!source.startsWith("---\n")) return false;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return false;
  try {
    const frontmatter: unknown = parseYaml(source.slice(4, end));
    return isRecord(frontmatter) && typeof frontmatter["name"] === "string" && frontmatter["name"].trim().length > 0 && typeof frontmatter["description"] === "string" && frontmatter["description"].trim().length > 0;
  } catch { return false; }
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") return false;
    return !/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host);
  } catch { return false; }
}

function isAbsoluteUri(value: string): boolean {
  try { return new URL(value).protocol.length > 1; }
  catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function asRecord(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function asRecordArray(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function isSafeRoot(root: string): boolean { return root === "." || isSafePackagePath(root); }
function isSafePackagePath(path: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/?$/.test(path) && !path.includes("\\") && !path.includes("\0"); }
function normalizeWorkspaceEntryPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
function joinRoot(root: string, path: string): string { const normalizedRoot = root === "." ? "." : root.replace(/\/+$/, ""); return normalizedRoot === "." ? path : `${normalizedRoot}/${path}`; }
function compareUtf8(left: string, right: string): number { const encoder = new TextEncoder(); const a = encoder.encode(left); const b = encoder.encode(right); for (let index = 0; index < Math.min(a.length, b.length); index += 1) { const delta = (a[index] ?? 0) - (b[index] ?? 0); if (delta !== 0) return delta; } return a.length - b.length; }
function findCaseCollisions(paths: string[]): string[] { const seen = new Map<string, string>(); const collisions = new Set<string>(); for (const path of paths) { const key = path.toLowerCase(); const previous = seen.get(key); if (previous !== undefined && previous !== path) { collisions.add(previous); collisions.add(path); } else seen.set(key, path); } return [...collisions].sort(); }
async function sha256Bytes(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
