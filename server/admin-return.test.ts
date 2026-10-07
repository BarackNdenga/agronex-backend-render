import { describe, expect, it } from "vitest";
import { getAdminReturnTarget } from "../client/src/lib/admin-return";
import { getAdminLandingPath } from "../client/src/lib/admin-routing";

describe("admin return redirect", () => {
  it("routes every authenticated admin role to the private dashboard regardless of the selected farm role", () => {
    expect(getAdminLandingPath("admin")).toBe("/admin");
    expect(getAdminLandingPath("user")).toBeNull();
    expect(getAdminLandingPath(undefined)).toBeNull();
  });

  it("returns the private admin route only after an authenticated login", () => {
    expect(getAdminReturnTarget("/admin", true)).toBe("/admin");
    expect(getAdminReturnTarget("/admin", false)).toBeNull();
    expect(getAdminReturnTarget("/", true)).toBeNull();
    expect(getAdminReturnTarget("https://attacker.example/", true)).toBeNull();
  });
});
