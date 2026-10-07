CREATE TABLE `agronex_admin_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`tokenHash` text NOT NULL,
	`createdBy` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`redeemedAt` integer,
	`redeemedBy` integer,
	`revokedAt` integer,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`redeemedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agronex_admin_invitations_tokenHash_unique` ON `agronex_admin_invitations` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `agronex_admin_invite_email_idx` ON `agronex_admin_invitations` (`email`);--> statement-breakpoint
CREATE TABLE `agronex_connection_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`senderId` integer NOT NULL,
	`recipientId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`senderId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agronex_connection_requests_status_check" CHECK("agronex_connection_requests"."status" IN ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE INDEX `agronex_connection_sender_recipient_idx` ON `agronex_connection_requests` (`senderId`,`recipientId`);--> statement-breakpoint
CREATE INDEX `agronex_connection_recipient_status_idx` ON `agronex_connection_requests` (`recipientId`,`status`);--> statement-breakpoint
CREATE TABLE `agronex_follows` (
	`followerId` integer NOT NULL,
	`followingId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`followerId`, `followingId`),
	FOREIGN KEY (`followerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followingId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agronex_follow_target_idx` ON `agronex_follows` (`followingId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agronex_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`fromId` integer NOT NULL,
	`fromName` text NOT NULL,
	`toId` integer NOT NULL,
	`toName` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`fromId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`toId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agronex_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`postTitle` text NOT NULL,
	`farmerId` integer NOT NULL,
	`farmerName` text NOT NULL,
	`pickup` text NOT NULL,
	`buyerId` integer NOT NULL,
	`buyerName` text NOT NULL,
	`buyerLocation` text NOT NULL,
	`qty` integer NOT NULL,
	`unit` text NOT NULL,
	`unitPrice` integer DEFAULT 0 NOT NULL,
	`grossAmount` integer DEFAULT 0 NOT NULL,
	`paymentStatus` text DEFAULT 'approved' NOT NULL,
	`status` text DEFAULT 'a_transporter' NOT NULL,
	`transporterId` integer,
	`transporterName` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `agronex_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transporterId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agronex_orders_payment_status_check" CHECK("agronex_orders"."paymentStatus" IN ('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded')),
	CONSTRAINT "agronex_orders_status_check" CHECK("agronex_orders"."status" IN ('a_transporter', 'en_transport', 'livree', 'annulee'))
);
--> statement-breakpoint
CREATE TABLE `agronex_otp_rate_limits` (
	`bucketHash` text PRIMARY KEY NOT NULL,
	`windowStartedAt` integer NOT NULL,
	`sends` integer DEFAULT 0 NOT NULL,
	`lastSentAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agronex_payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`buyerId` integer NOT NULL,
	`farmerId` integer NOT NULL,
	`buyerName` text NOT NULL,
	`farmerName` text NOT NULL,
	`postTitle` text NOT NULL,
	`provider` text NOT NULL,
	`paymentMethod` text DEFAULT 'manual' NOT NULL,
	`buyerPhone` text,
	`farmerPayoutProvider` text,
	`farmerPayoutPhone` text,
	`destinationName` text,
	`destinationPhone` text,
	`grossAmount` integer NOT NULL,
	`commissionAmount` integer NOT NULL,
	`farmerAmount` integer NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`gatewayTransactionId` text,
	`payoutReference` text,
	`payoutTransactionId` text,
	`payoutAttemptedAt` integer,
	`failureNote` text,
	`reviewedBy` integer,
	`reviewedAt` integer,
	`reviewNote` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `agronex_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agronex_payment_provider_check" CHECK("agronex_payment_requests"."provider" IN ('orange', 'airtel', 'afrimoney', 'mpesa')),
	CONSTRAINT "agronex_payment_method_check" CHECK("agronex_payment_requests"."paymentMethod" IN ('manual')),
	CONSTRAINT "agronex_payment_farmer_payout_provider_check" CHECK("agronex_payment_requests"."farmerPayoutProvider" IS NULL OR "agronex_payment_requests"."farmerPayoutProvider" IN ('mpesa', 'airtel')),
	CONSTRAINT "agronex_payment_status_check" CHECK("agronex_payment_requests"."status" IN ('pending', 'awaiting_payment', 'payout_pending', 'approved', 'rejected', 'refund_required', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agx_payment_provider_ref_uq` ON `agronex_payment_requests` (`provider`,`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `agx_payment_order_uq` ON `agronex_payment_requests` (`orderId`);--> statement-breakpoint
CREATE UNIQUE INDEX `agx_payment_payout_reference_uq` ON `agronex_payment_requests` (`payoutReference`);--> statement-breakpoint
CREATE INDEX `agx_payment_status_created_idx` ON `agronex_payment_requests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agx_payment_farmer_idx` ON `agronex_payment_requests` (`farmerId`,`status`);--> statement-breakpoint
CREATE TABLE `agronex_payment_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`automaticEnabled` integer DEFAULT false NOT NULL,
	`mpesaName` text,
	`mpesaPhone` text,
	`airtelName` text,
	`airtelPhone` text,
	`orangeName` text,
	`orangePhone` text,
	`afrimoneyName` text,
	`afrimoneyPhone` text,
	`updatedBy` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `agronex_payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`farmerId` integer NOT NULL,
	`paymentRequestId` text,
	`farmerName` text NOT NULL,
	`amount` integer NOT NULL,
	`provider` text NOT NULL,
	`phone` text NOT NULL,
	`method` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requestedAt` integer NOT NULL,
	`reviewedBy` integer,
	`reviewedAt` integer,
	`payoutReference` text,
	`gatewayTransactionId` text,
	`note` text,
	FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paymentRequestId`) REFERENCES `agronex_payment_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agronex_payout_provider_check" CHECK("agronex_payout_requests"."provider" IN ('orange', 'airtel', 'afrimoney', 'mpesa')),
	CONSTRAINT "agronex_payout_method_check" CHECK("agronex_payout_requests"."method" IN ('manual')),
	CONSTRAINT "agronex_payout_status_check" CHECK("agronex_payout_requests"."status" IN ('pending', 'paid', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `agx_payout_status_time_idx` ON `agronex_payout_requests` (`status`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `agx_payout_farmer_idx` ON `agronex_payout_requests` (`farmerId`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agx_payout_provider_ref_uq` ON `agronex_payout_requests` (`provider`,`payoutReference`);--> statement-breakpoint
CREATE UNIQUE INDEX `agx_auto_payout_payment_uq` ON `agronex_payout_requests` (`paymentRequestId`);--> statement-breakpoint
CREATE TABLE `agronex_phone_verifications` (
	`userId` integer PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`codeHash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expiresAt` integer NOT NULL,
	`verifiedAt` integer,
	`consumedAt` integer,
	`lastSentAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agronex_phone_verification_phone_idx` ON `agronex_phone_verifications` (`phone`);--> statement-breakpoint
CREATE TABLE `agronex_post_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`authorId` integer NOT NULL,
	`body` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agronex_comment_post_created_idx` ON `agronex_post_comments` (`postId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agronex_post_likes` (
	`postId` text NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`postId`, `userId`),
	FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agronex_like_user_idx` ON `agronex_post_likes` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agronex_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`farmerId` integer NOT NULL,
	`farmerName` text NOT NULL,
	`title` text NOT NULL,
	`qty` integer NOT NULL,
	`unit` text NOT NULL,
	`price` integer NOT NULL,
	`location` text NOT NULL,
	`photoUrl` text,
	`status` text DEFAULT 'disponible' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agronex_posts_status_check" CHECK("agronex_posts"."status" IN ('disponible', 'reserve'))
);
--> statement-breakpoint
CREATE TABLE `agronex_profiles` (
	`userId` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatarUrl` text,
	`bio` text DEFAULT '' NOT NULL,
	`phone` text,
	`phoneVerifiedAt` integer,
	`location` text NOT NULL,
	`role` text NOT NULL,
	`payoutProvider` text,
	`payoutPhone` text,
	`payoutUpdatedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agronex_profiles_role_check" CHECK("agronex_profiles"."role" IN ('agriculteur', 'acheteur', 'transporteur', 'investisseur')),
	CONSTRAINT "agronex_profiles_payout_provider_check" CHECK("agronex_profiles"."payoutProvider" IS NULL OR "agronex_profiles"."payoutProvider" IN ('orange', 'airtel', 'afrimoney', 'mpesa'))
);
--> statement-breakpoint
CREATE TABLE `agronex_saved_posts` (
	`postId` text NOT NULL,
	`userId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`postId`, `userId`),
	FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agronex_saved_user_idx` ON `agronex_saved_posts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agronex_social_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipientId` integer NOT NULL,
	`actorId` integer,
	`postId` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actorId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agronex_social_notifications_kind_check" CHECK("agronex_social_notifications"."kind" IN ('follow', 'connection', 'connection_accepted', 'like', 'comment', 'repost'))
);
--> statement-breakpoint
CREATE INDEX `agronex_notifications_recipient_created_idx` ON `agronex_social_notifications` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agronex_social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`authorId` integer NOT NULL,
	`body` text NOT NULL,
	`mediaUrl` text,
	`sourcePostId` text,
	`kind` text DEFAULT 'post' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agronex_social_posts_kind_check" CHECK("agronex_social_posts"."kind" IN ('post', 'repost', 'quote')),
	CONSTRAINT "agronex_social_posts_visibility_check" CHECK("agronex_social_posts"."visibility" IN ('public', 'connections'))
);
--> statement-breakpoint
CREATE INDEX `agronex_social_author_created_idx` ON `agronex_social_posts` (`authorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_social_source_idx` ON `agronex_social_posts` (`sourcePostId`);--> statement-breakpoint
CREATE TABLE `agronex_social_settings` (
	`userId` integer PRIMARY KEY NOT NULL,
	`privateProfile` integer DEFAULT false NOT NULL,
	`allowConnectionRequests` integer DEFAULT true NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agronex_wallet_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`accountType` text NOT NULL,
	`userId` integer,
	`entryType` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`paymentRequestId` text,
	`payoutRequestId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`paymentRequestId`) REFERENCES `agronex_payment_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payoutRequestId`) REFERENCES `agronex_payout_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agronex_wallet_account_type_check" CHECK("agronex_wallet_entries"."accountType" IN ('farmer', 'platform')),
	CONSTRAINT "agronex_wallet_entry_type_check" CHECK("agronex_wallet_entries"."entryType" IN ('sale_credit', 'commission', 'payout')),
	CONSTRAINT "agronex_wallet_direction_check" CHECK("agronex_wallet_entries"."direction" IN ('credit', 'debit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agx_wallet_payment_account_uq` ON `agronex_wallet_entries` (`paymentRequestId`,`accountType`);--> statement-breakpoint
CREATE UNIQUE INDEX `agx_wallet_payout_account_uq` ON `agronex_wallet_entries` (`payoutRequestId`,`accountType`);--> statement-breakpoint
CREATE INDEX `agx_wallet_user_time_idx` ON `agronex_wallet_entries` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastSignedIn` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('user', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);