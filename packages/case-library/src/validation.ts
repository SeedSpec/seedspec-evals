import {
  EvaluationCaseSchema,
  type EvaluationCase,
} from "@seedspec/eval-core";

import { CaseLibraryError, caseLibraryErrorCodes } from "./errors.js";

function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "<root>";
  }

  return path
    .map((segment) =>
      typeof segment === "number" ? `[${String(segment)}]` : String(segment),
    )
    .join(".")
    .replaceAll(".[", "[");
}

export function validateEvaluationCase(
  input: unknown,
  sourcePath: string,
): EvaluationCase {
  const result = EvaluationCaseSchema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  throw new CaseLibraryError(
    caseLibraryErrorCodes.validationFailed,
    `Invalid evaluation case at ${sourcePath}: ${details}`,
    sourcePath,
    { cause: result.error },
  );
}
