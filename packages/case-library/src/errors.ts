export const caseLibraryErrorCodes = {
  duplicateId: "CASE_DUPLICATE_ID",
  invalidRoot: "CASE_INVALID_ROOT",
  malformedDocument: "CASE_MALFORMED_DOCUMENT",
  notRegularFile: "CASE_NOT_REGULAR_FILE",
  outsideRoot: "CASE_OUTSIDE_ROOT",
  readFailed: "CASE_READ_FAILED",
  tooLarge: "CASE_TOO_LARGE",
  unsupportedFile: "CASE_UNSUPPORTED_FILE",
  validationFailed: "CASE_VALIDATION_FAILED",
} as const;

export type CaseLibraryErrorCode =
  (typeof caseLibraryErrorCodes)[keyof typeof caseLibraryErrorCodes];

export class CaseLibraryError extends Error {
  public override readonly name = "CaseLibraryError";

  public constructor(
    public readonly code: CaseLibraryErrorCode,
    message: string,
    public readonly sourcePath: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
