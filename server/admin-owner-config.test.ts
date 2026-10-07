import { describe, expect, it } from "vitest";
import { resolveAgronexOwnerOpenId } from "./admin-owner-config";

describe("Agronex owner environment", () => {
  it("uses the project-specific owner ID first and trims accidental whitespace", () => {
    expect(resolveAgronexOwnerOpenId({ AGRONEX_OWNER_OPEN_ID: "  owner-123  ", OWNER_OPEN_ID: "legacy-owner" })).toBe("owner-123");
  });

  it("preserves compatibility with the built-in owner ID and fails closed when absent", () => {
    expect(resolveAgronexOwnerOpenId({ OWNER_OPEN_ID: " legacy-owner " })).toBe("legacy-owner");
    expect(resolveAgronexOwnerOpenId({ AGRONEX_OWNER_OPEN_ID: "   ", OWNER_OPEN_ID: " " })).toBe("");
  });
});
