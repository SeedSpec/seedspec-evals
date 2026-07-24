import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

import { loadCaseFile } from "@seedspec/eval-case-library";
import {
  CaseQualificationBodySchema,
  createCaseQualification,
  parseCaseQualification,
  sha256Hex,
  stableJson,
  type CaseQualification,
} from "@seedspec/eval-core";
import { parseDocument } from "yaml";

export async function finalizeCaseQualificationFile(options: {
  readonly draft: string;
  readonly caseRoot: string;
  readonly caseFile?: string;
  readonly out?: string;
}): Promise<{ readonly qualification: CaseQualification; readonly path: string }> {
  const draftPath = resolve(options.draft);
  const body = CaseQualificationBodySchema.parse(
    parseStructuredDocument(await readFile(draftPath, "utf8"), draftPath),
  );
  const inferredCaseFile = relative(
    resolve(options.caseRoot),
    resolve(dirname(draftPath), "..", "case.yaml"),
  ).split(sep).join("/");
  const loadedCase = await loadCaseFile(
    resolve(options.caseRoot),
    options.caseFile ?? inferredCaseFile,
  );
  const caseSource = await readFile(loadedCase.filePath, "utf8");
  const expectedCaseDigest = `sha256:${sha256Hex(caseSource)}` as const;
  if (
    body.case.id !== loadedCase.case.id
    || body.case.version !== loadedCase.case.version
    || body.case.digest !== expectedCaseDigest
  ) {
    throw new Error(
      `Qualification case binding does not match ${loadedCase.case.id}@${loadedCase.case.version} (${expectedCaseDigest}).`,
    );
  }

  for (const candidate of body.candidates) {
    const artifactPath = containedPath(dirname(draftPath), candidate.artifact.path);
    const observedDigest = await artifactTreeDigest(artifactPath);
    if (candidate.artifact.digest !== observedDigest) {
      throw new Error(
        `Counterfactual ${candidate.id} artifact digest mismatch; expected ${candidate.artifact.digest}, observed ${observedDigest}.`,
      );
    }
  }
  for (const probe of body.probes) {
    for (const evidence of probe.evidence) {
      const evidencePath = containedPath(dirname(draftPath), evidence.path);
      const observedDigest = await artifactTreeDigest(evidencePath);
      if (evidence.digest !== undefined && evidence.digest !== observedDigest) {
        throw new Error(
          `Probe ${probe.id} evidence digest mismatch for ${evidence.path}; expected ${evidence.digest}, observed ${observedDigest}.`,
        );
      }
    }
  }

  const qualification = createCaseQualification(body);
  const defaultOut = draftPath.replace(/(?:-draft)?\.(?:json|ya?ml)$/i, ".json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(qualification, null, 2)}\n`, "utf8");
  return { qualification, path };
}

export async function validateCaseQualificationFile(file: string): Promise<CaseQualification> {
  return parseCaseQualification(
    parseStructuredDocument(await readFile(resolve(file), "utf8"), resolve(file)),
  );
}

export async function artifactTreeDigest(path: string): Promise<`sha256:${string}`> {
  const resolved = resolve(path);
  const requestedStat = await lstat(resolved);
  if (requestedStat.isSymbolicLink()) {
    throw new Error(`Qualification artifacts cannot be symbolic links: ${path}`);
  }
  const root = await realpath(resolved);
  const rootStat = await lstat(root);
  if (rootStat.isFile()) {
    return `sha256:${createHash("sha256").update(await readFile(root)).digest("hex")}`;
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Qualification artifact must be a regular file or directory: ${path}`);
  }
  const entries: { path: string; digest: string; byteLength: number }[] = [];
  await walkArtifactTree(root, root, entries);
  return `sha256:${sha256Hex(stableJson(entries))}`;
}

async function walkArtifactTree(
  root: string,
  directory: string,
  entries: { path: string; digest: string; byteLength: number }[],
): Promise<void> {
  const children = (await readdir(directory, { withFileTypes: true }))
    .toSorted((left, right) => left.name.localeCompare(right.name, "en"));
  for (const child of children) {
    const childPath = resolve(directory, child.name);
    const childStat = await lstat(childPath);
    if (childStat.isSymbolicLink()) {
      throw new Error(`Qualification artifact trees cannot contain symbolic links: ${childPath}`);
    }
    if (childStat.isDirectory()) {
      await walkArtifactTree(root, childPath, entries);
    } else if (childStat.isFile()) {
      const source = await readFile(childPath);
      entries.push({
        path: relative(root, childPath).split(sep).join("/"),
        digest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        byteLength: source.byteLength,
      });
    } else {
      throw new Error(`Qualification artifact trees may contain only regular files: ${childPath}`);
    }
  }
}

function parseStructuredDocument(source: string, path: string): unknown {
  if (extname(path).toLowerCase() === ".json") return JSON.parse(source) as unknown;
  const document = parseDocument(source, {
    prettyErrors: true,
    schema: "core",
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map(({ message }) => message).join("; "));
  }
  return document.toJS({ maxAliasCount: 0 }) as unknown;
}

function containedPath(root: string, requested: string): string {
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Qualification path escapes its case directory: ${requested}`);
  }
  return path;
}
