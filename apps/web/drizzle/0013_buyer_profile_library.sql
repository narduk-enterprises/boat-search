-- Buyer profile library: convert single buyer_profiles row per user
-- into a multi-row table with named profiles, active flag, and cooldown tracking.
-- Also links recommendation_sessions to the profile that generated them.

-- Step 1: Create the new multi-row table shape
CREATE TABLE IF NOT EXISTS `buyer_profiles_new` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id`     TEXT NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `name`        TEXT NOT NULL DEFAULT 'Primary profile',
  `is_active`   INTEGER NOT NULL DEFAULT 1,
  `data_json`   TEXT NOT NULL DEFAULT '{}',
  `last_run_at` TEXT,
  `created_at`  TEXT NOT NULL,
  `updated_at`  TEXT NOT NULL
);

-- Step 2: Backfill existing rows (one profile per user, auto-activated)
INSERT INTO `buyer_profiles_new` (`user_id`, `name`, `is_active`, `data_json`, `last_run_at`, `created_at`, `updated_at`)
SELECT
  bp.`user_id`,
  'Primary profile',
  1,
  bp.`data_json`,
  (SELECT MAX(rs.`created_at`) FROM `recommendation_sessions` rs WHERE rs.`user_id` = bp.`user_id`),
  bp.`updated_at`,
  bp.`updated_at`
FROM `buyer_profiles` bp;

-- Step 3: Drop old table, rename new one
DROP TABLE IF EXISTS `buyer_profiles`;
ALTER TABLE `buyer_profiles_new` RENAME TO `buyer_profiles`;

-- Step 4: Indexes for the new shape
CREATE INDEX IF NOT EXISTS `idx_buyer_profiles_user_id` ON `buyer_profiles` (`user_id`);

-- Step 5: Extend recommendation_sessions with profile link
ALTER TABLE `recommendation_sessions` ADD COLUMN `buyer_profile_id` INTEGER;
ALTER TABLE `recommendation_sessions` ADD COLUMN `buyer_profile_name_snapshot` TEXT;

-- Step 6: Backfill sessions — link each user's sessions to their migrated primary profile
UPDATE `recommendation_sessions`
SET `buyer_profile_id` = (
  SELECT bp.`id` FROM `buyer_profiles` bp
  WHERE bp.`user_id` = `recommendation_sessions`.`user_id`
  LIMIT 1
),
`buyer_profile_name_snapshot` = 'Primary profile'
WHERE `buyer_profile_id` IS NULL;
