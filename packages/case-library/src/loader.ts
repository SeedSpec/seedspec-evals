import {
  lstat,
  open,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { EvaluationCase } from "@seedspec/eval-core";
import { parseDocument } from "yaml";

import { CaseLibraryError, caseLibraryErrorCodes } from "./errors.js";
import { validateEvaluationCase } from "./validation.js";

export const DEFAULT_MAX_CASE_BYTES = 128 * 1024;
export const MAX_CASE_BYTES = 8 * 1024 * 1024;
export const SUPPORTED_CASE_FILENAMES = [
  "case.json",
  "case.yaml",
  "case.yml",
] as const;

const supportedCaseFilenameSet = new Set<string>(SUPPORTED_CASE_FILENAMES);

export interface CaseLibraryOptions {
  readonly maxCaseBytes?: number;
}

export interface LoadedEvaluationCase {
  readonly case: EvaluationCase;
  readonly filePath: string;
  readonly relativePath: string;
}

function stableCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function portableRelativePath(rootPath: string, candidatePath: string): string {
  return relative(rootPath, candidatePath).split(sep).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertMaxBytes(maxCaseBytes: number): void {
  if (
    !Number.isSafeInteger(maxCaseBytes) ||
    maxCaseBytes < 1 ||
    maxCaseBytes > MAX_CASE_BYTES
  ) {
    throw new RangeError(
      `maxCaseBytes must be a positive safe integer no greater than ${String(
        MAX_CASE_BYTES,
      )}`,
    );
  }
}

function isContained(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function resolveRoot(rootDirectory: string): Promise<{
  real: string;
}> {
  const resolved = resolve(rootDirectory);

  try {
    const [real, rootStat] = await Promise.all([realpath(resolved), stat(resolved)]);
    if (!rootStat.isDirectory()) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.invalidRoot,
        `Evaluation case root is not a directory: ${resolved}`,
        resolved,
      );
    }
    return { real };
  } catch (error) {
    if (error instanceof CaseLibraryError) throw error;
    throw new CaseLibraryError(
      caseLibraryErrorCodes.invalidRoot,
      `Cannot access evaluation case root ${resolved}: ${errorMessage(error)}`,
      resolved,
      { cause: error },
    );
  }
}

function resolveCandidate(rootPath: string, caseFilePath: string): string {
  const candidate = isAbsolute(caseFilePath)
    ? resolve(caseFilePath)
    : resolve(rootPath, caseFilePath);

  if (!isContained(rootPath, candidate)) {
    throw new CaseLibraryError(
      caseLibraryErrorCodes.outsideRoot,
      `Evaluation case path escapes the configured root: ${caseFilePath}`,
      candidate,
    );
  }

  if (!supportedCaseFilenameSet.has(basename(candidate))) {
    throw new CaseLibraryError(
      caseLibraryErrorCodes.unsupportedFile,
      `Evaluation case file must be named ${SUPPORTED_CASE_FILENAMES.join(
        ", ",
      )}: ${candidate}`,
      candidate,
    );
  }

  return candidate;
}

async function readBoundedFile(
  filePath: string,
  maxCaseBytes: number,
): Promise<Uint8Array> {
  let fileHandle;

  try {
    fileHandle = await open(filePath, "r");
    const fileStat = await fileHandle.stat();

    if (!fileStat.isFile()) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.notRegularFile,
        `Evaluation case is not a regular file: ${filePath}`,
        filePath,
      );
    }

    if (fileStat.size > maxCaseBytes) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.tooLarge,
        `Evaluation case ${filePath} is ${String(
          fileStat.size,
        )} bytes; the limit is ${String(maxCaseBytes)} bytes`,
        filePath,
      );
    }

    const buffer = Buffer.alloc(maxCaseBytes + 1);
    let offset = 0;

    while (offset < buffer.byteLength) {
      const { bytesRead } = await fileHandle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }

    if (offset > maxCaseBytes) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.tooLarge,
        `Evaluation case ${filePath} exceeds the ${String(
          maxCaseBytes,
        )}-byte limit`,
        filePath,
      );
    }

    return buffer.subarray(0, offset);
  } catch (error) {
    if (error instanceof CaseLibraryError) throw error;
    throw new CaseLibraryError(
      caseLibraryErrorCodes.readFailed,
      `Cannot read evaluation case ${filePath}: ${errorMessage(error)}`,
      filePath,
      { cause: error },
    );
  } finally {
    await fileHandle?.close();
  }
}

function decodeUtf8(bytes: Uint8Array, filePath: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CaseLibraryError(
      caseLibraryErrorCodes.malformedDocument,
      `Evaluation case is not valid UTF-8: ${filePath}`,
      filePath,
      { cause: error },
    );
  }
}

function parseCaseDocument(source: string, filePath: string): unknown {
  const extension = extname(filePath);

  if (extension === ".json") {
    try {
      return JSON.parse(source) as unknown;
    } catch (error) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.malformedDocument,
        `Malformed JSON in evaluation case ${filePath}: ${errorMessage(error)}`,
        filePath,
        { cause: error },
      );
    }
  }

  try {
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
  } catch (error) {
    throw new CaseLibraryError(
      caseLibraryErrorCodes.malformedDocument,
      `Malformed YAML in evaluation case ${filePath}: ${errorMessage(error)}`,
      filePath,
      { cause: error },
    );
  }
}

export async function discoverCaseFiles(
  rootDirectory: string,
): Promise<string[]> {
  const root = await resolveRoot(rootDirectory);
  const discovered: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.readFailed,
        `Cannot inspect evaluation case directory ${directory}: ${errorMessage(
          error,
        )}`,
        directory,
        { cause: error },
      );
    }

    entries.sort((left, right) => stableCompare(left.name, right.name));

    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (
        entry.isFile() &&
        supportedCaseFilenameSet.has(entry.name)
      ) {
        discovered.push(entryPath);
      }
    }
  }

  await walk(root.real);
  return discovered.sort((left, right) =>
    stableCompare(
      portableRelativePath(root.real, left),
      portableRelativePath(root.real, right),
    ),
  );
}

export async function loadCaseFile(
  rootDirectory: string,
  caseFilePath: string,
  options: CaseLibraryOptions = {},
): Promise<LoadedEvaluationCase> {
  const maxCaseBytes = options.maxCaseBytes ?? DEFAULT_MAX_CASE_BYTES;
  assertMaxBytes(maxCaseBytes);

  const root = await resolveRoot(rootDirectory);
  const candidate = resolveCandidate(root.real, caseFilePath);

  let candidateRealPath: string;
  try {
    const candidateStat = await lstat(candidate);
    if (candidateStat.isSymbolicLink()) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.notRegularFile,
        `Symbolic links are not accepted as evaluation case files: ${candidate}`,
        candidate,
      );
    }
    candidateRealPath = await realpath(candidate);
  } catch (error) {
    if (error instanceof CaseLibraryError) throw error;
    throw new CaseLibraryError(
      caseLibraryErrorCodes.readFailed,
      `Cannot resolve evaluation case ${candidate}: ${errorMessage(error)}`,
      candidate,
      { cause: error },
    );
  }

  if (!isContained(root.real, candidateRealPath)) {
    throw new CaseLibraryError(
      caseLibraryErrorCodes.outsideRoot,
      `Evaluation case resolves outside the configured root: ${candidate}`,
      candidate,
    );
  }

  const bytes = await readBoundedFile(candidateRealPath, maxCaseBytes);
  const document = parseCaseDocument(
    decodeUtf8(bytes, candidateRealPath),
    candidateRealPath,
  );

  return {
    case: validateEvaluationCase(document, candidateRealPath),
    filePath: candidateRealPath,
    relativePath: portableRelativePath(root.real, candidateRealPath),
  };
}

export async function loadCaseLibrary(
  rootDirectory: string,
  options: CaseLibraryOptions = {},
): Promise<LoadedEvaluationCase[]> {
  const files = await discoverCaseFiles(rootDirectory);
  const loaded: LoadedEvaluationCase[] = [];
  const seenIds = new Map<string, string>();

  for (const file of files) {
    const loadedCase = await loadCaseFile(rootDirectory, file, options);
    const duplicatePath = seenIds.get(loadedCase.case.id);

    if (duplicatePath !== undefined) {
      throw new CaseLibraryError(
        caseLibraryErrorCodes.duplicateId,
        `Duplicate evaluation case id ${loadedCase.case.id} in ${duplicatePath} and ${loadedCase.filePath}`,
        loadedCase.filePath,
      );
    }

    seenIds.set(loadedCase.case.id, loadedCase.filePath);
    loaded.push(loadedCase);
  }

  return loaded;
}
