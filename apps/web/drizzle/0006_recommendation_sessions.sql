-- Recommendation sessions and cached personalized boat fit summaries

CREATE TABLE IF NOT EXISTS `recommendation_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `profile_snapshot_json` text NOT NULL,
  `generated_filter_json` text NOT NULL,
  `result_summary_json` text NOT NULL,
  `ranked_boat_ids_json` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_recommendation_sessions_user_id`
  ON `recommendation_sessions` (`user_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `boat_fit_summaries` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `boat_id` integer NOT NULL REFERENCES `boats` (`id`) ON DELETE CASCADE,
  `session_id` integer REFERENCES `recommendation_sessions` (`id`) ON DELETE SET NULL,
  `summary_json` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_boat_fit_summaries_lookup`
  ON `boat_fit_summaries` (`user_id`, `boat_id`, `created_at`);

CREATE INDEX IF NOT EXISTS `idx_boat_fit_summaries_session`
  ON `boat_fit_summaries` (`session_id`);
