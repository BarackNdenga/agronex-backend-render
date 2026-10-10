import { describe, expect, it } from "vitest";
import { resolveAgronexRole } from "./sdk";

describe("Supabase Auth role resolution", () => {
  it("assigns an initial admin role only to a verified allowlisted email", () => {
    expect(resolveAgronexRole({ emailVerified: true, isAllowlistedAdmin: true, isConfiguredOwner: false })).toBe("admin");
    expect(resolveAgronexRole({ emailVerified: false, isAllowlistedAdmin: true, isConfiguredOwner: false })).toBe("user");
  });

  it("recognizes the configured, verified owner as an administrator", () => {
    expect(resolveAgronexRole({ emailVerified: true, isAllowlistedAdmin: false, isConfiguredOwner: true })).toBe("admin");
    expect(resolveAgronexRole({ emailVerified: false, isAllowlistedAdmin: false, isConfiguredOwner: true })).toBe("user");
    expect(resolveAgronexRole({ existingRole: "user", emailVerified: true, isAllowlistedAdmin: false, isConfiguredOwner: true })).toBe("admin");
  });

  it("preserves server-assigned invitation/admin roles and revocations", () => {
    expect(resolveAgronexRole({ existingRole: "admin", emailVerified: true, isAllowlistedAdmin: false, isConfiguredOwner: false })).toBe("admin");
    expect(resolveAgronexRole({ existingRole: "user", emailVerified: true, isAllowlistedAdmin: true, isConfiguredOwner: false })).toBe("user");
  });
});
