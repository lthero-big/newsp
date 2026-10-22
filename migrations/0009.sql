-- v3.6: ★ ratings → vote (1 = 点赞/多推这类, 0 = none, -1 = 少推这类). Additive only; the rating / fav_auto columns stay as history.
-- Old ratings: ≥4★ → 1, 1–2★ → -1, 3★ → 0. Favourites are all kept (fav untouched): the legacy 0008 backfill flagged hearts on ≥4★
-- items as fav_auto without knowing who set them, so dropping them could delete hearts the owner set by hand. fav_auto is no longer read or written.
ALTER TABLE ratings ADD COLUMN vote INTEGER NOT NULL DEFAULT 0;
UPDATE ratings SET vote = CASE WHEN rating >= 4 THEN 1 WHEN rating BETWEEN 1 AND 2 THEN -1 ELSE 0 END;
