import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(root, "vendor/protocol");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function collect(directory, current = directory, files = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(directory, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) await collect(directory, absolute, files);
    else if (entry.isFile() && relative !== "snapshot.json") files.push({ absolute, relative });
  }
  return files;
}

async function directoryDigest(directory) {
  const files = await collect(directory);
  files.sort((left, right) => (
    Buffer.compare(Buffer.from(left.relative, "utf8"), Buffer.from(right.relative, "utf8"))
  ));
  const aggregate = createHash("sha256");
  for (const file of files) {
    const fileDigest = createHash("sha256")
      .update(await readFile(file.absolute))
      .digest("hex");
    aggregate.update(`${file.relative}\0${fileDigest}\n`);
  }
  return `sha256:${aggregate.digest("hex")}`;
}

const releaseVersion = "0.2.0";
const packageFiles = [
  "package.json",
  "packages/cli/package.json",
  "packages/eval-core/package.json",
  "packages/evaluators/package.json",
  "packages/harness/package.json",
  "packages/case-library/package.json",
  "apps/worker/package.json"
];
for (const relativePath of packageFiles) {
  const packageJson = await readJson(path.join(root, relativePath));
  assert(packageJson.version === releaseVersion,
    `${relativePath} must use ${releaseVersion}`);
  for (const [name, version] of Object.entries(packageJson.dependencies ?? {})) {
    if (name.startsWith("@seedspec/eval")) {
      assert(version === releaseVersion,
        `${relativePath} must pin ${name} to ${releaseVersion}`);
    }
  }
}

const snapshot = await readJson(path.join(vendorRoot, "snapshot.json"));
const protocolPackage = await readJson(path.join(vendorRoot, "package.json"));
const manifest = await readJson(path.join(vendorRoot, "protocol-release.json"));
assert(snapshot.version === releaseVersion, "Frozen protocol snapshot must use 0.2.0");
assert(protocolPackage.version === releaseVersion, "Vendored protocol package must use 0.2.0");
assert(manifest.release_id === releaseVersion, "Vendored release manifest must use 0.2.0");
assert(snapshot.sourceDigest === await directoryDigest(vendorRoot),
  "Vendored protocol bytes do not match snapshot.json");
if (process.env.SEEDSPEC_REQUIRE_CLEAN_PROTOCOL_SNAPSHOT === "1") {
  assert(snapshot.sourceDirty === false,
    "Release verification requires a protocol snapshot from a clean source checkout");
}

const schemaRoot = path.join(vendorRoot, "schemas/v0.2");
const schemaNames = (await readdir(schemaRoot))
  .filter((name) => name.endsWith(".schema.json"))
  .sort();
assert(schemaNames.length === manifest.schemas.length,
  "Vendored schema inventory does not match the exact release");
for (const entry of manifest.schemas) {
  const name = path.basename(entry.path);
  assert(digest(await readFile(path.join(schemaRoot, name))) === entry.digest,
    `Vendored schema digest mismatch: ${name}`);
}
for (const entry of manifest.documents) {
  const name = path.basename(entry.path);
  assert(digest(await readFile(path.join(vendorRoot, "documents", name))) === entry.digest,
    `Vendored protocol document digest mismatch: ${name}`);
}

console.log(
  `Evaluation toolchain ${releaseVersion} uses the exact protocol snapshot: `
  + `${schemaNames.length} schemas, ${manifest.documents.length} documents, `
  + `${snapshot.sourceDirty ? "working-tree bytes recorded" : "clean source revision"}.`
);
