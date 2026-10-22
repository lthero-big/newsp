-- Owner read ticks (已读 ✓) synced across devices. read=0 rows are tombstones (newest-wins). Additive only.
CREATE TABLE IF NOT EXISTS reads (
  user_id    TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
