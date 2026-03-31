ALTER TABLE `boats` ADD COLUMN `needs_rescrape` integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS `idx_boats_needs_rescrape`
  ON `boats` (`source`)
  WHERE `needs_rescrape` = 1;
