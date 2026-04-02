-- Add columns for structured data extracted from YachtWorld __REDUX_STATE__
ALTER TABLE boats ADD COLUMN hin TEXT;
ALTER TABLE boats ADD COLUMN boat_class TEXT;
ALTER TABLE boats ADD COLUMN condition TEXT;
