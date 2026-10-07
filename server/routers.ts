import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import {
  claimAgronexOrder,
  createAgronexOrder,
  createAgronexPost,
  deliverAgronexOrder,
  getAgronexProfile,
  getAgronexAdminOverview,
  listAgronexAdminInvitations,
  createAgronexAdminInvitation,
  getAgronexAdminInvitationInfo,
  redeemAgronexAdminInvitation,
  revokeAgronexAdminInvitation,
  listAgronexPosts,
  listMyAgronexMessages,
  listMyAgronexOrders,
  listMyAgronexPosts,
  saveAgronexProfile,
  revokeAgronexAdmin,
  sendAgronexMessage,
} from "./db";
import { AdminInvitationError } from "./admin-invitations";
import { cancelUnpaidManualOrder, confirmManualPayment, createManualAgronexOrder, getManualPaymentAdminData, getMyManualPayments, getPublicPaymentOptions, requestManualPayout, reviewManualPayment, reviewManualPayout, savePaymentSettings } from "./payment-db";
import { getSocialOAuthConfig, isSocialProviderConfigured } from "./social-oauth";
import { getPublicMobileMoneyProviders, MOBILE_MONEY_PROVIDERS } from "./mobile-money";
import { saveFarmerPayoutDetails } from "./payment-db";
import {
  answerSocialConnection, createSocialComment, createSocialPost, findSocialPeople, findSocialPosts, followSocialUser,
  getSocialFeed, getSocialPost, getSocialProfile, getSocialSettings, listSavedSocialPosts, listSocialComments,
  listSocialConnections, listSocialNotifications, markSocialNotificationsRead, repostSocialPost,
  requestSocialConnection, toggleSocialPost, updateSocialProfile, updateSocialSettings,
} from "./social";

async function withAdminInvitationErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

const profileInput = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(48).default(""),
  location: z.string().trim().min(2).max(160),
  role: z.enum(["agriculteur", "acheteur", "transporteur", "investisseur"]),
});

const storedImageUrl = z.string().max(1200).regex(/^\/manus-storage\/[A-Za-z0-9/_\-.]+$/).refine((url) => !url.includes(".."));

const agronexRouter = router({
  profile: router({
    me: protectedProcedure.query(({ ctx }) => getAgronexProfile(ctx.user.id)),
    save: protectedProcedure.input(profileInput).mutation(({ ctx, input }) => {
      if (ctx.user.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Les comptes administrateur accèdent directement à leur espace de gouvernance." });
      return saveAgronexProfile(ctx.user.id, input);
    }),
  }),
  social: router({
    feed: protectedProcedure.input(z.object({ mode: z.enum(["for-you", "following", "connections"]) })).query(({ ctx, input }) => getSocialFeed(ctx.user.id, input.mode)),
    post: protectedProcedure.input(z.object({ postId: z.string().uuid() })).query(({ ctx, input }) => getSocialPost(ctx.user.id, input.postId)),
    publish: protectedProcedure.input(z.object({ body: z.string().trim().max(1800).default(""), mediaUrl: storedImageUrl.nullable(), visibility: z.enum(["public", "connections"]).default("public") })).mutation(({ ctx, input }) => createSocialPost(ctx.user.id, input)),
    search: protectedProcedure.input(z.object({ query: z.string().trim().max(80) })).query(({ ctx, input }) => findSocialPeople(ctx.user.id, input.query)),
    searchPosts: protectedProcedure.input(z.object({ query: z.string().trim().max(80) })).query(({ ctx, input }) => findSocialPosts(ctx.user.id, input.query)),
    profile: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => getSocialProfile(ctx.user.id, input.userId)),
    follow: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(({ ctx, input }) => followSocialUser(ctx.user.id, input.userId)),
    requestConnection: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(({ ctx, input }) => requestSocialConnection(ctx.user.id, input.userId)),
    respondConnection: protectedProcedure.input(z.object({ requestId: z.string().uuid(), accept: z.boolean() })).mutation(({ ctx, input }) => answerSocialConnection(ctx.user.id, input.requestId, input.accept)),
    connections: protectedProcedure.query(({ ctx }) => listSocialConnections(ctx.user.id)),
    comments: protectedProcedure.input(z.object({ postId: z.string().uuid() })).query(({ ctx, input }) => listSocialComments(ctx.user.id, input.postId)),
    comment: protectedProcedure.input(z.object({ postId: z.string().uuid(), body: z.string().trim().min(1).max(1200) })).mutation(({ ctx, input }) => createSocialComment(ctx.user.id, input.postId, input.body)),
    toggle: protectedProcedure.input(z.object({ postId: z.string().uuid(), action: z.enum(["like", "save"]) })).mutation(({ ctx, input }) => toggleSocialPost(ctx.user.id, input.postId, input.action)),
    repost: protectedProcedure.input(z.object({ postId: z.string().uuid(), quote: z.string().trim().max(1000).default("") })).mutation(({ ctx, input }) => repostSocialPost(ctx.user.id, input.postId, input.quote)),
    saved: protectedProcedure.query(({ ctx }) => listSavedSocialPosts(ctx.user.id)),
    settings: protectedProcedure.query(({ ctx }) => getSocialSettings(ctx.user.id)),
    updateSettings: protectedProcedure.input(z.object({ privateProfile: z.boolean(), allowConnectionRequests: z.boolean() })).mutation(({ ctx, input }) => updateSocialSettings(ctx.user.id, input)),
    updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(160), location: z.string().trim().min(2).max(160), bio: z.string().trim().max(240).default(""), avatarUrl: storedImageUrl.nullable() })).mutation(({ ctx, input }) => updateSocialProfile(ctx.user.id, input)),
    notifications: protectedProcedure.query(({ ctx }) => listSocialNotifications(ctx.user.id)),
    markNotificationsRead: protectedProcedure.mutation(({ ctx }) => markSocialNotificationsRead(ctx.user.id)),
  }),
  posts: router({
    feed: protectedProcedure.query(() => listAgronexPosts()),
    mine: protectedProcedure.query(({ ctx }) => listMyAgronexPosts(ctx.user.id)),
    create: protectedProcedure.input(z.object({
      title: z.string().trim().min(2).max(180),
      qty: z.number().int().min(1).max(2147483647),
      unit: z.enum(["kg", "sacs", "tonnes", "caisses"]),
      price: z.number().int().min(1).max(2147483647),
      location: z.string().trim().min(2).max(160),
      photoUrl: z.string().max(1200).nullable(),
    })).mutation(({ ctx, input }) => createAgronexPost(ctx.user.id, input)),
  }),
  orders: router({
    buyer: protectedProcedure.query(({ ctx }) => listMyAgronexOrders(ctx.user.id, "buyer")),
    openMissions: protectedProcedure.query(({ ctx }) => listMyAgronexOrders(ctx.user.id, "open")),
    myMissions: protectedProcedure.query(({ ctx }) => listMyAgronexOrders(ctx.user.id, "transporter")),
    create: protectedProcedure.input(z.object({ postId: z.string().uuid(), qty: z.number().int().min(1) }))
      .mutation(() => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Utilisez le nouveau parcours Mobile Money manuel; l’ancienne commande directe n’est plus disponible." }); }),
    paymentOptions: publicProcedure.query(() => getPublicPaymentOptions()),
    mobileMoneyProviders: publicProcedure.query(() => getPublicMobileMoneyProviders()),
    myPayments: protectedProcedure.query(({ ctx }) => getMyManualPayments(ctx.user.id)),
    savePayoutDetails: protectedProcedure.input(z.object({ provider: z.enum(MOBILE_MONEY_PROVIDERS), phone: z.string().trim().min(8).max(48) }))
      .mutation(({ ctx, input }) => saveFarmerPayoutDetails(ctx.user.id, input.provider, input.phone)),
    requestManual: protectedProcedure.input(z.object({ postId: z.string().uuid(), qty: z.number().int().min(1).max(1000000), provider: z.enum(MOBILE_MONEY_PROVIDERS) }))
      .mutation(({ ctx, input }) => createManualAgronexOrder(ctx.user.id, input)),
    confirmManual: protectedProcedure.input(z.object({ paymentId: z.string().uuid(), reference: z.string().trim().min(3).max(120) }))
      .mutation(({ ctx, input }) => confirmManualPayment(ctx.user.id, input)),
    cancelManual: protectedProcedure.input(z.object({ paymentId: z.string().uuid() }))
      .mutation(({ ctx, input }) => cancelUnpaidManualOrder(ctx.user.id, input.paymentId)),
    requestPayout: protectedProcedure.input(z.object({ amount: z.number().int().positive(), provider: z.enum(MOBILE_MONEY_PROVIDERS), phone: z.string().trim().min(8).max(48) }))
      .mutation(({ ctx, input }) => requestManualPayout(ctx.user.id, input)),
    claim: protectedProcedure.input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => claimAgronexOrder(ctx.user.id, input.id)),
    deliver: protectedProcedure.input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => deliverAgronexOrder(ctx.user.id, input.id)),
  }),
  messages: router({
    mine: protectedProcedure.query(({ ctx }) => listMyAgronexMessages(ctx.user.id)),
    send: protectedProcedure.input(z.object({ farmerId: z.number().int().positive(), text: z.string().trim().min(1).max(4000) }))
      .mutation(({ ctx, input }) => sendAgronexMessage(ctx.user.id, input)),
  }),
  photos: router({
    upload: protectedProcedure.input(z.object({
      dataUrl: z.string().max(1800000),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      purpose: z.enum(["product", "profile", "social"]).default("product"),
    })).mutation(async ({ ctx, input }) => {
      const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || match[1] !== input.contentType) throw new Error("Format de photo invalide.");
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 1_200_000) throw new Error("La photo doit faire moins de 1,2 Mo après compression.");
      const ext = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
      const collection = input.purpose === "profile" ? "profiles" : input.purpose === "social" ? "social" : "products";
      const { url } = await storagePut(`agronex/${ctx.user.id}/${collection}/${crypto.randomUUID()}.${ext}`, bytes, input.contentType);
      return { url };
    }),
  }),
});

const adminManagementProcedure = adminProcedure.use(({ ctx, next }) => {
  if (!ENV.ownerOpenId || ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seul le propriétaire du projet peut gérer les quatre accès administrateur." });
  }
  return next({ ctx });
});

const adminRouter = router({
  overview: adminProcedure.query(async ({ ctx }) => {
    const overview = await getAgronexAdminOverview();
    return {
      ...overview,
      admins: overview.admins.map((admin) => ({ ...admin, isOwner: admin.id === ctx.user.id })),
      canManageAdmins: Boolean(ENV.ownerOpenId && ctx.user.openId === ENV.ownerOpenId),
    };
  }),
  paymentOverview: adminProcedure.query(() => getManualPaymentAdminData()),
  configurePayments: adminManagementProcedure.input(z.object({
    enabled: z.boolean(), automaticEnabled: z.boolean().default(false), mpesaName: z.string().trim().max(100), mpesaPhone: z.string().trim().max(48),
    airtelName: z.string().trim().max(100), airtelPhone: z.string().trim().max(48), orangeName: z.string().trim().max(100), orangePhone: z.string().trim().max(48), afrimoneyName: z.string().trim().max(100), afrimoneyPhone: z.string().trim().max(48),
  })).mutation(({ ctx, input }) => savePaymentSettings(ctx.user.id, input)),
  reviewPayment: adminProcedure.input(z.object({ paymentId: z.string().uuid(), decision: z.enum(["approve", "reject", "refund_required", "refunded"]), note: z.string().trim().max(400).default("") }))
    .mutation(({ ctx, input }) => reviewManualPayment(ctx.user.id, input)),
  reviewPayout: adminProcedure.input(z.object({ payoutId: z.string().uuid(), decision: z.enum(["paid", "reject"]), reference: z.string().trim().max(120).default(""), note: z.string().trim().max(400).default("") }))
    .mutation(({ ctx, input }) => reviewManualPayout(ctx.user.id, input)),
  invitations: adminManagementProcedure.query(({ ctx }) => withAdminInvitationErrors(() => listAgronexAdminInvitations(ctx.user.openId))),
  createInvitation: adminManagementProcedure.input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(({ ctx, input }) => withAdminInvitationErrors(() => createAgronexAdminInvitation(ctx.user.openId, input.email))),
  revokeInvitation: adminManagementProcedure.input(z.object({ invitationId: z.string().uuid() }))
    .mutation(({ ctx, input }) => withAdminInvitationErrors(() => revokeAgronexAdminInvitation(ctx.user.openId, input.invitationId))),
  invitationInfo: publicProcedure.input(z.object({ token: z.string().min(40).max(50).regex(/^[A-Za-z0-9_-]+$/) }))
    .mutation(({ input }) => withAdminInvitationErrors(() => getAgronexAdminInvitationInfo(input.token))),
  redeemInvitation: protectedProcedure.input(z.object({ token: z.string().min(40).max(50).regex(/^[A-Za-z0-9_-]+$/) }))
    .mutation(({ ctx, input }) => withAdminInvitationErrors(() => redeemAgronexAdminInvitation(input.token, ctx.user.id, ctx.user.email))),
  revoke: adminManagementProcedure.input(z.object({ userId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => revokeAgronexAdmin(ctx.user.openId, input.userId)),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    socialProviders: publicProcedure.query(() => {
      const config = getSocialOAuthConfig();
      return {
        google: isSocialProviderConfigured("google", config),
        tiktok: isSocialProviderConfigured("tiktok", config),
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  agronex: agronexRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
