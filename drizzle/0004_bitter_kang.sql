ALTER TABLE `agronex_connection_requests` DROP FOREIGN KEY `agronex_connection_requests_senderId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_connection_requests` DROP FOREIGN KEY `agronex_connection_requests_recipientId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_follows` DROP FOREIGN KEY `agronex_follows_followerId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_follows` DROP FOREIGN KEY `agronex_follows_followingId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_post_comments` DROP FOREIGN KEY `agronex_post_comments_postId_agronex_social_posts_id_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_post_comments` DROP FOREIGN KEY `agronex_post_comments_authorId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_post_likes` DROP FOREIGN KEY `agronex_post_likes_postId_agronex_social_posts_id_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_post_likes` DROP FOREIGN KEY `agronex_post_likes_userId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` DROP FOREIGN KEY `agronex_saved_posts_postId_agronex_social_posts_id_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` DROP FOREIGN KEY `agronex_saved_posts_userId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` DROP FOREIGN KEY `agronex_social_notifications_recipientId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` DROP FOREIGN KEY `agronex_social_notifications_actorId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` DROP FOREIGN KEY `agronex_social_notifications_postId_agronex_social_posts_id_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_posts` DROP FOREIGN KEY `agronex_social_posts_authorId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_posts` DROP FOREIGN KEY `agronex_social_posts_sourcePostId_agronex_social_posts_id_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_social_settings` DROP FOREIGN KEY `agronex_social_settings_userId_agronex_profiles_userId_fk`;
--> statement-breakpoint
ALTER TABLE `agronex_connection_requests` ADD CONSTRAINT `agx_conn_sender_fk` FOREIGN KEY (`senderId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_connection_requests` ADD CONSTRAINT `agx_conn_recipient_fk` FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_follows` ADD CONSTRAINT `agx_follow_actor_fk` FOREIGN KEY (`followerId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_follows` ADD CONSTRAINT `agx_follow_target_fk` FOREIGN KEY (`followingId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_comments` ADD CONSTRAINT `agx_comment_post_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_comments` ADD CONSTRAINT `agx_comment_author_fk` FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_likes` ADD CONSTRAINT `agx_like_post_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_post_likes` ADD CONSTRAINT `agx_like_user_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` ADD CONSTRAINT `agx_saved_post_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_saved_posts` ADD CONSTRAINT `agx_saved_user_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agx_notify_recipient_fk` FOREIGN KEY (`recipientId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agx_notify_actor_fk` FOREIGN KEY (`actorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_notifications` ADD CONSTRAINT `agx_notify_post_fk` FOREIGN KEY (`postId`) REFERENCES `agronex_social_posts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_posts` ADD CONSTRAINT `agx_sp_author_fk` FOREIGN KEY (`authorId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agronex_social_settings` ADD CONSTRAINT `agx_social_settings_user_fk` FOREIGN KEY (`userId`) REFERENCES `agronex_profiles`(`userId`) ON DELETE cascade ON UPDATE no action;