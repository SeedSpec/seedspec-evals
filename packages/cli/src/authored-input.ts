import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

import {
  RunManifestSchema,
  createAuthoredInputBundle,
  type AuthoredInputBundle,
  type EvaluationVariant,
} from "@seedspec/eval-core";

const MAX_AUTHORED_INPUT_BYTES = 384 * 1024;

export async function bundleAuthoredInput(directory: string): Promise<AuthoredInputBundle> {
  const root = resolve(directory);
  const rootStat = await lstat(root).catch(() => null);
  if (rootStat?.isDirectory() !== true) throw new Error(`Authored input directory is missing: ${root}`);
  const paths: string[] = [];
  await collectFiles(root, root, paths);
  if (paths.length === 0) throw new Error("Authored input directory contains no files.");
  let totalBytes = 0;
  let digestInput = "";
  const files = [];
  for (const file of paths.toSorted(comparePaths)) {
    const bytes = await readFile(file);
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Authored input is not UTF-8 text and cannot be mounted by every parity runner: ${relative(root, file)}`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_AUTHORED_INPUT_BYTES) {
      throw new Error(`Authored input exceeds the ${String(MAX_AUTHORED_INPUT_BYTES)}-byte evaluation limit.`);
    }
    const path = relative(root, file).split(sep).join("/");
    const digest = createHash("sha256").update(bytes).digest("hex");
    digestInput += `${path}\0${digest}\n`;
    files.push({
      path,
      mediaType: mediaTypeForPath(path),
      byteLength: bytes.byteLength,
      digest: `sha256:${digest}` as const,
      contentBase64: bytes.toString("base64"),
    });
  }
  const source = await sourceIdentity(root);
  return createAuthoredInputBundle({
    schemaVersion: 1,
    digest: `sha256:${createHash("sha256").update(digestInput).digest("hex")}`,
    files,
    ...(source === undefined ? {} : { source }),
  });
}

export async function materializeAuthoredInput(
  bundle: AuthoredInputBundle,
  destination: string,
  options: { readonly readOnly?: boolean } = {},
): Promise<void> {
  const root = resolve(destination);
  await mkdir(root, { recursive: true, mode: options.readOnly === true ? 0o755 : 0o700 });
  for (const file of bundle.files) {
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (bytes.byteLength !== file.byteLength) throw new Error(`Authored input byte length mismatch: ${file.path}`);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== file.digest) throw new Error(`Authored input digest mismatch: ${file.path}`);
    const path = resolve(root, file.path);
    if (!path.startsWith(`${root}${sep}`)) throw new Error(`Authored input escaped destination: ${file.path}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx", mode: options.readOnly === true ? 0o444 : 0o600 });
  }
  if (options.readOnly === true) {
    const directories = await collectDirectories(root);
    for (const directory of directories.toSorted((left, right) => right.length - left.length)) await chmod(directory, 0o555);
  }
}

async function sourceIdentity(root: string): Promise<{ runId: string; variant: EvaluationVariant } | undefined> {
  const manifestPath = resolve(basename(root) === "workspace" ? dirname(root) : root, "run-manifest.json");
  try {
    const manifest = RunManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
    return { runId: manifest.runId, variant: manifest.variant };
  } catch {
    return undefined;
  }
}

async function collectFiles(root: string, directory: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Authored inputs cannot contain symbolic links: ${relative(root, path)}`);
    if (entry.isDirectory()) await collectFiles(root, path, files);
    else if (entry.isFile()) files.push(path);
  }
}

async function collectDirectories(root: string): Promise<string[]> {
  const directories = [root];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) directories.push(...await collectDirectories(resolve(root, entry.name)));
  }
  return directories;
}

function comparePaths(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right));
}

function mediaTypeForPath(path: string): string {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "application/yaml";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}
