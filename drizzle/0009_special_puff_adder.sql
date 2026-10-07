ALTER TABLE `agronex_orders` MODIFY COLUMN `paymentStatus` enum('pending','awaiting_payment','payout_pending','approved','rejected','refund_required','refunded') NOT NULL DEFAULT 'approved';--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` MODIFY COLUMN `status` enum('pending','awaiting_payment','payout_pending','approved','rejected','refund_required','refunded') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `paymentMethod` enum('manual','maishapay') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `buyerPhone` varchar(48);--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `farmerPayoutProvider` enum('mpesa','airtel');--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `farmerPayoutPhone` varchar(48);--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `gatewayTransactionId` varchar(100);--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `payoutReference` varchar(120);--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `payoutTransactionId` varchar(100);--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `payoutAttemptedAt` bigint;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD `failureNote` varchar(400);--> statement-breakpoint
ALTER TABLE `agronex_payment_settings` ADD `automaticEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD `paymentRequestId` varchar(36);--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD `method` enum('manual','maishapay') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD `gatewayTransactionId` varchar(100);--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `payoutProvider` enum('mpesa','airtel');--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `payoutPhone` varchar(48);--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `payoutUpdatedAt` bigint;--> statement-breakpoint
ALTER TABLE `agronex_payment_requests` ADD CONSTRAINT `agx_payment_payout_reference_uq` UNIQUE(`payoutReference`);--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD CONSTRAINT `agx_auto_payout_payment_uq` UNIQUE(`paymentRequestId`);--> statement-breakpoint
ALTER TABLE `agronex_payout_requests` ADD CONSTRAINT `agx_payout_payment_fk` FOREIGN KEY (`paymentRequestId`) REFERENCES `agronex_payment_requests`(`id`) ON DELETE restrict ON UPDATE no action;
