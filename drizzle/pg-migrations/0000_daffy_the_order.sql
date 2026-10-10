CREATE TYPE "public"."agronex_connection_requests_status_enum" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."agronex_orders_paymentStatus_enum" AS ENUM('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."agronex_orders_status_enum" AS ENUM('a_transporter', 'en_transport', 'livree', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."agronex_payment_requests_farmerPayoutProvider_enum" AS ENUM('mpesa', 'airtel');--> statement-breakpoint
CREATE TYPE "public"."agronex_payment_requests_paymentMethod_enum" AS ENUM('manual');--> statement-breakpoint
CREATE TYPE "public"."agronex_payment_requests_provider_enum" AS ENUM('orange', 'airtel', 'afrimoney', 'mpesa');--> statement-breakpoint
CREATE TYPE "public"."agronex_payment_requests_status_enum" AS ENUM('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."agronex_payout_requests_method_enum" AS ENUM('manual');--> statement-breakpoint
CREATE TYPE "public"."agronex_payout_requests_provider_enum" AS ENUM('orange', 'airtel', 'afrimoney', 'mpesa');--> statement-breakpoint
CREATE TYPE "public"."agronex_payout_requests_status_enum" AS ENUM('pending', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."agronex_posts_status_enum" AS ENUM('disponible', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."agronex_profiles_payoutProvider_enum" AS ENUM('orange', 'airtel', 'afrimoney', 'mpesa');--> statement-breakpoint
CREATE TYPE "public"."agronex_profiles_role_enum" AS ENUM('agriculteur', 'acheteur', 'transporteur', 'investisseur');--> statement-breakpoint
CREATE TYPE "public"."agronex_social_notifications_kind_enum" AS ENUM('follow', 'connection', 'connection_accepted', 'like', 'comment', 'repost');--> statement-breakpoint
CREATE TYPE "public"."agronex_social_posts_kind_enum" AS ENUM('post', 'repost', 'quote');--> statement-breakpoint
CREATE TYPE "public"."agronex_social_posts_visibility_enum" AS ENUM('public', 'connections');--> statement-breakpoint
CREATE TYPE "public"."agronex_wallet_entries_accountType_enum" AS ENUM('farmer', 'platform');--> statement-breakpoint
CREATE TYPE "public"."agronex_wallet_entries_direction_enum" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."agronex_wallet_entries_entryType_enum" AS ENUM('sale_credit', 'commission', 'payout');--> statement-breakpoint
CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "agronex_admin_allowlist" (
	"emailHash" varchar(64) PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_admin_invitations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" bigint NOT NULL,
	"expiresAt" bigint NOT NULL,
	"redeemedAt" bigint,
	"redeemedBy" integer,
	"revokedAt" bigint,
	CONSTRAINT "agronex_admin_invitations_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "agronex_auth_identities" (
	"provider" varchar(32) NOT NULL,
	"subjectHash" varchar(64) NOT NULL,
	"authUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agronex_auth_identities_provider_subjectHash_pk" PRIMARY KEY("provider","subjectHash")
);
--> statement-breakpoint
CREATE TABLE "agronex_connection_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"senderId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"status" "agronex_connection_requests_status_enum" DEFAULT 'pending' NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_follows" (
	"followerId" integer NOT NULL,
	"followingId" integer NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "agronex_follows_followerId_followingId_pk" PRIMARY KEY("followerId","followingId")
);
--> statement-breakpoint
CREATE TABLE "agronex_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"fromId" integer NOT NULL,
	"fromName" varchar(160) NOT NULL,
	"toId" integer NOT NULL,
	"toName" varchar(160) NOT NULL,
	"text" text NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"postId" varchar(36) NOT NULL,
	"postTitle" varchar(180) NOT NULL,
	"farmerId" integer NOT NULL,
	"farmerName" varchar(160) NOT NULL,
	"pickup" varchar(160) NOT NULL,
	"buyerId" integer NOT NULL,
	"buyerName" varchar(160) NOT NULL,
	"buyerLocation" varchar(160) NOT NULL,
	"qty" integer NOT NULL,
	"unit" varchar(24) NOT NULL,
	"unitPrice" integer DEFAULT 0 NOT NULL,
	"grossAmount" bigint DEFAULT 0 NOT NULL,
	"paymentStatus" "agronex_orders_paymentStatus_enum" DEFAULT 'approved' NOT NULL,
	"status" "agronex_orders_status_enum" DEFAULT 'a_transporter' NOT NULL,
	"transporterId" integer,
	"transporterName" varchar(160),
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_otp_rate_limits" (
	"bucketHash" varchar(64) PRIMARY KEY NOT NULL,
	"windowStartedAt" bigint NOT NULL,
	"sends" integer DEFAULT 0 NOT NULL,
	"lastSentAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_payment_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"orderId" varchar(36) NOT NULL,
	"buyerId" integer NOT NULL,
	"farmerId" integer NOT NULL,
	"buyerName" varchar(160) NOT NULL,
	"farmerName" varchar(160) NOT NULL,
	"postTitle" varchar(180) NOT NULL,
	"provider" "agronex_payment_requests_provider_enum" NOT NULL,
	"paymentMethod" "agronex_payment_requests_paymentMethod_enum" DEFAULT 'manual' NOT NULL,
	"buyerPhone" varchar(48),
	"farmerPayoutProvider" "agronex_payment_requests_farmerPayoutProvider_enum",
	"farmerPayoutPhone" varchar(48),
	"destinationName" varchar(100),
	"destinationPhone" varchar(48),
	"grossAmount" bigint NOT NULL,
	"commissionAmount" bigint NOT NULL,
	"farmerAmount" bigint NOT NULL,
	"reference" varchar(120) NOT NULL,
	"status" "agronex_payment_requests_status_enum" DEFAULT 'pending' NOT NULL,
	"gatewayTransactionId" varchar(100),
	"payoutReference" varchar(120),
	"payoutTransactionId" varchar(100),
	"payoutAttemptedAt" bigint,
	"failureNote" varchar(400),
	"reviewedBy" integer,
	"reviewedAt" bigint,
	"reviewNote" varchar(400),
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_payment_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"automaticEnabled" boolean DEFAULT false NOT NULL,
	"mpesaName" varchar(100),
	"mpesaPhone" varchar(48),
	"airtelName" varchar(100),
	"airtelPhone" varchar(48),
	"orangeName" varchar(100),
	"orangePhone" varchar(48),
	"afrimoneyName" varchar(100),
	"afrimoneyPhone" varchar(48),
	"updatedBy" integer,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_payout_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"farmerId" integer NOT NULL,
	"paymentRequestId" varchar(36),
	"farmerName" varchar(160) NOT NULL,
	"amount" bigint NOT NULL,
	"provider" "agronex_payout_requests_provider_enum" NOT NULL,
	"phone" varchar(48) NOT NULL,
	"method" "agronex_payout_requests_method_enum" DEFAULT 'manual' NOT NULL,
	"status" "agronex_payout_requests_status_enum" DEFAULT 'pending' NOT NULL,
	"requestedAt" bigint NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" bigint,
	"payoutReference" varchar(120),
	"gatewayTransactionId" varchar(100),
	"note" varchar(400)
);
--> statement-breakpoint
CREATE TABLE "agronex_phone_verifications" (
	"userId" integer PRIMARY KEY NOT NULL,
	"phone" varchar(48) NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expiresAt" bigint NOT NULL,
	"verifiedAt" bigint,
	"consumedAt" bigint,
	"lastSentAt" bigint NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_post_comments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"postId" varchar(36) NOT NULL,
	"authorId" integer NOT NULL,
	"body" varchar(1200) NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_post_likes" (
	"postId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "agronex_post_likes_postId_userId_pk" PRIMARY KEY("postId","userId")
);
--> statement-breakpoint
CREATE TABLE "agronex_posts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"farmerId" integer NOT NULL,
	"farmerName" varchar(160) NOT NULL,
	"title" varchar(180) NOT NULL,
	"qty" integer NOT NULL,
	"unit" varchar(24) NOT NULL,
	"price" integer NOT NULL,
	"location" varchar(160) NOT NULL,
	"photoUrl" text,
	"status" "agronex_posts_status_enum" DEFAULT 'disponible' NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_profiles" (
	"userId" integer PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"avatarUrl" text,
	"bio" varchar(240) DEFAULT '' NOT NULL,
	"phone" varchar(48),
	"phoneVerifiedAt" bigint,
	"location" varchar(160) NOT NULL,
	"role" "agronex_profiles_role_enum" NOT NULL,
	"payoutProvider" "agronex_profiles_payoutProvider_enum",
	"payoutPhone" varchar(48),
	"payoutUpdatedAt" bigint,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_saved_posts" (
	"postId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "agronex_saved_posts_postId_userId_pk" PRIMARY KEY("postId","userId")
);
--> statement-breakpoint
CREATE TABLE "agronex_social_notifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipientId" integer NOT NULL,
	"actorId" integer,
	"postId" varchar(36),
	"kind" "agronex_social_notifications_kind_enum" NOT NULL,
	"message" varchar(240) NOT NULL,
	"readAt" bigint,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_social_posts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"authorId" integer NOT NULL,
	"body" text NOT NULL,
	"mediaUrl" text,
	"sourcePostId" varchar(36),
	"kind" "agronex_social_posts_kind_enum" DEFAULT 'post' NOT NULL,
	"visibility" "agronex_social_posts_visibility_enum" DEFAULT 'public' NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_social_settings" (
	"userId" integer PRIMARY KEY NOT NULL,
	"privateProfile" boolean DEFAULT false NOT NULL,
	"allowConnectionRequests" boolean DEFAULT true NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agronex_wallet_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"accountType" "agronex_wallet_entries_accountType_enum" NOT NULL,
	"userId" integer,
	"entryType" "agronex_wallet_entries_entryType_enum" NOT NULL,
	"direction" "agronex_wallet_entries_direction_enum" NOT NULL,
	"amount" bigint NOT NULL,
	"paymentRequestId" varchar(36),
	"payoutRequestId" varchar(36),
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "users_role_enum" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "agronex_admin_invitations" ADD CONSTRAINT "agronex_admin_invitations_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_admin_invitations" ADD CONSTRAINT "agronex_admin_invitations_redeemedBy_users_id_fk" FOREIGN KEY ("redeemedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_connection_requests" ADD CONSTRAINT "agx_conn_sender_fk" FOREIGN KEY ("senderId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_connection_requests" ADD CONSTRAINT "agx_conn_recipient_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_follows" ADD CONSTRAINT "agx_follow_actor_fk" FOREIGN KEY ("followerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_follows" ADD CONSTRAINT "agx_follow_target_fk" FOREIGN KEY ("followingId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_messages" ADD CONSTRAINT "agronex_messages_fromId_agronex_profiles_userId_fk" FOREIGN KEY ("fromId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_messages" ADD CONSTRAINT "agronex_messages_toId_agronex_profiles_userId_fk" FOREIGN KEY ("toId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_orders" ADD CONSTRAINT "agronex_orders_postId_agronex_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."agronex_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_orders" ADD CONSTRAINT "agronex_orders_farmerId_agronex_profiles_userId_fk" FOREIGN KEY ("farmerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_orders" ADD CONSTRAINT "agronex_orders_buyerId_agronex_profiles_userId_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_orders" ADD CONSTRAINT "agronex_orders_transporterId_agronex_profiles_userId_fk" FOREIGN KEY ("transporterId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payment_requests" ADD CONSTRAINT "agronex_payment_requests_orderId_agronex_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."agronex_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payment_requests" ADD CONSTRAINT "agronex_payment_requests_buyerId_agronex_profiles_userId_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payment_requests" ADD CONSTRAINT "agronex_payment_requests_farmerId_agronex_profiles_userId_fk" FOREIGN KEY ("farmerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payment_requests" ADD CONSTRAINT "agronex_payment_requests_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payment_settings" ADD CONSTRAINT "agronex_payment_settings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payout_requests" ADD CONSTRAINT "agronex_payout_requests_farmerId_agronex_profiles_userId_fk" FOREIGN KEY ("farmerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payout_requests" ADD CONSTRAINT "agronex_payout_requests_paymentRequestId_agronex_payment_requests_id_fk" FOREIGN KEY ("paymentRequestId") REFERENCES "public"."agronex_payment_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_payout_requests" ADD CONSTRAINT "agronex_payout_requests_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_phone_verifications" ADD CONSTRAINT "agronex_phone_verifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_post_comments" ADD CONSTRAINT "agx_comment_post_fk" FOREIGN KEY ("postId") REFERENCES "public"."agronex_social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_post_comments" ADD CONSTRAINT "agx_comment_author_fk" FOREIGN KEY ("authorId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_post_likes" ADD CONSTRAINT "agx_like_post_fk" FOREIGN KEY ("postId") REFERENCES "public"."agronex_social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_post_likes" ADD CONSTRAINT "agx_like_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_posts" ADD CONSTRAINT "agronex_posts_farmerId_agronex_profiles_userId_fk" FOREIGN KEY ("farmerId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_profiles" ADD CONSTRAINT "agronex_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_saved_posts" ADD CONSTRAINT "agx_saved_post_fk" FOREIGN KEY ("postId") REFERENCES "public"."agronex_social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_saved_posts" ADD CONSTRAINT "agx_saved_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_social_notifications" ADD CONSTRAINT "agx_notify_recipient_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_social_notifications" ADD CONSTRAINT "agx_notify_actor_fk" FOREIGN KEY ("actorId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_social_notifications" ADD CONSTRAINT "agx_notify_post_fk" FOREIGN KEY ("postId") REFERENCES "public"."agronex_social_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_social_posts" ADD CONSTRAINT "agx_sp_author_fk" FOREIGN KEY ("authorId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_social_settings" ADD CONSTRAINT "agx_social_settings_user_fk" FOREIGN KEY ("userId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_wallet_entries" ADD CONSTRAINT "agronex_wallet_entries_userId_agronex_profiles_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."agronex_profiles"("userId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_wallet_entries" ADD CONSTRAINT "agx_wallet_payment_fk" FOREIGN KEY ("paymentRequestId") REFERENCES "public"."agronex_payment_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agronex_wallet_entries" ADD CONSTRAINT "agx_wallet_payout_fk" FOREIGN KEY ("payoutRequestId") REFERENCES "public"."agronex_payout_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agronex_admin_invite_email_idx" ON "agronex_admin_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "agronex_auth_identity_user_uq" ON "agronex_auth_identities" USING btree ("authUserId");--> statement-breakpoint
CREATE INDEX "agronex_connection_sender_recipient_idx" ON "agronex_connection_requests" USING btree ("senderId","recipientId");--> statement-breakpoint
CREATE INDEX "agronex_connection_recipient_status_idx" ON "agronex_connection_requests" USING btree ("recipientId","status");--> statement-breakpoint
CREATE INDEX "agronex_follow_target_idx" ON "agronex_follows" USING btree ("followingId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_payment_provider_ref_uq" ON "agronex_payment_requests" USING btree ("provider","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_payment_order_uq" ON "agronex_payment_requests" USING btree ("orderId");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_payment_payout_reference_uq" ON "agronex_payment_requests" USING btree ("payoutReference");--> statement-breakpoint
CREATE INDEX "agx_payment_status_created_idx" ON "agronex_payment_requests" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "agx_payment_farmer_idx" ON "agronex_payment_requests" USING btree ("farmerId","status");--> statement-breakpoint
CREATE INDEX "agx_payout_status_time_idx" ON "agronex_payout_requests" USING btree ("status","requestedAt");--> statement-breakpoint
CREATE INDEX "agx_payout_farmer_idx" ON "agronex_payout_requests" USING btree ("farmerId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_payout_provider_ref_uq" ON "agronex_payout_requests" USING btree ("provider","payoutReference");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_auto_payout_payment_uq" ON "agronex_payout_requests" USING btree ("paymentRequestId");--> statement-breakpoint
CREATE INDEX "agronex_phone_verification_phone_idx" ON "agronex_phone_verifications" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "agronex_comment_post_created_idx" ON "agronex_post_comments" USING btree ("postId","createdAt");--> statement-breakpoint
CREATE INDEX "agronex_like_user_idx" ON "agronex_post_likes" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "agronex_saved_user_idx" ON "agronex_saved_posts" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "agronex_notifications_recipient_created_idx" ON "agronex_social_notifications" USING btree ("recipientId","createdAt");--> statement-breakpoint
CREATE INDEX "agronex_social_author_created_idx" ON "agronex_social_posts" USING btree ("authorId","createdAt");--> statement-breakpoint
CREATE INDEX "agronex_social_source_idx" ON "agronex_social_posts" USING btree ("sourcePostId");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_wallet_payment_account_uq" ON "agronex_wallet_entries" USING btree ("paymentRequestId","accountType");--> statement-breakpoint
CREATE UNIQUE INDEX "agx_wallet_payout_account_uq" ON "agronex_wallet_entries" USING btree ("payoutRequestId","accountType");--> statement-breakpoint
CREATE INDEX "agx_wallet_user_time_idx" ON "agronex_wallet_entries" USING btree ("userId","createdAt");

-- Supabase API clients must not read or write application tables directly.
ALTER TABLE public."agronex_admin_allowlist" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_admin_allowlist" FROM anon, authenticated;
ALTER TABLE public."agronex_admin_invitations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_admin_invitations" FROM anon, authenticated;
ALTER TABLE public."agronex_auth_identities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_auth_identities" FROM anon, authenticated;
ALTER TABLE public."agronex_connection_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_connection_requests" FROM anon, authenticated;
ALTER TABLE public."agronex_follows" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_follows" FROM anon, authenticated;
ALTER TABLE public."agronex_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_messages" FROM anon, authenticated;
ALTER TABLE public."agronex_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_orders" FROM anon, authenticated;
ALTER TABLE public."agronex_otp_rate_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_otp_rate_limits" FROM anon, authenticated;
ALTER TABLE public."agronex_payment_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_payment_requests" FROM anon, authenticated;
ALTER TABLE public."agronex_payment_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_payment_settings" FROM anon, authenticated;
ALTER TABLE public."agronex_payout_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_payout_requests" FROM anon, authenticated;
ALTER TABLE public."agronex_phone_verifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_phone_verifications" FROM anon, authenticated;
ALTER TABLE public."agronex_post_comments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_post_comments" FROM anon, authenticated;
ALTER TABLE public."agronex_post_likes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_post_likes" FROM anon, authenticated;
ALTER TABLE public."agronex_posts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_posts" FROM anon, authenticated;
ALTER TABLE public."agronex_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_profiles" FROM anon, authenticated;
ALTER TABLE public."agronex_saved_posts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_saved_posts" FROM anon, authenticated;
ALTER TABLE public."agronex_social_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_social_notifications" FROM anon, authenticated;
ALTER TABLE public."agronex_social_posts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_social_posts" FROM anon, authenticated;
ALTER TABLE public."agronex_social_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_social_settings" FROM anon, authenticated;
ALTER TABLE public."agronex_wallet_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agronex_wallet_entries" FROM anon, authenticated;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."users" FROM anon, authenticated;
GRANT ALL ON TABLE public."agronex_admin_allowlist" TO service_role;
GRANT ALL ON TABLE public."agronex_admin_invitations" TO service_role;
GRANT ALL ON TABLE public."agronex_auth_identities" TO service_role;
GRANT ALL ON TABLE public."agronex_connection_requests" TO service_role;
GRANT ALL ON TABLE public."agronex_follows" TO service_role;
GRANT ALL ON TABLE public."agronex_messages" TO service_role;
GRANT ALL ON TABLE public."agronex_orders" TO service_role;
GRANT ALL ON TABLE public."agronex_otp_rate_limits" TO service_role;
GRANT ALL ON TABLE public."agronex_payment_requests" TO service_role;
GRANT ALL ON TABLE public."agronex_payment_settings" TO service_role;
GRANT ALL ON TABLE public."agronex_payout_requests" TO service_role;
GRANT ALL ON TABLE public."agronex_phone_verifications" TO service_role;
GRANT ALL ON TABLE public."agronex_post_comments" TO service_role;
GRANT ALL ON TABLE public."agronex_post_likes" TO service_role;
GRANT ALL ON TABLE public."agronex_posts" TO service_role;
GRANT ALL ON TABLE public."agronex_profiles" TO service_role;
GRANT ALL ON TABLE public."agronex_saved_posts" TO service_role;
GRANT ALL ON TABLE public."agronex_social_notifications" TO service_role;
GRANT ALL ON TABLE public."agronex_social_posts" TO service_role;
GRANT ALL ON TABLE public."agronex_social_settings" TO service_role;
GRANT ALL ON TABLE public."agronex_wallet_entries" TO service_role;
GRANT ALL ON TABLE public."users" TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq TO service_role;
