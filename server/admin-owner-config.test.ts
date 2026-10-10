import { describe, expect, it } from "vitest";
import { isAgronexOwnerEmail, resolveAgronexOwnerEmail } from "./admin-owner-config";

describe("Agronex owner environment", () => {
  it("normalizes the configured owner email", () => {
    expect(resolveAgronexOwnerEmail({ AGRONEX_OWNER_EMAIL: "  OWNER@Example.com  " })).toBe("owner@example.com");
  });

  it("fails closed when no owner email is configured", () => {
    expect(resolveAgronexOwnerEmail({})).toBe("");
  });

  it("matches the owner address case-insensitively", () => {
    expect(isAgronexOwnerEmail("Owner@Example.com", "owner@example.com")).toBe(true);
    expect(isAgronexOwnerEmail(null, "owner@example.com")).toBe(false);
    expect(isAgronexOwnerEmail("owner@example.com", "")).toBe(false);
  });
});
