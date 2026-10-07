CREATE TABLE `agronex_otp_rate_limits` (
	`bucketHash` varchar(64) NOT NULL,
	`windowStartedAt` bigint NOT NULL,
	`sends` int NOT NULL DEFAULT 0,
	`lastSentAt` bigint NOT NULL,
	CONSTRAINT `agronex_otp_rate_limits_bucketHash` PRIMARY KEY(`bucketHash`)
);
--> statement-breakpoint
CREATE TABLE `agronex_phone_verifications` (
	`userId` int NOT NULL,
	`phone` varchar(48) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` bigint NOT NULL,
	`verifiedAt` bigint,
	`consumedAt` bigint,
	`lastSentAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_phone_verifications_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `phoneVerifiedAt` bigint;--> statement-breakpoint
ALTER TABLE `agronex_phone_verifications` ADD CONSTRAINT `agronex_phone_verifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agronex_phone_verification_phone_idx` ON `agronex_phone_verifications` (`phone`);