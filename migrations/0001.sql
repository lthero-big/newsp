-- Favourites + 1-5 star ratings (ported from design-daily migrations/0001.sql).
CREATE TABLE IF NOT EXISTS ratings (
  user_id    TEXT NOT NULL DEFAULT 'me',
  item_id    TEXT NOT NULL,
  fav        INTEGER NOT NULL DEFAULT 0 CHECK (fav IN (0, 1)),
  rating     INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_fav ON ratings (user_id, fav, rating);
