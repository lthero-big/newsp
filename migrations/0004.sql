-- Owner source settings (信息源) + last collect status. Additive only.
CREATE TABLE IF NOT EXISTS source_settings (
  user_id    TEXT NOT NULL DEFAULT 'me',
  k          TEXT NOT NULL CHECK (k IN ('config', 'status')),
  v          TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, k)
);
