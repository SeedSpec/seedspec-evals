import {
  ConfigureRunRequestSchema,
  SubmitRunRequestSchema,
  type ConfigureRunRequest,
  type SubmitRunRequest,
} from "./contracts.js";

export type BoundaryParseResult<T> =
  | { success: true; data: T }
  | { success: false };

// Keep external/core contract conversion at this one boundary. Public API callers
// never receive Zod's issue structure, and future eval-core manifest adaptation
// can be added here without changing the Worker or Think agent RPC surface.
export function parseConfigureRunRequest(input: unknown): BoundaryParseResult<ConfigureRunRequest> {
  const result = ConfigureRunRequestSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false };
}

export function parseSubmitRunRequest(input: unknown): BoundaryParseResult<SubmitRunRequest> {
  const result = SubmitRunRequestSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false };
}
