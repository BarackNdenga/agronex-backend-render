CREATE TABLE `agronex_admin_invitations` (
	`id` varchar(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`expiresAt` bigint NOT NULL,
	`redeemedAt` bigint,
	`redeemedBy` int,
	`revokedAt` bigint,
	CONSTRAINT `agronex_admin_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `agronex_admin_invitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `agronex_admin_invitations` ADD CONSTRAINT `agronex_admin_invitations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_admin_invitations` ADD CONSTRAINT `agronex_admin_invitations_redeemedBy_users_id_fk` FOREIGN KEY (`redeemedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agronex_admin_invite_email_idx` ON `agronex_admin_invitations` (`email`);