import { z } from "zod";

import {
  ArtifactIdSchema,
  RunIdSchema,
  SafeRelativePathSchema,
  Sha256DigestSchema,
  contentId,
  deepFreeze,
  sha256Hex,
  type DeepReadonly,
  type JsonValue,
} from "./common.js";
import { EvaluationVariantSchema } from "./cases.js";

export const AuthoredInputFileSchema = z.strictObject({
  path: SafeRelativePathSchema,
  mediaType: z.string().trim().min(1).max(256),
  byteLength: z.number().int().nonnegative().max(4 * 1024 * 1024),
  digest: Sha256DigestSchema,
  contentBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});

export const AuthoredInputBundleBodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  digest: Sha256DigestSchema,
  files: z.array(AuthoredInputFileSchema).min(1).max(2_000),
  source: z.strictObject({
    runId: RunIdSchema.optional(),
    variant: EvaluationVariantSchema.optional(),
  }).optional(),
}).superRefine((bundle, context) => {
  const seen = new Set<string>();
  for (const [index, file] of bundle.files.entries()) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) context.addIssue({ code: "custom", message: "authored input paths must be unique ignoring case", path: ["files", index, "path"] });
    seen.add(key);
  }
  const sorted = [...bundle.files].sort((left, right) => compareUtf8(left.path, right.path));
  if (sorted.some((file, index) => file.path !== bundle.files[index]?.path)) {
    context.addIssue({ code: "custom", message: "authored input files must use canonical UTF-8 path order", path: ["files"] });
  }
  const expectedDigest = authoredInputContentDigest(bundle.files);
  if (bundle.digest !== expectedDigest) {
    context.addIssue({ code: "custom", message: `authored input digest does not match file descriptors; expected ${expectedDigest}`, path: ["digest"] });
  }
});

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return a.length - b.length;
}

function authoredInputContentDigest(files: readonly { path: string; digest: string }[]): `sha256:${string}` {
  const input = files.map(({ path, digest }) => `${path}\0${digest.replace(/^sha256:/, "")}\n`).join("");
  return `sha256:${sha256Hex(input)}`;
}

const AuthoredInputBundleDataSchema = AuthoredInputBundleBodySchema.safeExtend({
  artifactId: ArtifactIdSchema,
}).superRefine((bundle, context) => {
  const { artifactId, ...body } = bundle;
  const parsed = AuthoredInputBundleBodySchema.safeParse(body);
  if (!parsed.success) return;
  const expected = contentId("artifact", parsed.data as unknown as JsonValue);
  if (artifactId !== expected) context.addIssue({ code: "custom", message: `artifactId does not match authored input content; expected ${expected}`, path: ["artifactId"] });
});

export const AuthoredInputBundleSchema = AuthoredInputBundleDataSchema.transform((value) => deepFreeze(value));

export type AuthoredInputBundleBody = z.infer<typeof AuthoredInputBundleBodySchema>;
export type AuthoredInputBundle = DeepReadonly<z.infer<typeof AuthoredInputBundleDataSchema>>;

export function createAuthoredInputBundle(input: AuthoredInputBundleBody): AuthoredInputBundle {
  const body = AuthoredInputBundleBodySchema.parse(input);
  return AuthoredInputBundleSchema.parse({
    ...body,
    artifactId: contentId("artifact", body as unknown as JsonValue),
  });
}

export function parseAuthoredInputBundle(input: unknown): AuthoredInputBundle {
  return AuthoredInputBundleSchema.parse(input);
}
