CREATE TABLE `agronex_messages` (
	`id` varchar(36) NOT NULL,
	`fromId` int NOT NULL,
	`fromName` varchar(160) NOT NULL,
	`toId` int NOT NULL,
	`toName` varchar(160) NOT NULL,
	`text` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_orders` (
	`id` varchar(36) NOT NULL,
	`postId` varchar(36) NOT NULL,
	`postTitle` varchar(180) NOT NULL,
	`farmerId` int NOT NULL,
	`farmerName` varchar(160) NOT NULL,
	`pickup` varchar(160) NOT NULL,
	`buyerId` int NOT NULL,
	`buyerName` varchar(160) NOT NULL,
	`buyerLocation` varchar(160) NOT NULL,
	`qty` int NOT NULL,
	`unit` varchar(24) NOT NULL,
	`status` enum('a_transporter','en_transport','livree') NOT NULL DEFAULT 'a_transporter',
	`transporterId` int,
	`transporterName` varchar(160),
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_posts` (
	`id` varchar(36) NOT NULL,
	`farmerId` int NOT NULL,
	`farmerName` varchar(160) NOT NULL,
	`title` varchar(180) NOT NULL,
	`qty` int NOT NULL,
	`unit` varchar(24) NOT NULL,
	`price` int NOT NULL,
	`location` varchar(160) NOT NULL,
	`photoUrl` text,
	`status` enum('disponible','reserve') NOT NULL DEFAULT 'disponible',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_profiles` (
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(48),
	`location` varchar(160) NOT NULL,
	`role` enum('agriculteur','acheteur','transporteur','investisseur') NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `agronex_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `agronex_messages` ADD CONSTRAINT `agronex_messages_fromId_agronex_profiles_userId_fk` FOREIGN KEY (`fromId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_messages` ADD CONSTRAINT `agronex_messages_toId_agronex_profiles_userId_fk` FOREIGN KEY (`toId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD CONSTRAINT `agronex_orders_postId_agronex_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD CONSTRAINT `agronex_orders_farmerId_agronex_profiles_userId_fk` FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD CONSTRAINT `agronex_orders_buyerId_agronex_profiles_userId_fk` FOREIGN KEY (`buyerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_orders` ADD CONSTRAINT `agronex_orders_transporterId_agronex_profiles_userId_fk` FOREIGN KEY (`transporterId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_posts` ADD CONSTRAINT `agronex_posts_farmerId_agronex_profiles_userId_fk` FOREIGN KEY (`farmerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD CONSTRAINT `agronex_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;