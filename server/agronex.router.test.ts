import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { ENV } from "./_core/env";
import { assertAdminSeatAvailable } from "./admin-invitations";

vi.mock("./db", () => ({
  claimAgronexOrder: vi.fn(),
  createAgronexOrder: vi.fn(),
  createAgronexPost: vi.fn(),
  deliverAgronexOrder: vi.fn(),
  getAgronexAdminOverview: vi.fn(),
  listAgronexAdminInvitations: vi.fn(),
  createAgronexAdminInvitation: vi.fn(),
  getAgronexAdminInvitationInfo: vi.fn(),
  redeemAgronexAdminInvitation: vi.fn(),
  revokeAgronexAdminInvitation: vi.fn(),
  getAgronexProfile: vi.fn(),
  listAgronexPosts: vi.fn(),
  listMyAgronexMessages: vi.fn(),
  listMyAgronexOrders: vi.fn(),
  listMyAgronexPosts: vi.fn(),
  revokeAgronexAdmin: vi.fn(),
  saveAgronexProfile: vi.fn(),
  sendAgronexMessage: vi.fn(),
}));

function context(user: TrpcContext["user"] = {
  id: 7,
  openId: "agronex-test-user",
  name: "Test User",
  email: "test@example.com",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
}): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("agronex router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects the legacy marketplace purchase route so it cannot bypass Mobile Money confirmation", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.agronex.orders.create({ postId: "123e4567-e89b-42d3-a456-426614174000", qty: 1 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("nouveau parcours Mobile Money manuel") });
    expect(db.createAgronexOrder).not.toHaveBeenCalled();
  });

  it("requires authentication for a manual payment request and wallet", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.agronex.orders.requestManual({ postId: "123e4567-e89b-42d3-a456-426614174000", qty: 1, provider: "mpesa" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.orders.myPayments()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.agronex.orders.requestPayout({ amount: 1000, provider: "mpesa", phone: "0812345678" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires a signed-in account for profile operations", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.agronex.profile.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("loads the current account's profile, never an arbitrary user id", async () => {
    vi.mocked(db.getAgronexProfile).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(context());
    expect(await caller.agronex.profile.me()).toBeNull();
    expect(db.getAgronexProfile).toHaveBeenCalledWith(7);
  });

  it("validates required profile fields and the allowed role list", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.agronex.profile.save({ name: "x", phone: "", location: "Kinshasa", role: "acheteur" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.agronex.profile.save({ name: "Ada", phone: "", location: "Kinshasa", role: "admin" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.saveAgronexProfile).not.toHaveBeenCalled();
  });

  it("prevents administrators from creating a marketplace profile through the API", async () => {
    const admin = context({ ...context().user!, role: "admin" });
    const caller = appRouter.createCaller(admin);
    await expect(caller.agronex.profile.save({ name: "Admin User", phone: "", location: "Kinshasa", role: "agriculteur" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.saveAgronexProfile).not.toHaveBeenCalled();
  });

  it("blocks non-admin accounts from the administration overview", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.paymentOverview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.reviewPayment({ paymentId: "123e4567-e89b-42d3-a456-426614174000", decision: "approve" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getAgronexAdminOverview).not.toHaveBeenCalled();
  });

  it("lets admins read the dashboard, but reserves admin management to the project owner", async () => {
    const admin = context({ ...context().user!, role: "admin" });
    vi.mocked(db.getAgronexAdminOverview).mockResolvedValueOnce({ counts: { users: 0, profiles: 0, posts: 0, orders: 0, messages: 0, admins: 1 }, admins: [], recentOrders: [] });
    const caller = appRouter.createCaller(admin);
    const overview = await caller.admin.overview();
    expect(overview.counts.admins).toBe(1);
    expect(overview.canManageAdmins).toBe(admin.user?.email?.toLowerCase() === ENV.ownerEmail);
    if (admin.user?.email?.toLowerCase() !== ENV.ownerEmail) {
      await expect(caller.admin.invitations()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.admin.createInvitation({ email: "admin2@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.admin.configurePayments({ enabled: true, mpesaName: "AGRONEX", mpesaPhone: "0812345678", airtelName: "", airtelPhone: "" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(db.listAgronexAdminInvitations).not.toHaveBeenCalled();
      expect(db.createAgronexAdminInvitation).not.toHaveBeenCalled();
    }
  });

  it("does not expose invitation redemption to anonymous visitors", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.admin.redeemInvitation({ token: "a".repeat(43) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.redeemAgronexAdminInvitation).not.toHaveBeenCalled();
  });

  it("validates the secret-token format before invitation lookup", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.admin.invitationInfo({ token: "short" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getAgronexAdminInvitationInfo).not.toHaveBeenCalled();
  });

  it("lets a visitor validate a long secret link without receiving invitation-management capabilities", async () => {
    const token = "a".repeat(43);
    vi.mocked(db.getAgronexAdminInvitationInfo).mockResolvedValueOnce({ email: "invited@example.com", expiresAt: 2_000, status: "valid" });
    const caller = appRouter.createCaller(context(null));
    expect(await caller.admin.invitationInfo({ token })).toEqual({ email: "invited@example.com", expiresAt: 2_000, status: "valid" });
    await expect(caller.admin.createInvitation({ email: "attacker@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getAgronexAdminInvitationInfo).toHaveBeenCalledWith(token);
    expect(db.createAgronexAdminInvitation).not.toHaveBeenCalled();
  });

  it("reserves no more than four total seats across administrators and pending invitations", () => {
    expect(() => assertAdminSeatAvailable(1, 2)).not.toThrow();
    expect(() => assertAdminSeatAvailable(1, 3)).toThrow(/quatre places administrateur/i);
    expect(() => assertAdminSeatAvailable(1, 3, true)).not.toThrow();
    expect(() => assertAdminSeatAvailable(4, 0)).toThrow(/quatre places administrateur/i);
  });

  it("allows invitation management only from an admin session bound to the configured project owner", async () => {
    if (!ENV.ownerEmail) return;
    vi.mocked(db.createAgronexAdminInvitation).mockResolvedValueOnce({ id: "f0f85bce-4a9d-49bc-b446-45d19335b836", email: "admin2@example.com", token: "x".repeat(43), createdAt: 1000, expiresAt: 2000, seatsUsed: 2 });
    const owner = context({ ...context().user!, email: ENV.ownerEmail, role: "admin" });
    const caller = appRouter.createCaller(owner);
    await caller.admin.createInvitation({ email: "ADMIN2@example.com" });
    expect(db.createAgronexAdminInvitation).toHaveBeenCalledWith(ENV.ownerEmail, "ADMIN2@example.com");
  });
});
