import type { WorkspaceLike } from "@cloudflare/think";
import { tool, type ToolSet } from "ai";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const PROTOCOL_VERSION = "0.1";
const TOOL_FORMAT_VERSION = "0.1.0-alpha.1";
const KINDS = ["solution", "application", "feature", "workflow", "automation", "configuration", "integration"] as const;
const AREAS = [
  "concern-separation",
  "kind-aware-discovery",
  "material-ambiguity",
  "internal-consistency",
  "progressive-hardening",
  "agent-ready-handoff",
] as const;

const RootSchema = z.string().max(500).default(".").refine(isSafeRoot, "root must be a safe relative workspace path");
const ManifestSchema = z.object({
  protocol_version: z.literal(PROTOCOL_VERSION),
  id: z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9][a-z0-9-]*){2,}$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
  kind: z.union([z.enum(KINDS), z.string().regex(/^[a-z0-9]+(?:\.[a-z0-9][a-z0-9-]*){2,}$/)]),
  definition: z.object({ entrypoint: z.string().min(1) }),
  configuration: z.object({ schema: z.string().min(1), example: z.string().min(1), guide: z.string().min(1).optional() }),
  provides: z.object({ capabilities: z.array(z.unknown()) }),
}).passthrough();

const KIND_LENSES: Record<string, readonly string[]> = {
  solution: ["compound outcome and boundary", "participants, dependencies, and authority", "coordination and failure behavior", "evidence the overall outcome works"],
  application: ["actors and permissions", "domain rules and lifecycle", "primary and exceptional workflows", "failure and recovery", "observable product success"],
  feature: ["host boundary", "behavior added or changed", "capabilities and integration expectations", "host-safe failure", "host-independent acceptance"],
  workflow: ["participants and authority", "stages, decisions, and handoffs", "information passed", "retry, compensation, escalation, and duplicates", "completion evidence"],
  automation: ["trigger, cadence, and timezone", "allowed side effects", "idempotency and replay", "monitoring and recovery", "per-run evidence"],
  configuration: ["desired-state boundary", "existing-state discovery", "safe reruns and drift", "rollback and partial recovery", "durable verification"],
  integration: ["participating systems and outcome", "concept and field mappings", "authority, direction, ordering, and reconciliation", "credential boundaries", "partial failure and verification"],
};

export function createSeedSpecTools(workspace: WorkspaceLike, stage: "authorship" | "implementation"): ToolSet {
  const shared = {
    seedspec_package_check: tool({
      description: "Run a deterministic SeedSpec 0.1 workspace preflight: manifest shape, references, paths, and configuration parseability. This is not the canonical Node runtime validator.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => checkPackage(workspace, root),
    }),
    seedspec_package_digest: tool({
      description: "Compute the portable SeedSpec package digest from workspace files using the canonical path-and-file-digest algorithm.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => digestPackage(workspace, root),
    }),
  };
  if (stage === "implementation") return shared;
  return {
    ...shared,
    seedspec_kind_lint: tool({
      description: "Return kind-aware deterministic and semantic review prompts for the package. Kind is a steering hint, not a validity discriminator.",
      inputSchema: z.strictObject({ root: RootSchema }),
      execute: async ({ root }) => kindLint(workspace, root),
    }),
    seedspec_audit_guidance: tool({
      description: "Return current, versioned SeedSpec authoring instructions for one of the six audit areas.",
      inputSchema: z.strictObject({
        area: z.enum(AREAS),
        kind: z.union([z.enum(KINDS), z.string().min(1).max(160)]),
        target: z.enum(["capture", "shape", "harden", "compose", "package"]).default("shape"),
      }),
      execute: ({ area, kind, target }) => auditGuidance(area, kind, target),
    }),
  };
}

export async function checkPackage(workspace: WorkspaceLike, root: string): Promise<unknown> {
  const errors: Array<{ code: string; path: string; message: string }> = [];
  const warnings: Array<{ code: string; path: string; message: string }> = [];
  const manifestPath = joinRoot(root, "seedspec.yaml");
  const source = await workspace.readFile(manifestPath);
  if (source === null) {
    return result(false, [{ code: "MANIFEST_MISSING", path: manifestPath, message: "seedspec.yaml was not found." }], warnings);
  }
  let input: unknown;
  try {
    input = parseYaml(source);
  } catch {
    return result(false, [{ code: "MANIFEST_YAML_INVALID", path: manifestPath, message: "seedspec.yaml is not valid YAML." }], warnings);
  }
  const parsed = ManifestSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ code: "MANIFEST_SHAPE_INVALID", path: `${manifestPath}:${issue.path.join(".")}`, message: issue.message });
    }
    return result(false, errors, warnings);
  }
  const references = collectReferences(parsed.data);
  for (const reference of references) {
    if (!isSafePackagePath(reference)) {
      errors.push({ code: "PATH_NOT_PORTABLE", path: reference, message: "Referenced paths must be normalized, portable, relative paths." });
      continue;
    }
    const stat = await workspace.stat(joinRoot(root, reference));
    if (stat === null) errors.push({ code: "REFERENCE_MISSING", path: reference, message: "The referenced package file does not exist." });
    else if (stat.type !== "file") errors.push({ code: "REFERENCE_NOT_FILE", path: reference, message: "The referenced package entry is not a regular file." });
  }
  for (const configPath of [parsed.data.configuration.schema, parsed.data.configuration.example]) {
    const content = await workspace.readFile(joinRoot(root, configPath));
    if (content === null) continue;
    try { parseYamlOrJson(content, configPath); }
    catch { errors.push({ code: "CONFIG_DOCUMENT_INVALID", path: configPath, message: "The configuration document cannot be parsed as YAML or JSON." }); }
  }
  if (!KINDS.includes(parsed.data.kind as (typeof KINDS)[number])) {
    warnings.push({ code: "CUSTOM_KIND_GUIDANCE_LIMITED", path: "seedspec.yaml:kind", message: "The custom kind is valid as a hint, but bundled kind-aware guidance falls back to solution." });
  }
  return { ...result(errors.length === 0, errors, warnings), manifest: { id: parsed.data.id, version: parsed.data.version, kind: parsed.data.kind }, referencedFiles: references.length };
}

export async function digestPackage(workspace: WorkspaceLike, root: string): Promise<unknown> {
  const prefix = root === "." ? "" : `${root}/`;
  const entries = await workspace.glob(`${prefix}**/*`);
  const files = entries.filter((entry) => entry.type === "file");
  const unsupported = entries.filter((entry) => entry.type === "symlink");
  if (unsupported.length > 0) return { ok: false, code: "SYMLINK_NOT_PORTABLE", paths: unsupported.map((entry) => entry.path).sort() };
  const relative = files.map((entry) => ({ entry, path: prefix === "" ? entry.path : entry.path.slice(prefix.length) }));
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
  let manifest: z.infer<typeof ManifestSchema>;
  try { manifest = ManifestSchema.parse(parseYaml(source)); }
  catch { return { ok: false, diagnostics: [{ code: "MANIFEST_INVALID", severity: "error", message: "The manifest must pass package preflight before kind lint." }] }; }
  const kind = KINDS.includes(manifest.kind as (typeof KINDS)[number]) ? manifest.kind : "solution";
  return {
    ok: true,
    kind: manifest.kind,
    effectiveLens: kind,
    diagnostics: [],
    review: (KIND_LENSES[kind] ?? KIND_LENSES["solution"]!).map((concern) => ({ concern, expectedAssessment: ["established", "unclear", "materially missing", "not material"] })),
    note: "No diagnostic is emitted merely because a topic is absent. The implementing agent must judge materiality from the package.",
  };
}

function auditGuidance(area: (typeof AREAS)[number], kind: string, target: string): unknown {
  const objectives: Record<(typeof AREAS)[number], readonly string[]> = {
    "concern-separation": ["Separate portable core intent, meaningful configuration, additions, implementation profiles, artifacts, implementation resources, and observable acceptance.", "Flag technology in core intent and acceptance that prescribes architecture; ask when correct placement depends on author intent."],
    "kind-aware-discovery": (KIND_LENSES[kind] ?? KIND_LENSES["solution"]!).map((item) => `Assess ${item} as established, unclear, materially missing, or not material, citing package evidence.`),
    "material-ambiguity": ["Find wording with multiple plausible interpretations that materially change realization.", "Record competing interpretations, consequence, reversibility, and whether deferral is safe. Ask at most three related questions at once."],
    "internal-consistency": ["Run deterministic checks first, then cite both sides of semantic contradictions.", "Check permissions, state behavior, configuration effects, acceptance coverage, profile authority, terminology, and capability contracts."],
    "progressive-hardening": [`Review only to the requested ${target} depth.`, "Report material gaps, intentional omissions, and blockers separately. Do not manufacture scope or enterprise requirements."],
    "agent-ready-handoff": ["Read the package as an implementing agent without the authoring conversation.", "Identify facts it would guess, authority that could be misread, buried material, and acceptance that cannot be observed."],
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
      "Use package check, kind lint, and digest before claiming the pass is complete; record limitations of this workspace preflight.",
    ],
    objectives: objectives[area],
  };
}

function result(ok: boolean, errors: unknown[], warnings: unknown[]): { ok: boolean; check: string; toolFormatVersion: string; protocolVersion: string; canonicalRuntimeValidation: false; errors: unknown[]; warnings: unknown[]; next: string[] } {
  return { ok, check: "seedspec-workspace-preflight", toolFormatVersion: TOOL_FORMAT_VERSION, protocolVersion: PROTOCOL_VERSION, canonicalRuntimeValidation: false, errors, warnings, next: ok ? ["Run canonical `seedspec validate`, `seedspec lint`, and `seedspec digest` outside Think before publication."] : ["Correct deterministic preflight errors, then rerun this tool."] };
}

function collectReferences(manifest: z.infer<typeof ManifestSchema>): string[] {
  const record = manifest as Record<string, unknown>;
  const references = new Set<string>([manifest.definition.entrypoint, manifest.configuration.schema, manifest.configuration.example]);
  if (manifest.configuration.guide !== undefined) references.add(manifest.configuration.guide);
  const components = asRecord(record["components"]);
  for (const value of Object.values(components)) if (typeof value === "string") references.add(value);
  const profiles = Array.isArray(record["implementation_profiles"]) ? record["implementation_profiles"] : [];
  for (const profile of profiles) {
    const guidance = asRecord(profile)["guidance"];
    if (typeof guidance === "string") references.add(guidance);
  }
  const artifacts = Array.isArray(record["artifacts"]) ? record["artifacts"] : [];
  for (const artifact of artifacts) {
    const path = asRecord(artifact)["path"];
    if (typeof path === "string") references.add(path);
  }
  return [...references].sort();
}

function asRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function parseYamlOrJson(source: string, path: string): unknown { return path.endsWith(".json") ? JSON.parse(source) : parseYaml(source); }
function isSafeRoot(root: string): boolean { return root === "." || isSafePackagePath(root); }
function isSafePackagePath(path: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/?$/.test(path) && !path.includes("\\") && !path.includes("\0"); }
function joinRoot(root: string, path: string): string { return root === "." ? path : `${root}/${path}`; }
function compareUtf8(left: string, right: string): number { const encoder = new TextEncoder(); const a = encoder.encode(left); const b = encoder.encode(right); for (let index = 0; index < Math.min(a.length, b.length); index += 1) { const delta = (a[index] ?? 0) - (b[index] ?? 0); if (delta !== 0) return delta; } return a.length - b.length; }
function findCaseCollisions(paths: string[]): string[] { const seen = new Map<string, string>(); const collisions = new Set<string>(); for (const path of paths) { const key = path.toLowerCase(); const previous = seen.get(key); if (previous !== undefined && previous !== path) { collisions.add(previous); collisions.add(path); } else seen.set(key, path); } return [...collisions].sort(); }
async function sha256Bytes(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
