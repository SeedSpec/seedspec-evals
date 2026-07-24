import { describe, expect, it } from "vitest";

import { darwinVerificationSandboxProfile } from "./implementation-verification.js";

describe("macOS implementation verification sandbox", () => {
  it("allows loopback-bound integration tests while retaining remote network denial", () => {
    const profile = darwinVerificationSandboxProfile("/tmp/seedspec-verifier");

    expect(profile).toContain("(deny network*)");
    expect(profile).toContain("(allow network* (local ip))");
    expect(profile.indexOf("(allow network* (local ip))"))
      .toBeGreaterThan(profile.indexOf("(deny network*)"));
    expect(profile).toContain('(allow file-write* (subpath "/tmp/seedspec-verifier"))');
  });
});
