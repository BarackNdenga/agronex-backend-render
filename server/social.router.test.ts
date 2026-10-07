import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("AGRONEX social router security", () => {
  it("requires a signed-in account for feeds, discovery, profiles and notification access", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.agronex.social.feed({ mode: "for-you" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.post({ postId: "9ed115c6-a16f-4dc4-92bf-524727610a1d" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.search({ query: "Kin" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.searchPosts({ query: "Kin" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.profile({ userId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.notifications()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates social post visibility, lengths and publication requirements at the API boundary", async () => {
    const signedIn: NonNullable<TrpcContext["user"]> = {
      id: 8, openId: "social-test", email: "social@example.com", name: "Social Test", loginMethod: "manus",
      role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    };
    const caller = appRouter.createCaller(context(signedIn));
    await expect(caller.agronex.social.feed({ mode: "foryou" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.agronex.social.publish({ body: "x".repeat(1801), mediaUrl: null, visibility: "public" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.agronex.social.publish({ body: "hello", mediaUrl: null, visibility: "all" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.agronex.social.publish({ body: "hello", mediaUrl: "https://example.com/photo.jpg", visibility: "public" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.agronex.social.updateProfile({ name: "Social Test", location: "Kinshasa", bio: "", avatarUrl: "https://example.com/avatar.jpg" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not expose protected interaction operations to anonymous visitors", async () => {
    const caller = appRouter.createCaller(context());
    const postId = "9ed115c6-a16f-4dc4-92bf-524727610a1d";
    await expect(caller.agronex.social.comment({ postId, body: "Bonjour" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.toggle({ postId, action: "like" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.requestConnection({ userId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.social.updateSettings({ privateProfile: true, allowConnectionRequests: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
