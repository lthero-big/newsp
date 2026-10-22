-- 不感兴趣 (delete) countdown + learning snapshot; penalty-key overrides. Additive only.
CREATE TABLE IF NOT EXISTS deletions (
  user_id    TEXT NOT NULL DEFAULT 'me',
  item_id    TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('pending', 'trashed', 'restored')),
  deleted_at INTEGER NOT NULL,          -- countdown start (server ms)
  expires_at INTEGER NOT NULL,          -- server ms; pending → trashed once passed
  clicks     INTEGER NOT NULL DEFAULT 1,
  trashed_at INTEGER,
  snapshot   TEXT NOT NULL DEFAULT '{}', -- JSON: title, module, tags, source, date, url, keys[]
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_deletions_status ON deletions (user_id, status, expires_at);
CREATE TABLE IF NOT EXISTS penalty_overrides (
  user_id    TEXT NOT NULL DEFAULT 'me',
  key        TEXT NOT NULL,
  cleared_at INTEGER NOT NULL,          -- trashed items before this time no longer penalise this key
  PRIMARY KEY (user_id, key)
);
