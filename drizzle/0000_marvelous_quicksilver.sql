CREATE TABLE `workspace_state` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
