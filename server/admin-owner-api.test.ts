import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Agronex owner production secret", () => {
  it("accepts AGRONEX_OWNER_OPEN_ID on the read-only admin invitations API", async () => {
    const openId = process.env.AGRONEX_OWNER_OPEN_ID?.trim();
    expect(openId, "AGRONEX_OWNER_OPEN_ID must be set in the project environment").toBeTruthy();

    const now = new Date();
    const ctx = {
      user: {
        id: 1,
        openId: openId!,
        email: "ndengabarack@gmail.com",
        name: "Barack Ndenga",
        loginMethod: "manus",
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as unknown as TrpcContext;

    const invitations = await appRouter.createCaller(ctx).admin.invitations();
    expect(Array.isArray(invitations)).toBe(true);
    expect(invitations.length).toBeGreaterThanOrEqual(0);

    await expect(
      appRouter.createCaller(ctx).admin.createInvitation({ email: "ndengabarack@gmail.com" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
