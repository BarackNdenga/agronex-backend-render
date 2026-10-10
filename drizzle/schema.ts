import { bigint, boolean, foreignKey, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
export const usersRoleEnum = pgEnum("users_role_enum", ["user", "admin"]);
export const agronexProfilesRoleEnum = pgEnum("agronex_profiles_role_enum", ["agriculteur", "acheteur", "transporteur", "investisseur"]);
export const agronexProfilesPayoutProviderEnum = pgEnum("agronex_profiles_payoutProvider_enum", ["orange", "airtel", "afrimoney", "mpesa"]);
export const agronexPostsStatusEnum = pgEnum("agronex_posts_status_enum", ["disponible", "reserve"]);
export const agronexOrdersPaymentStatusEnum = pgEnum("agronex_orders_paymentStatus_enum", ["pending", "awaiting_payment", "payout_pending", "approved", "rejected", "refund_required", "refunded"]);
export const agronexOrdersStatusEnum = pgEnum("agronex_orders_status_enum", ["a_transporter", "en_transport", "livree", "annulee"]);
export const agronexSocialPostsKindEnum = pgEnum("agronex_social_posts_kind_enum", ["post", "repost", "quote"]);
export const agronexSocialPostsVisibilityEnum = pgEnum("agronex_social_posts_visibility_enum", ["public", "connections"]);
export const agronexConnectionRequestsStatusEnum = pgEnum("agronex_connection_requests_status_enum", ["pending", "accepted", "declined"]);
export const agronexSocialNotificationsKindEnum = pgEnum("agronex_social_notifications_kind_enum", ["follow", "connection", "connection_accepted", "like", "comment", "repost"]);
export const agronexPaymentRequestsProviderEnum = pgEnum("agronex_payment_requests_provider_enum", ["orange", "airtel", "afrimoney", "mpesa"]);
export const agronexPaymentRequestsPaymentMethodEnum = pgEnum("agronex_payment_requests_paymentMethod_enum", ["manual"]);
export const agronexPaymentRequestsFarmerPayoutProviderEnum = pgEnum("agronex_payment_requests_farmerPayoutProvider_enum", ["mpesa", "airtel"]);
export const agronexPaymentRequestsStatusEnum = pgEnum("agronex_payment_requests_status_enum", ["pending", "awaiting_payment", "payout_pending", "approved", "rejected", "refund_required", "refunded"]);
export const agronexPayoutRequestsProviderEnum = pgEnum("agronex_payout_requests_provider_enum", ["orange", "airtel", "afrimoney", "mpesa"]);
export const agronexPayoutRequestsMethodEnum = pgEnum("agronex_payout_requests_method_enum", ["manual"]);
export const agronexPayoutRequestsStatusEnum = pgEnum("agronex_payout_requests_status_enum", ["pending", "paid", "rejected"]);
export const agronexWalletEntriesAccountTypeEnum = pgEnum("agronex_wallet_entries_accountType_enum", ["farmer", "platform"]);
export const agronexWalletEntriesEntryTypeEnum = pgEnum("agronex_wallet_entries_entryType_enum", ["sale_credit", "commission", "payout"]);
export const agronexWalletEntriesDirectionEnum = pgEnum("agronex_wallet_entries_direction_enum", ["credit", "debit"]);


/** AGRONEX user records synchronized from verified Supabase Auth sessions. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: usersRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const agronexProfiles = pgTable("agronex_profiles", {
  userId: integer("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  avatarUrl: text("avatarUrl"),
  bio: varchar("bio", { length: 240 }).notNull().default(""),
  phone: varchar("phone", { length: 48 }),
  phoneVerifiedAt: bigint("phoneVerifiedAt", { mode: "number" }),
  location: varchar("location", { length: 160 }).notNull(),
  role: agronexProfilesRoleEnum("role").notNull(),
  payoutProvider: agronexProfilesPayoutProviderEnum("payoutProvider"),
  payoutPhone: varchar("payoutPhone", { length: 48 }),
  payoutUpdatedAt: bigint("payoutUpdatedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

// Legacy empty tables retained only to match the already-applied additive migration.
// WhatsApp OTP is not exposed or used by the application.
export const agronexPhoneVerifications = pgTable("agronex_phone_verifications", {
  userId: integer("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 48 }).notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  verifiedAt: bigint("verifiedAt", { mode: "number" }),
  consumedAt: bigint("consumedAt", { mode: "number" }),
  lastSentAt: bigint("lastSentAt", { mode: "number" }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [index("agronex_phone_verification_phone_idx").on(table.phone)]);

export const agronexOtpRateLimits = pgTable("agronex_otp_rate_limits", {
  bucketHash: varchar("bucketHash", { length: 64 }).primaryKey(),
  windowStartedAt: bigint("windowStartedAt", { mode: "number" }).notNull(),
  sends: integer("sends").default(0).notNull(),
  lastSentAt: bigint("lastSentAt", { mode: "number" }).notNull(),
});

export const agronexPosts = pgTable("agronex_posts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  farmerName: varchar("farmerName", { length: 160 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  qty: integer("qty").notNull(),
  unit: varchar("unit", { length: 24 }).notNull(),
  price: integer("price").notNull(),
  location: varchar("location", { length: 160 }).notNull(),
  photoUrl: text("photoUrl"),
  status: agronexPostsStatusEnum("status").default("disponible").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const agronexOrders = pgTable("agronex_orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  postId: varchar("postId", { length: 36 }).notNull().references(() => agronexPosts.id),
  postTitle: varchar("postTitle", { length: 180 }).notNull(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  farmerName: varchar("farmerName", { length: 160 }).notNull(),
  pickup: varchar("pickup", { length: 160 }).notNull(),
  buyerId: integer("buyerId").notNull().references(() => agronexProfiles.userId),
  buyerName: varchar("buyerName", { length: 160 }).notNull(),
  buyerLocation: varchar("buyerLocation", { length: 160 }).notNull(),
  qty: integer("qty").notNull(),
  unit: varchar("unit", { length: 24 }).notNull(),
  unitPrice: integer("unitPrice").default(0).notNull(),
  grossAmount: bigint("grossAmount", { mode: "number" }).default(0).notNull(),
  paymentStatus: agronexOrdersPaymentStatusEnum("paymentStatus").default("approved").notNull(),
  status: agronexOrdersStatusEnum("status").default("a_transporter").notNull(),
  transporterId: integer("transporterId").references(() => agronexProfiles.userId),
  transporterName: varchar("transporterName", { length: 160 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const agronexMessages = pgTable("agronex_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fromId: integer("fromId").notNull().references(() => agronexProfiles.userId),
  fromName: varchar("fromName", { length: 160 }).notNull(),
  toId: integer("toId").notNull().references(() => agronexProfiles.userId),
  toName: varchar("toName", { length: 160 }).notNull(),
  text: text("text").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const agronexSocialPosts = pgTable("agronex_social_posts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  authorId: integer("authorId").notNull(),
  body: text("body").notNull(),
  mediaUrl: text("mediaUrl"),
  sourcePostId: varchar("sourcePostId", { length: 36 }),
  kind: agronexSocialPostsKindEnum("kind").default("post").notNull(),
  visibility: agronexSocialPostsVisibilityEnum("visibility").default("public").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_sp_author_fk", columns: [table.authorId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_social_author_created_idx").on(table.authorId, table.createdAt), index("agronex_social_source_idx").on(table.sourcePostId),
]);

export const agronexPostComments = pgTable("agronex_post_comments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  postId: varchar("postId", { length: 36 }).notNull(),
  authorId: integer("authorId").notNull(),
  body: varchar("body", { length: 1200 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_comment_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_comment_author_fk", columns: [table.authorId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_comment_post_created_idx").on(table.postId, table.createdAt),
]);

export const agronexPostLikes = pgTable("agronex_post_likes", {
  postId: varchar("postId", { length: 36 }).notNull(),
  userId: integer("userId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userId] }),
  foreignKey({ name: "agx_like_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_like_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_like_user_idx").on(table.userId, table.createdAt),
]);

export const agronexSavedPosts = pgTable("agronex_saved_posts", {
  postId: varchar("postId", { length: 36 }).notNull(),
  userId: integer("userId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userId] }),
  foreignKey({ name: "agx_saved_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("cascade"),
  foreignKey({ name: "agx_saved_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_saved_user_idx").on(table.userId, table.createdAt),
]);

export const agronexFollows = pgTable("agronex_follows", {
  followerId: integer("followerId").notNull(),
  followingId: integer("followingId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.followerId, table.followingId] }),
  foreignKey({ name: "agx_follow_actor_fk", columns: [table.followerId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_follow_target_fk", columns: [table.followingId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_follow_target_idx").on(table.followingId, table.createdAt),
]);

export const agronexConnectionRequests = pgTable("agronex_connection_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  senderId: integer("senderId").notNull(),
  recipientId: integer("recipientId").notNull(),
  status: agronexConnectionRequestsStatusEnum("status").default("pending").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_conn_sender_fk", columns: [table.senderId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_conn_recipient_fk", columns: [table.recipientId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  index("agronex_connection_sender_recipient_idx").on(table.senderId, table.recipientId), index("agronex_connection_recipient_status_idx").on(table.recipientId, table.status),
]);

export const agronexSocialNotifications = pgTable("agronex_social_notifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  recipientId: integer("recipientId").notNull(),
  actorId: integer("actorId"),
  postId: varchar("postId", { length: 36 }),
  kind: agronexSocialNotificationsKindEnum("kind").notNull(),
  message: varchar("message", { length: 240 }).notNull(),
  readAt: bigint("readAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  foreignKey({ name: "agx_notify_recipient_fk", columns: [table.recipientId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade"),
  foreignKey({ name: "agx_notify_actor_fk", columns: [table.actorId], foreignColumns: [agronexProfiles.userId] }).onDelete("set null"),
  foreignKey({ name: "agx_notify_post_fk", columns: [table.postId], foreignColumns: [agronexSocialPosts.id] }).onDelete("set null"),
  index("agronex_notifications_recipient_created_idx").on(table.recipientId, table.createdAt),
]);

export const agronexSocialSettings = pgTable("agronex_social_settings", {
  userId: integer("userId").primaryKey(),
  privateProfile: boolean("privateProfile").default(false).notNull(),
  allowConnectionRequests: boolean("allowConnectionRequests").default(true).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [foreignKey({ name: "agx_social_settings_user_fk", columns: [table.userId], foreignColumns: [agronexProfiles.userId] }).onDelete("cascade")]);

export const agronexAdminInvitations = pgTable("agronex_admin_invitations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  createdBy: integer("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  redeemedAt: bigint("redeemedAt", { mode: "number" }),
  redeemedBy: integer("redeemedBy").references(() => users.id, { onDelete: "set null" }),
  revokedAt: bigint("revokedAt", { mode: "number" }),
}, (table) => [index("agronex_admin_invite_email_idx").on(table.email)]);

/** Manual mobile-money receiving destinations; disabled unless explicitly configured by the project owner. */
export const agronexPaymentSettings = pgTable("agronex_payment_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").default(false).notNull(),
  automaticEnabled: boolean("automaticEnabled").default(false).notNull(),
  mpesaName: varchar("mpesaName", { length: 100 }),
  mpesaPhone: varchar("mpesaPhone", { length: 48 }),
  airtelName: varchar("airtelName", { length: 100 }),
  airtelPhone: varchar("airtelPhone", { length: 48 }),
  orangeName: varchar("orangeName", { length: 100 }),
  orangePhone: varchar("orangePhone", { length: 48 }),
  afrimoneyName: varchar("afrimoneyName", { length: 100 }),
  afrimoneyPhone: varchar("afrimoneyPhone", { length: 48 }),
  updatedBy: integer("updatedBy").references(() => users.id, { onDelete: "set null" }),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export const agronexPaymentRequests = pgTable("agronex_payment_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("orderId", { length: 36 }).notNull().references(() => agronexOrders.id, { onDelete: "cascade" }),
  buyerId: integer("buyerId").notNull().references(() => agronexProfiles.userId),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  buyerName: varchar("buyerName", { length: 160 }).notNull(),
  farmerName: varchar("farmerName", { length: 160 }).notNull(),
  postTitle: varchar("postTitle", { length: 180 }).notNull(),
  provider: agronexPaymentRequestsProviderEnum("provider").notNull(),
  paymentMethod: agronexPaymentRequestsPaymentMethodEnum("paymentMethod").default("manual").notNull(),
  buyerPhone: varchar("buyerPhone", { length: 48 }),
  farmerPayoutProvider: agronexPaymentRequestsFarmerPayoutProviderEnum("farmerPayoutProvider"),
  farmerPayoutPhone: varchar("farmerPayoutPhone", { length: 48 }),
  destinationName: varchar("destinationName", { length: 100 }),
  destinationPhone: varchar("destinationPhone", { length: 48 }),
  grossAmount: bigint("grossAmount", { mode: "number" }).notNull(),
  commissionAmount: bigint("commissionAmount", { mode: "number" }).notNull(),
  farmerAmount: bigint("farmerAmount", { mode: "number" }).notNull(),
  reference: varchar("reference", { length: 120 }).notNull(),
  status: agronexPaymentRequestsStatusEnum("status").default("pending").notNull(),
  gatewayTransactionId: varchar("gatewayTransactionId", { length: 100 }),
  payoutReference: varchar("payoutReference", { length: 120 }),
  payoutTransactionId: varchar("payoutTransactionId", { length: 100 }),
  payoutAttemptedAt: bigint("payoutAttemptedAt", { mode: "number" }),
  failureNote: varchar("failureNote", { length: 400 }),
  reviewedBy: integer("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  reviewNote: varchar("reviewNote", { length: 400 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("agx_payment_provider_ref_uq").on(table.provider, table.reference),
  uniqueIndex("agx_payment_order_uq").on(table.orderId),
  uniqueIndex("agx_payment_payout_reference_uq").on(table.payoutReference),
  index("agx_payment_status_created_idx").on(table.status, table.createdAt),
  index("agx_payment_farmer_idx").on(table.farmerId, table.status),
]);

export const agronexPayoutRequests = pgTable("agronex_payout_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  farmerId: integer("farmerId").notNull().references(() => agronexProfiles.userId),
  paymentRequestId: varchar("paymentRequestId", { length: 36 }).references(() => agronexPaymentRequests.id, { onDelete: "restrict" }),
  farmerName: varchar("farmerName", { length: 160 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  provider: agronexPayoutRequestsProviderEnum("provider").notNull(),
  phone: varchar("phone", { length: 48 }).notNull(),
  method: agronexPayoutRequestsMethodEnum("method").default("manual").notNull(),
  status: agronexPayoutRequestsStatusEnum("status").default("pending").notNull(),
  requestedAt: bigint("requestedAt", { mode: "number" }).notNull(),
  reviewedBy: integer("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  payoutReference: varchar("payoutReference", { length: 120 }),
  gatewayTransactionId: varchar("gatewayTransactionId", { length: 100 }),
  note: varchar("note", { length: 400 }),
}, (table) => [
  index("agx_payout_status_time_idx").on(table.status, table.requestedAt),
  index("agx_payout_farmer_idx").on(table.farmerId, table.status),
  uniqueIndex("agx_payout_provider_ref_uq").on(table.provider, table.payoutReference),
  uniqueIndex("agx_auto_payout_payment_uq").on(table.paymentRequestId),
]);

export const agronexWalletEntries = pgTable("agronex_wallet_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountType: agronexWalletEntriesAccountTypeEnum("accountType").notNull(),
  userId: integer("userId").references(() => agronexProfiles.userId, { onDelete: "set null" }),
  entryType: agronexWalletEntriesEntryTypeEnum("entryType").notNull(),
  direction: agronexWalletEntriesDirectionEnum("direction").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  paymentRequestId: varchar("paymentRequestId", { length: 36 }),
  payoutRequestId: varchar("payoutRequestId", { length: 36 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("agx_wallet_payment_account_uq").on(table.paymentRequestId, table.accountType),
  uniqueIndex("agx_wallet_payout_account_uq").on(table.payoutRequestId, table.accountType),
  index("agx_wallet_user_time_idx").on(table.userId, table.createdAt),
  foreignKey({ name: "agx_wallet_payment_fk", columns: [table.paymentRequestId], foreignColumns: [agronexPaymentRequests.id] }).onDelete("restrict"),
  foreignKey({ name: "agx_wallet_payout_fk", columns: [table.payoutRequestId], foreignColumns: [agronexPayoutRequests.id] }).onDelete("restrict"),
]);


/** Hashed email allowlist that grants administrator access after Supabase Auth verification. */
export const agronexAdminAllowlist = pgTable("agronex_admin_allowlist", {
  emailHash: varchar("emailHash", { length: 64 }).primaryKey(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Legacy external-identity mapping retained for data compatibility; current login uses Supabase Auth only. */
export const agronexAuthIdentities = pgTable("agronex_auth_identities", {
  provider: varchar("provider", { length: 32 }).notNull(),
  subjectHash: varchar("subjectHash", { length: 64 }).notNull(),
  authUserId: uuid("authUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.provider, table.subjectHash] }),
  uniqueIndex("agronex_auth_identity_user_uq").on(table.authUserId),
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
