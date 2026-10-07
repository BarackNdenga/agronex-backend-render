CREATE TABLE `agronex_payment_requests` (
	`id` varchar(36) NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`buyerId` int NOT NULL,
	`farmerId` int NOT NULL,
	`buyerName` varchar(160) NOT NULL,
	`farmerName` varchar(160) NOT NULL,
	`postTitle` varchar(180) NOT NULL,
	`provider` enum('mpesa','airtel') NOT NULL,
	`grossAmount` bigint NOT NULL,
	`commissionAmount` bigint NOT NULL,
	`farmerAmount` bigint NOT NULL,
	`reference` varchar(120) NOT NULL,
	`status` enum('pending','approved','rejected','refund_required','refunded') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` bigint,
	`reviewNote` varchar(400),
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_payment_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `agx_payment_provider_ref_uq` UNIQUE(`provider`,`reference`),
	CONSTRAINT `agx_payment_order_uq` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `agronex_payment_settings` (
	`id` int NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT false,
	`mpesaName` varchar(100),
	`mpesaPhone` varchar(48),
	`airtelName` varchar(100),
	`airtelPhone` varchar(48),
	`updatedBy` int,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `agronex_payment_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_payout_requests` (
	`id` varchar(36) NOT NULL,
	`farmerId` int NOT NULL,
	`farmerName` varchar(160) NOT NULL,
	`amount` bigint NOT NULL,
	`provider` enum('mpesa','airtel') NOT NULL,
	`phone` varchar(48) NOT NULL,
	`status` enum('pending','paid','rejected') NOT NULL DEFAULT 'pending',
	`requestedAt` bigint NOT NULL,
	`reviewedBy` int,
	`reviewedAt` bigint,
	`payoutReference` varchar(120),
	`note` varchar(400),
	CONSTRAINT `agronex_payout_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_wallet_entries` (
	`id` varchar(36) NOT NULL,
	`accountType` enum('farmer','platform') NOT NULL,
	`userId` int,
	`entryType` enum('sale_credit','commission','payout') NOT NULL,
	`direction` enum('credit','debit') NOT NULL,
	`amount` bigint NOT NULL,
	`paymentRequestId` varchar(36),
	`payoutRequestId` varchar(36),
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_wallet_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `agx_wallet_payment_account_uq` UNIQUE(`paymentRequestId`,`accountType`),
	CONSTRAINT `agx_wallet_payout_account_uq` UNIQUE(`payoutRequestId`,`accountType`)
);
--> statement-breakpoint
ALTER TABLE `agronex_orders` MODIFY COLUMN `status` enum('a_transporter','en_transport','livree','annulee') NOT NULL DEFAULT 'a_transporter';--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD `unitPrice` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD `grossAmount` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD `paymentStatus` enum('pending','approved','rejected','refund_required','refunded') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD CONSTRAINT `agronex_payment_requests_orderId_agronex_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `agronex_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD CONSTRAINT `agronex_payment_requests_buyerId_agronex_profiles_userId_fk` FOREIGN KEY (`buyerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD CONSTRAINT `agronex_payment_requests_farmerId_agronex_profiles_userId_fk` FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD CONSTRAINT `agronex_payment_requests_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payment_settings` ADD CONSTRAINT `agronex_payment_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD CONSTRAINT `agronex_payout_requests_farmerId_agronex_profiles_userId_fk` FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD CONSTRAINT `agronex_payout_requests_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_wallet_entries` ADD CONSTRAINT `agronex_wallet_entries_userId_agronex_profiles_userId_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_wallet_entries` ADD CONSTRAINT `agx_wallet_payment_fk` FOREIGN KEY (`paymentRequestId`) REFERENCES `agronex_payment_requests`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_wallet_entries` ADD CONSTRAINT `agx_wallet_payout_fk` FOREIGN KEY (`payoutRequestId`) REFERENCES `agronex_payout_requests`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agx_payment_status_created_idx` ON `agronex_payment_requests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agx_payment_farmer_idx` ON `agronex_payment_requests` (`farmerId`,`status`);--> statement-breakpoint
CREATE INDEX `agx_payout_status_time_idx` ON `agronex_payout_requests` (`status`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `agx_payout_farmer_idx` ON `agronex_payout_requests` (`farmerId`,`status`);--> statement-breakpoint
CREATE INDEX `agx_wallet_user_time_idx` ON `agronex_wallet_entries` (`userId`,`createdAt`);