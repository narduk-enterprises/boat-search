CREATE TABLE IF NOT EXISTS `scraper_pipelines` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `name` text NOT NULL,
  `boat_source` text NOT NULL,
  `description` text,
  `config_json` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_run_at` text
);

CREATE INDEX IF NOT EXISTS `idx_scraper_pipelines_active` ON `scraper_pipelines` (`active`);
CREATE INDEX IF NOT EXISTS `idx_scraper_pipelines_source` ON `scraper_pipelines` (`boat_source`);

ALTER TABLE `crawl_jobs` ADD COLUMN `pipeline_id` integer;
ALTER TABLE `crawl_jobs` ADD COLUMN `pipeline_name` text;
ALTER TABLE `crawl_jobs` ADD COLUMN `run_mode` text NOT NULL DEFAULT 'manual';
ALTER TABLE `crawl_jobs` ADD COLUMN `pages_visited` integer DEFAULT 0;
ALTER TABLE `crawl_jobs` ADD COLUMN `result_json` text;
