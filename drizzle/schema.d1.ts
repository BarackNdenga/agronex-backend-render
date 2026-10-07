import { check, integer, foreignKey, index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Core user table backing Manus OAuth. */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [check("users_role_check", sql`${table.role} IN ('user', 'admin')`)]);

export const agronexProfiles = sqliteTable("agronex_profiles", {
  userId: integer("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarUrl: text("avatarUrl"),
  bio: text("bio").notNull().default(""),
  phone: text("phone"),
  phoneVerifiedAt: integer("phoneVerifiedAt", { mode: "number" }),
  location: text("location").notNull(),
  role: text("role", { enum: ["agriculteur", "acheteur", "transporteur", "investisseur"] }).notNull(),
  payoutProvider: text("payoutProvider", { enum: ["orange", "airtel", "afrimoney", "mpesa"] }),
  payoutPhone: text("payoutPhone"),
  payoutUpdatedAt: integer("payoutUpdatedAt", { mode: "number" }),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  check("agronex_profiles_role_check", sql`${table.role} IN ('agriculteur', 'acheteur', 'transporteur', 'investisseur')`),
  check("agronex_profiles_payout_provider_check", sql`${table.payoutProvider} IS NULL OR ${table.payoutProvider} IN ('orange', 'airtel', 'afrimoney', 'mpesa')`),
]);

// Legacy empty tables retained only to match the already-applied additive migration.
// WhatsApp OTP is not exposed or used by the application.
export const agronexPhoneVerifications = sqliteTable("agronex_phone_verifications", {
  userId: integer("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  codeHash: text("codeHash").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: integer("expiresAt", { mode: "number" }).notNull(),
  verifiedAt: integer("verifiedAt", { mode: "number" }),
  consumedAt: integer("consumedAt", { mode: "number" }),
  lastSentAt: integer("lastSentAt", { mode: "number" }).notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [index("agronex_phone_verification_phone_idx").on(table.phone)]);

export const agronexOtpRateLimits = sqliteTable("agronex_otp_rate_limits", {
  bucketHash: text("bucketHash").primaryKey(),
  windowStartedAt: integer("windowStartedAt", { mode: "number" }).notNull(),
  sends: integer("sends").default(0).notNull(),
  lastSentAt: integer("lastSentAt", { mode: "number" }).notNull(),
});

export const agronexPosts = sqliteTable("agronex_posts", {
  id: text("id").primaryKey(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  farmerName: text("farmerName").notNull(),
  title: text("title").notNull(),
  qty: integer("qty").notNull(),
  unit: text("unit").notNull(),
  price: integer("price").notNull(),
  location: text("location").notNull(),
  photoUrl: text("photoUrl"),
  status: text("status", { enum: ["disponible", "reserve"] }).default("disponible").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [check("agronex_posts_status_check", sql`${table.status} IN ('disponible', 'reserve')`)]);

export const agronexOrders = sqliteTable("agronex_orders", {
  id: text("id").primaryKey(),
  postId: text("postId").notNull().references(() => agronexPosts.id),
  postTitle: text("postTitle").notNull(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  farmerName: text("farmerName").notNull(),
  pickup: text("pickup").notNull(),
  buyerId: integer("buyerId").notNull().references(() => agronexProfiles.userId),
  buyerName: text("buyerName").notNull(),
  buyerLocation: text("buyerLocation").notNull(),
  qty: integer("qty").notNull(),
  unit: text("unit").notNull(),
  unitPrice: integer("unitPrice").default(0).notNull(),
  grossAmount: integer("grossAmount", { mode: "number" }).default(0).notNull(),
  paymentStatus: text("paymentStatus", { enum: ["pending", "awaiting_payment", "payout_pending", "approved", "rejected", "refund_required", "refunded"] }).default("approved").notNull(),
  status: text("status", { enum: ["a_transporter", "en_transport", "livree", "annulee"] }).default("a_transporter").notNull(),
  transporterId: integer("transporterId").references(() => agronexProfiles.userId),
  transporterName: text("transporterName"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  check("agronex_orders_payment_status_check", sql`${table.paymentStatus} IN ('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded')`),
  check("agronex_orders_status_check", sql`${table.status} IN ('a_transporter', 'en_transport', 'livree', 'annulee')`),
]);

export const agronexMessages = sqliteTable("agronex_messages", {
  id: text("id").primaryKey(),
  fromId: integer("fromId").notNull().references(() => agronexProfiles.userId),
  fromName: text("fromName").notNull(),
  toId: integer("toId").notNull().references(() => agronexProfiles.userId),
  toName: text("toName").notNull(),
  text: text("text").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
});

export const agronexSocialPosts = sqliteTable("agronex_social_posts", {
  id: text("id").primaryKey(),
  authorId: integer("authorId").notNull(),
  body: text("body").notNull(),
  mediaUrl: text("mediaUrl"),
  sourcePostId: text("sourcePostId"),
  kind: text("kind", { enum: ["post", "repost", "quote"] }).default("post").notNull(),
  visibility: text("visibility", { enum: ["public", "connections"] }).default("public").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_sp_author_fk", columns: [table.authorId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_social_author_created_idx").on(table.authorId, table.createdAt), index("agronex_social_source_idx").on(table.sourcePostId),
  check("agronex_social_posts_kind_check", sql`${table.kind} IN ('post', 'repost', 'quote')`),
  check("agronex_social_posts_visibility_check", sql`${table.visibility} IN ('public', 'connections')`),
]);

export const agronexPostComments = sqliteTable("agronex_post_comments", {
  id: text("id").primaryKey(),
  postId: text("postId").notNull(),
  authorId: integer("authorId").notNull(),
  body: text("body").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_comment_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_comment_author_fk", columns: [table.authorId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_comment_post_created_idx").on(table.postId, table.createdAt),
]);

export const agronexPostLikes = sqliteTable("agronex_post_likes", {
  postId: text("postId").notNull(),
  userId: integer("userId").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userId] }),
  foreignKey({ name: "agx_like_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_like_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_like_user_idx").on(table.userId, table.createdAt),
]);

export const agronexSavedPosts = sqliteTable("agronex_saved_posts", {
  postId: text("postId").notNull(),
  userId: integer("userId").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userId] }),
  foreignKey({ name: "agx_saved_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_saved_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_saved_user_idx").on(table.userId, table.createdAt),
]);

export const agronexFollows = sqliteTable("agronex_follows", {
  followerId: integer("followerId").notNull(),
  followingId: integer("followingId").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.followerId, table.followingId] }),
  foreignKey({ name: "agx_follow_actor_fk", columns: [table.followerId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_follow_target_fk", columns: [table.followingId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_follow_target_idx").on(table.followingId, table.createdAt),
]);

export const agronexConnectionRequests = sqliteTable("agronex_connection_requests", {
  id: text("id").primaryKey(),
  senderId: integer("senderId").notNull(),
  recipientId: integer("recipientId").notNull(),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).default("pending").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_conn_sender_fk", columns: [table.senderId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_conn_recipient_fk", columns: [table.recipientId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_connection_sender_recipient_idx").on(table.senderId, table.recipientId), index("agronex_connection_recipient_status_idx").on(table.recipientId, table.status),
  check("agronex_connection_requests_status_check", sql`${table.status} IN ('pending', 'accepted', 'declined')`),
]);

export const agronexSocialNotifications = sqliteTable("agronex_social_notifications", {
  id: text("id").primaryKey(),
  recipientId: integer("recipientId").notNull(),
  actorId: integer("actorId"),
  postId: text("postId"),
  kind: text("kind", { enum: ["follow", "connection", "connection_accepted", "like", "comment", "repost"] }).notNull(),
  message: text("message").notNull(),
  readAt: integer("readAt", { mode: "number" }),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_notify_recipient_fk", columns: [table.recipientId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_notify_actor_fk", columns: [table.actorId], foreignColumns: [agronexProfiles.userId] }).onDelete("set null"),
  foreignKey({ name: "agx_notify_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("set null"),
  index("agronex_notifications_recipient_created_idx").on(table.recipientId, table.createdAt),
  check("agronex_social_notifications_kind_check", sql`${table.kind} IN ('follow', 'connection', 'connection_accepted', 'like', 'comment', 'repost')`),
]);

export const agronexSocialSettings = sqliteTable("agronex_social_settings", {
  userId: integer("userId").primaryKey(),
  privateProfile: integer("privateProfile", { mode: "boolean" }).default(false).notNull(),
  allowConnectionRequests: integer("allowConnectionRequests", { mode: "boolean" }).default(true).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
}, (table) => [foreignKey({ name: "agx_social_settings_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade")]);

export const agronexAdminInvitations = sqliteTable("agronex_admin_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("tokenHash").notNull().unique(),
  createdBy: integer("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  expiresAt: integer("expiresAt", { mode: "number" }).notNull(),
  redeemedAt: integer("redeemedAt", { mode: "number" }),
  redeemedBy: integer("redeemedBy").references(() => users.id, { onDelete: "set null" }),
  revokedAt: integer("revokedAt", { mode: "number" }),
}, (table) => [index("agronex_admin_invite_email_idx").on(table.email)]);

/** Manual mobile-money receiving destinations; disabled unless explicitly configured by the project owner. */
export const agronexPaymentSettings = sqliteTable("agronex_payment_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).default(false).notNull(),
  automaticEnabled: integer("automaticEnabled", { mode: "boolean" }).default(false).notNull(),
  mpesaName: text("mpesaName"),
  mpesaPhone: text("mpesaPhone"),
  airtelName: text("airtelName"),
  airtelPhone: text("airtelPhone"),
  orangeName: text("orangeName"),
  orangePhone: text("orangePhone"),
  afrimoneyName: text("afrimoneyName"),
  afrimoneyPhone: text("afrimoneyPhone"),
  updatedBy: integer("updatedBy").references(() => users.id, { onDelete: "set null" }),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
});

export const agronexPaymentRequests = sqliteTable("agronex_payment_requests", {
  id: text("id").primaryKey(),
  orderId: text("orderId").notNull().references(() => agronexOrders.id, { onDelete: "cascade" }),
  buyerId: integer("buyerId").notNull().references(() => agronexProfiles.userId),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  buyerName: text("buyerName").notNull(),
  farmerName: text("farmerName").notNull(),
  postTitle: text("postTitle").notNull(),
  provider: text("provider", { enum: ["orange", "airtel", "afrimoney", "mpesa"] }).notNull(),
  paymentMethod: text("paymentMethod", { enum: ["manual"] }).default("manual").notNull(),
  buyerPhone: text("buyerPhone"),
  farmerPayoutProvider: text("farmerPayoutProvider", { enum: ["mpesa", "airtel"] }),
  farmerPayoutPhone: text("farmerPayoutPhone"),
  destinationName: text("destinationName"),
  destinationPhone: text("destinationPhone"),
  grossAmount: integer("grossAmount", { mode: "number" }).notNull(),
  commissionAmount: integer("commissionAmount", { mode: "number" }).notNull(),
  farmerAmount: integer("farmerAmount", { mode: "number" }).notNull(),
  reference: text("reference").notNull(),
  status: text("status", { enum: ["pending", "awaiting_payment", "payout_pending", "approved", "rejected", "refund_required", "refunded"] }).default("pending").notNull(),
  gatewayTransactionId: text("gatewayTransactionId"),
  payoutReference: text("payoutReference"),
  payoutTransactionId: text("payoutTransactionId"),
  payoutAttemptedAt: integer("payoutAttemptedAt", { mode: "number" }),
  failureNote: text("failureNote"),
  reviewedBy: integer("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: integer("reviewedAt", { mode: "number" }),
  reviewNote: text("reviewNote"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("agx_payment_provider_ref_uq").on(table.provider, table.reference),
  uniqueIndex("agx_payment_order_uq").on(table.orderId),
  uniqueIndex("agx_payment_payout_reference_uq").on(table.payoutReference),
  index("agx_payment_status_created_idx").on(table.status, table.createdAt),
  index("agx_payment_farmer_idx").on(table.farmerId, table.status),
  check("agronex_payment_provider_check", sql`${table.provider} IN ('orange', 'airtel', 'afrimoney', 'mpesa')`),
  check("agronex_payment_method_check", sql`${table.paymentMethod} IN ('manual')`),
  check("agronex_payment_farmer_payout_provider_check", sql`${table.farmerPayoutProvider} IS NULL OR ${table.farmerPayoutProvider} IN ('mpesa', 'airtel')`),
  check("agronex_payment_status_check", sql`${table.status} IN ('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded')`),
]);

export const agronexPayoutRequests = sqliteTable("agronex_payout_requests", {
  id: text("id").primaryKey(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  paymentRequestId: text("paymentRequestId").references(() => agronexPaymentRequests.id, { onDelete: "restrict" }),
  farmerName: text("farmerName").notNull(),
  amount: integer("amount", { mode: "number" }).notNull(),
  provider: text("provider", { enum: ["orange", "airtel", "afrimoney", "mpesa"] }).notNull(),
  phone: text("phone").notNull(),
  method: text("method", { enum: ["manual"] }).default("manual").notNull(),
  status: text("status", { enum: ["pending", "paid", "rejected"] }).default("pending").notNull(),
  requestedAt: integer("requestedAt", { mode: "number" }).notNull(),
  reviewedBy: integer("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: integer("reviewedAt", { mode: "number" }),
  payoutReference: text("payoutReference"),
  gatewayTransactionId: text("gatewayTransactionId"),
  note: text("note"),
}, (table) => [
  index("agx_payout_status_time_idx").on(table.status, table.requestedAt),
  index("agx_payout_farmer_idx").on(table.farmerId, table.status),
  uniqueIndex("agx_payout_provider_ref_uq").on(table.provider, table.payoutReference),
  uniqueIndex("agx_auto_payout_payment_uq").on(table.paymentRequestId),
  check("agronex_payout_provider_check", sql`${table.provider} IN ('orange', 'airtel', 'afrimoney', 'mpesa')`),
  check("agronex_payout_method_check", sql`${table.method} IN ('manual')`),
  check("agronex_payout_status_check", sql`${table.status} IN ('pending', 'paid', 'rejected')`),
]);

export const agronexWalletEntries = sqliteTable("agronex_wallet_entries", {
  id: text("id").primaryKey(),
  accountType: text("accountType", { enum: ["farmer", "platform"] }).notNull(),
  userId: integer("userId").references(() => agronexProfiles.userId, { onDelete: "set null" }),
  entryType: text("entryType", { enum: ["sale_credit", "commission", "payout"] }).notNull(),
  direction: text("direction", { enum: ["credit", "debit"] }).notNull(),
  amount: integer("amount", { mode: "number" }).notNull(),
  paymentRequestId: text("paymentRequestId"),
  payoutRequestId: text("payoutRequestId"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("agx_wallet_payment_account_uq").on(table.paymentRequestId, table.accountType),
  uniqueIndex("agx_wallet_payout_account_uq").on(table.payoutRequestId, table.accountType),
  index("agx_wallet_user_time_idx").on(table.userId, table.createdAt),
  foreignKey({ name: "agx_wallet_payment_fk", columns: [table.paymentRequestId], foreignColumns: [agronexPaymentRequests.id] }).onDelete("restrict"),
  foreignKey({ name: "agx_wallet_payout_fk", columns: [table.payoutRequestId], foreignColumns: [agronexPayoutRequests.id] }).onDelete("restrict"),
  check("agronex_wallet_account_type_check", sql`${table.accountType} IN ('farmer', 'platform')`),
  check("agronex_wallet_entry_type_check", sql`${table.entryType} IN ('sale_credit', 'commission', 'payout')`),
  check("agronex_wallet_direction_check", sql`${table.direction} IN ('credit', 'debit')`),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AgronexProfile = typeof agronexProfiles.$inferSelect;
export type AgronexPost = typeof agronexPosts.$inferSelect;
export type AgronexOrder = typeof agronexOrders.$inferSelect;
export type AgronexMessage = typeof agronexMessages.$inferSelect;
export type AgronexSocialPost = typeof agronexSocialPosts.$inferSelect;
export type AgronexPostComment = typeof agronexPostComments.$inferSelect;
export type AgronexAdminInvitation = typeof agronexAdminInvitations.$inferSelect;
export type AgronexPaymentRequest = typeof agronexPaymentRequests.$inferSelect;
export type AgronexPayoutRequest = typeof agronexPayoutRequests.$inferSelect;
export type AgronexWalletEntry = typeof agronexWalletEntries.$inferSelect;
