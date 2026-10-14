CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `google_event_id` text;