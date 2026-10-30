ALTER TABLE `documents` ADD `efactura_environment` text;--> statement-breakpoint
-- Facturile deja transmise primesc mediul conexiunii ANAF a firmei (până acum: simulare, dacă nu s-a configurat altfel).
UPDATE `documents` SET `efactura_environment` = (SELECT `environment` FROM `anaf_connections` WHERE `anaf_connections`.`company_id` = `documents`.`company_id`) WHERE `efactura_upload_id` IS NOT NULL;
