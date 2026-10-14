CREATE TABLE `dumps` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_text` text NOT NULL,
	`title` text,
	`summary` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`model_used` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`dump_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` text,
	`due_time` text,
	`due_source` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source_quote` text,
	`status` text DEFAULT 'open' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`dump_id`) REFERENCES `dumps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `items_dump_id_idx` ON `items` (`dump_id`);--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_item_id_idx` ON `subtasks` (`item_id`);