CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`screen_name` text NOT NULL,
	`name` text NOT NULL,
	`first_reported_at` integer NOT NULL,
	`last_reported_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_last_reported_at_idx` ON `accounts` (`last_reported_at`);--> statement-breakpoint
CREATE TABLE `installs` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installs_token_hash_idx` ON `installs` (`token_hash`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY NOT NULL,
	`install_id` text NOT NULL,
	`account_id` text NOT NULL,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`reported_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`install_id`) REFERENCES `installs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_action_check" CHECK("reports"."action" in ('block', 'mute'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_install_account_action_idx` ON `reports` (`install_id`,`account_id`,`action`);--> statement-breakpoint
CREATE INDEX `reports_account_id_idx` ON `reports` (`account_id`);