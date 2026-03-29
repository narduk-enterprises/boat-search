ALTER TABLE `boats` ADD COLUMN `entity_id` integer;
ALTER TABLE `boats` ADD COLUMN `superseded_by_boat_id` integer;
ALTER TABLE `boats` ADD COLUMN `dedupe_method` text;
ALTER TABLE `boats` ADD COLUMN `dedupe_confidence` integer;

CREATE TABLE IF NOT EXISTS `boat_entities` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `representative_boat_id` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_boat_entities_representative`
  ON `boat_entities` (`representative_boat_id`);

CREATE TABLE IF NOT EXISTS `boat_dedupe_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `left_boat_id` integer NOT NULL,
  `right_boat_id` integer NOT NULL,
  `confidence_score` integer NOT NULL,
  `rule_hits_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_boat_dedupe_candidates_left`
  ON `boat_dedupe_candidates` (`left_boat_id`);

CREATE INDEX IF NOT EXISTS `idx_boat_dedupe_candidates_right`
  ON `boat_dedupe_candidates` (`right_boat_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_boat_dedupe_candidates_pair`
  ON `boat_dedupe_candidates` (`left_boat_id`, `right_boat_id`);

CREATE INDEX IF NOT EXISTS `idx_boats_entity_id` ON `boats` (`entity_id`);
CREATE INDEX IF NOT EXISTS `idx_boats_superseded_by_boat_id` ON `boats` (`superseded_by_boat_id`);

WITH ranked_listing_ids AS (
  SELECT
    `id`,
    FIRST_VALUE(`id`) OVER (
      PARTITION BY `source`, `listing_id`
      ORDER BY `updated_at` DESC, `id` DESC
    ) AS `survivor_id`,
    ROW_NUMBER() OVER (
      PARTITION BY `source`, `listing_id`
      ORDER BY `updated_at` DESC, `id` DESC
    ) AS `row_number`
  FROM `boats`
  WHERE `listing_id` IS NOT NULL
)
UPDATE `boats`
SET
  `superseded_by_boat_id` = (
    SELECT `survivor_id`
    FROM `ranked_listing_ids`
    WHERE `ranked_listing_ids`.`id` = `boats`.`id`
  ),
  `dedupe_method` = 'exact-source-listing',
  `dedupe_confidence` = 100
WHERE `id` IN (
  SELECT `id`
  FROM `ranked_listing_ids`
  WHERE `row_number` > 1
);

WITH ranked_urls AS (
  SELECT
    `id`,
    FIRST_VALUE(`id`) OVER (
      PARTITION BY `url`
      ORDER BY `updated_at` DESC, `id` DESC
    ) AS `survivor_id`,
    ROW_NUMBER() OVER (
      PARTITION BY `url`
      ORDER BY `updated_at` DESC, `id` DESC
    ) AS `row_number`
  FROM `boats`
  WHERE `superseded_by_boat_id` IS NULL
)
UPDATE `boats`
SET
  `superseded_by_boat_id` = (
    SELECT `survivor_id`
    FROM `ranked_urls`
    WHERE `ranked_urls`.`id` = `boats`.`id`
  ),
  `dedupe_method` = 'exact-url',
  `dedupe_confidence` = 100
WHERE `id` IN (
  SELECT `id`
  FROM `ranked_urls`
  WHERE `row_number` > 1
);

INSERT INTO `boat_entities` (`representative_boat_id`, `created_at`, `updated_at`)
SELECT
  `id`,
  COALESCE(`updated_at`, CURRENT_TIMESTAMP),
  COALESCE(`updated_at`, CURRENT_TIMESTAMP)
FROM `boats`
WHERE `superseded_by_boat_id` IS NULL;

UPDATE `boats`
SET
  `entity_id` = (
    SELECT `boat_entities`.`id`
    FROM `boat_entities`
    WHERE `boat_entities`.`representative_boat_id` = `boats`.`id`
  )
WHERE `superseded_by_boat_id` IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_boats_active_url`
  ON `boats` (`url`)
  WHERE `superseded_by_boat_id` IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_boats_active_source_listing_id`
  ON `boats` (`source`, `listing_id`)
  WHERE `listing_id` IS NOT NULL AND `superseded_by_boat_id` IS NULL;
