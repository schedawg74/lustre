CREATE TABLE `lists` (
	`created_at` integer NOT NULL,
	`first_reported_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`last_reported_at` integer NOT NULL,
	`name` text,
	`owner_screen_name` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`account_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`install_id` text NOT NULL,
	`list_id` text,
	`reported_at` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`install_id`) REFERENCES `installs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reports_action_check" CHECK("__new_reports"."action" in ('block', 'mute')),
	CONSTRAINT "reports_source_check" CHECK("__new_reports"."source" in ('list', 'post'))
);
--> statement-breakpoint
-- Version 0 stored the source as `list:<list id>` or `post`.
INSERT INTO `lists`("created_at", "first_reported_at", "id", "last_reported_at", "updated_at") SELECT min("created_at"), min("reported_at"), substr("source", 6), max("reported_at"), max("created_at") FROM `reports` WHERE "source" LIKE 'list:%' GROUP BY substr("source", 6);--> statement-breakpoint
INSERT INTO `__new_reports`("account_id", "action", "created_at", "id", "install_id", "list_id", "reported_at", "source") SELECT "account_id", "action", "created_at", "id", "install_id", CASE WHEN "source" LIKE 'list:%' THEN substr("source", 6) END, "reported_at", CASE WHEN "source" LIKE 'list:%' THEN 'list' ELSE "source" END FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `reports_install_account_action_idx` ON `reports` (`install_id`,`account_id`,`action`);--> statement-breakpoint
CREATE INDEX `reports_account_id_idx` ON `reports` (`account_id`);--> statement-breakpoint
CREATE INDEX `reports_list_id_idx` ON `reports` (`list_id`);