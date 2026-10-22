-- Owner preferences synced across devices (theme favourites / default). Additive only.
CREATE TABLE IF NOT EXISTS owner_prefs (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
