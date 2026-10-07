import { describe, expect, it } from "vitest";
import { resolveAgronexOAuthRole, resolveAgronexOwnerOpenId } from "./admin-owner-config";

describe("Agronex owner environment", () => {
  it("uses the project-specific owner ID first and trims accidental whitespace", () => {
    expect(resolveAgronexOwnerOpenId({ AGRONEX_OWNER_OPEN_ID: "  owner-123  ", OWNER_OPEN_ID: "legacy-owner" })).toBe("owner-123");
  });

  it("preserves compatibility with the built-in owner ID and fails closed when absent", () => {
    expect(resolveAgronexOwnerOpenId({ OWNER_OPEN_ID: " legacy-owner " })).toBe("legacy-owner");
    expect(resolveAgronexOwnerOpenId({ AGRONEX_OWNER_OPEN_ID: "   ", OWNER_OPEN_ID: " " })).toBe("");
  });
});

describe("Agronex OAuth role policy", () => {
  const policy = { ownerOpenId: "owner-123", adminEmails: new Set(["admin@example.com"]) };

  it("allows configured owners and administrators through Manus only", () => {
    expect(resolveAgronexOAuthRole({ provider: "manus", openId: "owner-123", policy })).toBe("admin");
    expect(resolveAgronexOAuthRole({ provider: "manus", openId: "other", email: " ADMIN@example.com ", policy })).toBe("admin");
    expect(resolveAgronexOAuthRole({ provider: "manus", openId: "other", email: "member@example.com", policy })).toBeNull();
  });

  it.each(["google", "tiktok"] as const)("keeps %s member-only and blocks configured admin identities", (provider) => {
    expect(resolveAgronexOAuthRole({ provider, openId: `${provider}-member`, email: "member@example.com", policy })).toBe("user");
    expect(resolveAgronexOAuthRole({ provider, openId: `${provider}-admin`, email: "admin@example.com", policy })).toBeNull();
    expect(resolveAgronexOAuthRole({ provider, openId: "owner-123", policy })).toBeNull();
    expect(resolveAgronexOAuthRole({ provider, openId: `${provider}-existing-admin`, existingRole: "admin", policy })).toBeNull();
  });
});
