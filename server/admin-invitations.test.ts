import { describe, expect, it } from "vitest";
import { assertAdminInvitationClaim, createAdminInvitationToken, hashAdminInvitationToken, normalizeInvitationEmail } from "./admin-invitations";

describe("admin invitations", () => {
  it("generates a long random link token while storing only its SHA-256 digest", () => {
    const first = createAdminInvitationToken();
    const second = createAdminInvitationToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toHaveLength(64);
    expect(first.tokenHash).not.toBe(first.token);
    expect(first.tokenHash).toBe(hashAdminInvitationToken(first.token));
  });

  it("normalizes email before matching it to the invitation holder", () => {
    expect(normalizeInvitationEmail("  TEAM.Admin@Example.COM ")).toBe("team.admin@example.com");
  });

  it("accepts only an active invitation for its exact account while an admin seat remains", () => {
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: null, revokedAt: null }, accountEmail: "ADMIN@example.com", accountRole: "user", currentAdminCount: 3, now: 1000 })).not.toThrow();
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: null, revokedAt: null }, accountEmail: "other@example.com", accountRole: "user", currentAdminCount: 3, now: 1000 })).toThrow(/autre adresse/i);
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 999, redeemedAt: null, revokedAt: null }, accountEmail: "admin@example.com", accountRole: "user", currentAdminCount: 3, now: 1000 })).toThrow(/expiré/i);
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: 1000, revokedAt: null }, accountEmail: "admin@example.com", accountRole: "user", currentAdminCount: 3, now: 1000 })).toThrow(/déjà été utilisée/i);
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: null, revokedAt: 1000 }, accountEmail: "admin@example.com", accountRole: "user", currentAdminCount: 3, now: 1000 })).toThrow(/révoquée/i);
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: null, revokedAt: null }, accountEmail: "admin@example.com", accountRole: "admin", currentAdminCount: 3, now: 1000 })).toThrow(/déjà administrateur/i);
    expect(() => assertAdminInvitationClaim({ invitation: { email: "admin@example.com", expiresAt: 2000, redeemedAt: null, revokedAt: null }, accountEmail: "admin@example.com", accountRole: "user", currentAdminCount: 4, now: 1000 })).toThrow(/quatre places/i);
  });
});
