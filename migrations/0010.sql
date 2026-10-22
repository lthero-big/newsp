-- 收藏时间轴 (2026-10-21): when an item was favourited (client ms). Additive and nullable — older code ignores it; NULL when not favourited.
-- Backfill: existing favourites get their row's last update time (best available guess; a later 点赞 may have bumped it).
ALTER TABLE ratings ADD COLUMN fav_at INTEGER;
UPDATE ratings SET fav_at = updated_at WHERE fav = 1 AND fav_at IS NULL;
