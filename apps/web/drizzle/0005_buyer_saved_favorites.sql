-- Buyer profile, saved searches, favorites (boat-search retention loop)

CREATE TABLE IF NOT EXISTS `buyer_profiles` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `data_json` text NOT NULL DEFAULT '{}',
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `saved_searches` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `filter_json` text NOT NULL,
  `frequency` text NOT NULL DEFAULT 'daily',
  `paused` integer NOT NULL DEFAULT 0,
  `last_notified_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_saved_searches_user_id` ON `saved_searches` (`user_id`);

CREATE TABLE IF NOT EXISTS `boat_favorites` (
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `boat_id` integer NOT NULL REFERENCES `boats` (`id`) ON DELETE CASCADE,
  `created_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `boat_id`)
);

CREATE INDEX IF NOT EXISTS `idx_boat_favorites_user_id` ON `boat_favorites` (`user_id`);
