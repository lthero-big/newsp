-- fav_auto=1: the ♥ was set automatically by a ≥4★ rating (follows the rating); manual ♥ = 0. Additive only.
ALTER TABLE ratings ADD COLUMN fav_auto INTEGER NOT NULL DEFAULT 0;
UPDATE ratings SET fav_auto = 1 WHERE fav = 1 AND rating >= 4; -- legacy: hearts on ≥4★ items were almost all auto-set
