-- Boats, crawl jobs, and xAI analyses tables

CREATE TABLE IF NOT EXISTS `boats` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `listing_id` text,
  `source` text NOT NULL DEFAULT 'boats.com',
  `url` text NOT NULL,
  `make` text,
  `model` text,
  `year` integer,
  `length` text,
  `price` text,
  `currency` text DEFAULT 'USD',
  `location` text,
  `city` text,
  `state` text,
  `country` text DEFAULT 'US',
  `description` text,
  `seller_type` text,
  `listing_type` text,
  `images` text,
  `full_text` text,
  `scraped_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `search_length_min` integer,
  `search_length_max` integer,
  `search_type` text,
  `search_location` text
);

CREATE INDEX IF NOT EXISTS `idx_boats_listing_id` ON `boats` (`listing_id`);
CREATE INDEX IF NOT EXISTS `idx_boats_url` ON `boats` (`url`);
CREATE INDEX IF NOT EXISTS `idx_boats_make_model` ON `boats` (`make`, `model`);
CREATE INDEX IF NOT EXISTS `idx_boats_year` ON `boats` (`year`);
CREATE INDEX IF NOT EXISTS `idx_boats_price` ON `boats` (`price`);
CREATE INDEX IF NOT EXISTS `idx_boats_state` ON `boats` (`state`);

CREATE TABLE IF NOT EXISTS `crawl_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `search_url` text NOT NULL,
  `status` text NOT NULL DEFAULT 'running',
  `boats_found` integer DEFAULT 0,
  `boats_scraped` integer DEFAULT 0,
  `started_at` text NOT NULL,
  `completed_at` text,
  `error` text
);

CREATE TABLE IF NOT EXISTS `xai_analyses` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `boat_ids` text,
  `prompt` text NOT NULL,
  `response` text NOT NULL,
  `model` text NOT NULL DEFAULT 'grok-3-mini',
  `category` text,
  `tokens_used` integer,
  `created_at` text NOT NULL
);
