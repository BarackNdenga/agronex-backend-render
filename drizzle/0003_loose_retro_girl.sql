CREATE TABLE `agronex_connection_requests` (
	`id` varchar(36) NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `agronex_connection_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_follows` (
	`followerId` int NOT NULL,
	`followingId` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_follows_followerId_followingId_pk` PRIMARY KEY(`followerId`,`followingId`)
);
--> statement-breakpoint
CREATE TABLE `agronex_post_comments` (
	`id` varchar(36) NOT NULL,
	`postId` varchar(36) NOT NULL,
	`authorId` int NOT NULL,
	`body` varchar(1200) NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_post_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_post_likes` (
	`postId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_post_likes_postId_userId_pk` PRIMARY KEY(`postId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `agronex_saved_posts` (
	`postId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_saved_posts_postId_userId_pk` PRIMARY KEY(`postId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `agronex_social_notifications` (
	`id` varchar(36) NOT NULL,
	`recipientId` int NOT NULL,
	`actorId` int,
	`postId` varchar(36),
	`kind` enum('follow','connection','connection_accepted','like','comment','repost') NOT NULL,
	`message` varchar(240) NOT NULL,
	`readAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_social_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_social_posts` (
	`id` varchar(36) NOT NULL,
	`authorId` int NOT NULL,
	`body` text NOT NULL,
	`mediaUrl` text,
	`sourcePostId` varchar(36),
	`kind` enum('post','repost','quote') NOT NULL DEFAULT 'post',
	`visibility` enum('public','connections') NOT NULL DEFAULT 'public',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `agronex_social_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agronex_social_settings` (
	`userId` int NOT NULL,
	`privateProfile` boolean NOT NULL DEFAULT false,
	`allowConnectionRequests` boolean NOT NULL DEFAULT true,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `agronex_social_settings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `agronex_profiles` ADD `bio` varchar(240) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agronex_connection_requests` ADD CONSTRAINT `agronex_connection_requests_senderId_agronex_profiles_userId_fk` FOREIGN KEY (`senderId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_connection_requests` ADD CONSTRAINT `agronex_connection_requests_recipientId_agronex_profiles_userId_fk` FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_follows` ADD CONSTRAINT `agronex_follows_followerId_agronex_profiles_userId_fk` FOREIGN KEY (`followerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_follows` ADD CONSTRAINT `agronex_follows_followingId_agronex_profiles_userId_fk` FOREIGN KEY (`followingId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_comments` ADD CONSTRAINT `agronex_post_comments_postId_agronex_social_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_comments` ADD CONSTRAINT `agronex_post_comments_authorId_agronex_profiles_userId_fk` FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_likes` ADD CONSTRAINT `agronex_post_likes_postId_agronex_social_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_likes` ADD CONSTRAINT `agronex_post_likes_userId_agronex_profiles_userId_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` ADD CONSTRAINT `agronex_saved_posts_postId_agronex_social_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` ADD CONSTRAINT `agronex_saved_posts_userId_agronex_profiles_userId_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agronex_social_notifications_recipientId_agronex_profiles_userId_fk` FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agronex_social_notifications_actorId_agronex_profiles_userId_fk` FOREIGN KEY (`actorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agronex_social_notifications_postId_agronex_social_posts_id_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_posts` ADD CONSTRAINT `agronex_social_posts_authorId_agronex_profiles_userId_fk` FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_posts` ADD CONSTRAINT `agronex_social_posts_sourcePostId_agronex_social_posts_id_fk` FOREIGN KEY (`sourcePostId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_settings` ADD CONSTRAINT `agronex_social_settings_userId_agronex_profiles_userId_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agronex_connection_sender_recipient_idx` ON `agronex_connection_requests` (`senderId`,`recipientId`);--> statement-breakpoint
CREATE INDEX `agronex_connection_recipient_status_idx` ON `agronex_connection_requests` (`recipientId`,`status`);--> statement-breakpoint
CREATE INDEX `agronex_follow_target_idx` ON `agronex_follows` (`followingId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_comment_post_created_idx` ON `agronex_post_comments` (`postId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_like_user_idx` ON `agronex_post_likes` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_saved_user_idx` ON `agronex_saved_posts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_notifications_recipient_created_idx` ON `agronex_social_notifications` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_social_author_created_idx` ON `agronex_social_posts` (`authorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agronex_social_source_idx` ON `agronex_social_posts` (`sourcePostId`);