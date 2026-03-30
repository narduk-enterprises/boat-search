CREATE TABLE IF NOT EXISTS `crawl_job_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `crawl_job_id` integer NOT NULL,
  `event_type` text NOT NULL,
  `status` text NOT NULL,
  `message` text,
  `page_number` integer,
  `search_url` text,
  `payload_json` text,
  `created_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_crawl_job_events_job_created_at`
  ON `crawl_job_events` (`crawl_job_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_events_created_at`
  ON `crawl_job_events` (`created_at`);

CREATE TABLE IF NOT EXISTS `crawl_job_listings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `crawl_job_id` integer NOT NULL,
  `identity_key` text NOT NULL,
  `source` text NOT NULL,
  `listing_id` text,
  `listing_url` text,
  `detail_url` text,
  `discovered_on_page` integer,
  `first_seen_at` text NOT NULL,
  `last_updated_at` text NOT NULL,
  `duplicate_decision` text NOT NULL,
  `detail_status` text NOT NULL,
  `detail_attempts` integer NOT NULL DEFAULT 0,
  `retry_queued` integer NOT NULL DEFAULT 0,
  `persistence_status` text NOT NULL DEFAULT 'not_attempted',
  `persisted_boat_id` integer,
  `final_image_count` integer,
  `final_has_structured_details` integer NOT NULL DEFAULT 0,
  `weak_fingerprint` integer NOT NULL DEFAULT 0,
  `error_message` text,
  `audit_json` text
);

CREATE UNIQUE INDEX IF NOT EXISTS `uidx_crawl_job_listings_job_identity`
  ON `crawl_job_listings` (`crawl_job_id`, `identity_key`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_listings_job_updated_at`
  ON `crawl_job_listings` (`crawl_job_id`, `last_updated_at`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_listings_detail_status`
  ON `crawl_job_listings` (`detail_status`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_listings_persistence_status`
  ON `crawl_job_listings` (`persistence_status`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_listings_weak_fingerprint`
  ON `crawl_job_listings` (`weak_fingerprint`);
CREATE INDEX IF NOT EXISTS `idx_crawl_job_listings_first_seen_at`
  ON `crawl_job_listings` (`first_seen_at`);
