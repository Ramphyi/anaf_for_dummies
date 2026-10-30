CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`user_id` text,
	`user_name` text,
	`entity` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_company` ON `activity_log` (`company_id`);--> statement-breakpoint
CREATE TABLE `allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`member_id` text NOT NULL,
	`project_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`hours_per_day` real DEFAULT 8 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alloc_member` ON `allocations` (`company_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `anaf_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`environment` text DEFAULT 'simulation' NOT NULL,
	`client_id` text,
	`client_secret` text,
	`redirect_uri` text,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`connected_at` integer,
	`oauth_state` text,
	`last_sync_at` integer,
	`auto_sync` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anaf_connections_company_id_unique` ON `anaf_connections` (`company_id`);--> statement-breakpoint
CREATE TABLE `anaf_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`action` text NOT NULL,
	`environment` text NOT NULL,
	`success` integer DEFAULT true NOT NULL,
	`request` text,
	`response` text,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `anaf_logs_company` ON `anaf_logs` (`company_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cui` text NOT NULL,
	`reg_com` text,
	`vat_payer` integer DEFAULT true NOT NULL,
	`vat_on_collection` integer DEFAULT false NOT NULL,
	`address` text,
	`city` text,
	`county` text,
	`country` text DEFAULT 'RO' NOT NULL,
	`postal_code` text,
	`iban` text,
	`bank` text,
	`email` text,
	`phone` text,
	`website` text,
	`share_capital` text,
	`logo_data_url` text,
	`default_currency` text DEFAULT 'RON' NOT NULL,
	`default_vat_rate` real DEFAULT 21 NOT NULL,
	`default_due_days` integer DEFAULT 15 NOT NULL,
	`invoice_footer` text,
	`brand_color` text DEFAULT '#6d5dfc' NOT NULL,
	`smtp_host` text,
	`smtp_port` integer,
	`smtp_user` text,
	`smtp_pass` text,
	`smtp_from` text,
	`smtp_secure` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`description` text,
	`unit` text DEFAULT 'buc' NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`vat_rate` real DEFAULT 21 NOT NULL,
	`vat_category` text DEFAULT 'S' NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `document_lines_doc` ON `document_lines` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_series` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`prefix` text NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`padding` integer DEFAULT 4 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`is_credit_note` integer DEFAULT false NOT NULL,
	`series_id` text,
	`series` text NOT NULL,
	`number` integer NOT NULL,
	`full_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`partner_id` text,
	`client_name` text NOT NULL,
	`client_cui` text,
	`client_reg_com` text,
	`client_vat_payer` integer DEFAULT false NOT NULL,
	`client_entity_type` text DEFAULT 'pj' NOT NULL,
	`client_address` text,
	`client_city` text,
	`client_county` text,
	`client_country` text DEFAULT 'RO' NOT NULL,
	`client_email` text,
	`issue_date` text NOT NULL,
	`due_date` text,
	`delivery_date` text,
	`currency` text DEFAULT 'RON' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount_total` real DEFAULT 0 NOT NULL,
	`vat_total` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`notes` text,
	`internal_notes` text,
	`issued_by` text,
	`issuer_cnp` text,
	`delegate_name` text,
	`delegate_id_card` text,
	`transport_means` text,
	`warehouse_id` text,
	`related_document_id` text,
	`project_id` text,
	`recurring_id` text,
	`vat_on_collection` integer DEFAULT false NOT NULL,
	`efactura_status` text DEFAULT 'none' NOT NULL,
	`efactura_upload_id` text,
	`efactura_download_id` text,
	`efactura_message` text,
	`efactura_sent_at` integer,
	`efactura_xml` text,
	`sent_by_email_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_company_kind` ON `documents` (`company_id`,`kind`);--> statement-breakpoint
CREATE INDEX `documents_partner` ON `documents` (`partner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_number_unique` ON `documents` (`company_id`,`kind`,`series`,`number`);--> statement-breakpoint
CREATE TABLE `etransport_declarations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`operation_type` text DEFAULT '30' NOT NULL,
	`uit` text,
	`upload_id` text,
	`partner_id` text,
	`partner_name` text,
	`vehicle_number` text,
	`trailer1` text,
	`carrier_name` text,
	`carrier_cui` text,
	`transport_date` text NOT NULL,
	`start_county` text,
	`start_city` text,
	`start_address` text,
	`end_county` text,
	`end_city` text,
	`end_address` text,
	`document_id` text,
	`document_number` text,
	`items` text NOT NULL,
	`xml` text,
	`message` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_unique` ON `exchange_rates` (`date`,`currency`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`team_member_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_company` ON `memberships` (`user_id`,`company_id`);--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text DEFAULT 'client' NOT NULL,
	`entity_type` text DEFAULT 'pj' NOT NULL,
	`name` text NOT NULL,
	`cui` text,
	`reg_com` text,
	`vat_payer` integer DEFAULT false NOT NULL,
	`address` text,
	`city` text,
	`county` text,
	`country` text DEFAULT 'RO' NOT NULL,
	`postal_code` text,
	`email` text,
	`phone` text,
	`iban` text,
	`bank` text,
	`contact_person` text,
	`payment_term_days` integer,
	`default_currency` text,
	`notes` text,
	`e_invoice_registered` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `partners_company` ON `partners` (`company_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`direction` text DEFAULT 'in' NOT NULL,
	`document_id` text,
	`purchase_invoice_id` text,
	`partner_id` text,
	`partner_name` text,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'RON' NOT NULL,
	`method` text DEFAULT 'bank' NOT NULL,
	`reference` text,
	`receipt_series` text,
	`receipt_number` integer,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_company` ON `payments` (`company_id`);--> statement-breakpoint
CREATE INDEX `payments_doc` ON `payments` (`document_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'service' NOT NULL,
	`unit` text DEFAULT 'buc' NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RON' NOT NULL,
	`vat_rate` real DEFAULT 21 NOT NULL,
	`vat_category` text DEFAULT 'S' NOT NULL,
	`price_includes_vat` integer DEFAULT false NOT NULL,
	`track_stock` integer DEFAULT false NOT NULL,
	`purchase_price` real,
	`nc_code` text,
	`barcode` text,
	`category` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_company` ON `products` (`company_id`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text,
	`hourly_rate` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_member_unique` ON `project_members` (`project_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`code` text,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`billing_type` text DEFAULT 'time_materials' NOT NULL,
	`hourly_rate` real,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`budget_hours` real,
	`budget_amount` real,
	`monthly_retainer` real,
	`start_date` text,
	`end_date` text,
	`color` text DEFAULT '#6d5dfc' NOT NULL,
	`manager_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`supplier_id` text,
	`supplier_name` text NOT NULL,
	`supplier_cui` text,
	`number` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text,
	`currency` text DEFAULT 'RON' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`vat_total` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`category` text DEFAULT 'altele' NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`spv_message_id` text,
	`xml` text,
	`stock_received` integer DEFAULT false NOT NULL,
	`project_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_company` ON `purchase_invoices` (`company_id`);--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_invoice_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`unit` text DEFAULT 'buc' NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`vat_rate` real DEFAULT 21 NOT NULL,
	`net_amount` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`partner_id` text NOT NULL,
	`series_id` text,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`next_run_date` text NOT NULL,
	`end_date` text,
	`due_days` integer DEFAULT 15 NOT NULL,
	`currency` text DEFAULT 'RON' NOT NULL,
	`lines` text NOT NULL,
	`notes` text,
	`auto_issue` integer DEFAULT true NOT NULL,
	`auto_send_email` integer DEFAULT false NOT NULL,
	`auto_send_efactura` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`generated_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spv_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`anaf_id` text NOT NULL,
	`request_id` text,
	`type` text NOT NULL,
	`cif` text,
	`details` text,
	`anaf_created_at` text,
	`issuer_cui` text,
	`receiver_cui` text,
	`downloaded` integer DEFAULT false NOT NULL,
	`xml` text,
	`signature_xml` text,
	`purchase_invoice_id` text,
	`document_id` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spv_unique` ON `spv_messages` (`company_id`,`anaf_id`);--> statement-breakpoint
CREATE TABLE `stock_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`target_warehouse_id` text,
	`partner_id` text,
	`purchase_invoice_id` text,
	`document_id` text,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`stock_document_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` real DEFAULT 0 NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_mov_product` ON `stock_movements` (`company_id`,`product_id`,`warehouse_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee_id` text,
	`estimate_hours` real,
	`due_date` text,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`position` text,
	`department` text,
	`seniority` text DEFAULT 'mid' NOT NULL,
	`employment_type` text DEFAULT 'cim' NOT NULL,
	`hourly_cost` real DEFAULT 0 NOT NULL,
	`hourly_rate` real DEFAULT 0 NOT NULL,
	`rate_currency` text DEFAULT 'EUR' NOT NULL,
	`weekly_capacity` real DEFAULT 40 NOT NULL,
	`color` text DEFAULT '#6d5dfc' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`start_date` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`member_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`date` text NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`description` text,
	`billable` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`rejection_reason` text,
	`approved_by` text,
	`approved_at` integer,
	`invoiced_document_id` text,
	`timer_started_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_member_date` ON `time_entries` (`company_id`,`member_id`,`date`);--> statement-breakpoint
CREATE INDEX `time_project` ON `time_entries` (`project_id`);--> statement-breakpoint
CREATE TABLE `time_off` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`member_id` text NOT NULL,
	`type` text DEFAULT 'vacation' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`avatar_color` text DEFAULT '#6d5dfc' NOT NULL,
	`last_company_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
