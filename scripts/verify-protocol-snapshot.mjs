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

const evaluationReleaseVersion = (await readJson(path.join(root, "package.json"))).version;
const expectedProtocolRelease = "0.3.0";
const expectedProtocolFamily = "0.3";
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
  assert(packageJson.version === evaluationReleaseVersion,
    `${relativePath} must use ${evaluationReleaseVersion}`);
  for (const [name, version] of Object.entries(packageJson.dependencies ?? {})) {
    if (name.startsWith("@seedspec/eval")) {
      assert(version === evaluationReleaseVersion,
        `${relativePath} must pin ${name} to ${evaluationReleaseVersion}`);
    }
  }
}

const snapshot = await readJson(path.join(vendorRoot, "snapshot.json"));
const protocolPackage = await readJson(path.join(vendorRoot, "package.json"));
const manifest = await readJson(path.join(vendorRoot, "protocol-release.json"));
assert(snapshot.version === expectedProtocolRelease,
  `Frozen protocol snapshot must use ${expectedProtocolRelease}`);
assert(protocolPackage.version === expectedProtocolRelease,
  `Vendored protocol package must use ${expectedProtocolRelease}`);
assert(manifest.release_id === expectedProtocolRelease,
  `Vendored release manifest must use ${expectedProtocolRelease}`);
assert(manifest.protocol_family === expectedProtocolFamily,
  `Vendored protocol family must use ${expectedProtocolFamily}`);
assert(snapshot.sourceDigest === await directoryDigest(vendorRoot),
  "Vendored protocol bytes do not match snapshot.json");
if (process.env.SEEDSPEC_REQUIRE_CLEAN_PROTOCOL_SNAPSHOT === "1") {
  assert(snapshot.sourceDirty === false,
    "Release verification requires a protocol snapshot from a clean source checkout");
}

const schemaRoot = path.join(vendorRoot, `schemas/v${manifest.protocol_family}`);
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
  `Evaluation toolchain ${evaluationReleaseVersion} uses protocol ${manifest.release_id}: `
  + `${schemaNames.length} schemas, ${manifest.documents.length} documents, `
  + `${snapshot.sourceDirty ? "working-tree bytes recorded" : "clean source revision"}.`
);
