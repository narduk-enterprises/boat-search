ALTER TABLE `boats` ADD COLUMN `normalized_location` text;
ALTER TABLE `boats` ADD COLUMN `normalized_city` text;
ALTER TABLE `boats` ADD COLUMN `normalized_state` text;
ALTER TABLE `boats` ADD COLUMN `normalized_country` text;
ALTER TABLE `boats` ADD COLUMN `geo_lat` real;
ALTER TABLE `boats` ADD COLUMN `geo_lng` real;
ALTER TABLE `boats` ADD COLUMN `geo_precision` text;
ALTER TABLE `boats` ADD COLUMN `geo_provider` text;
ALTER TABLE `boats` ADD COLUMN `geo_status` text;
ALTER TABLE `boats` ADD COLUMN `geo_query` text;
ALTER TABLE `boats` ADD COLUMN `geo_error` text;
ALTER TABLE `boats` ADD COLUMN `geo_updated_at` text;
ALTER TABLE `boats` ADD COLUMN `geo_normalization_version` integer;

CREATE INDEX IF NOT EXISTS `idx_boats_normalized_state` ON `boats` (`normalized_state`);
CREATE INDEX IF NOT EXISTS `idx_boats_geo_status` ON `boats` (`geo_status`);
CREATE INDEX IF NOT EXISTS `idx_boats_geo_query` ON `boats` (`geo_query`);

CREATE TABLE IF NOT EXISTS `geocode_cache` (
  `query` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `precision` text NOT NULL,
  `status` text NOT NULL,
  `lat` real,
  `lng` real,
  `error` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_geocode_cache_status` ON `geocode_cache` (`status`);
CREATE INDEX IF NOT EXISTS `idx_geocode_cache_updated_at` ON `geocode_cache` (`updated_at`);
