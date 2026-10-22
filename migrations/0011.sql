-- 垃圾箱 永久删除 (2026-10-21): purged_at marks a trashed row as permanently deleted. Additive and nullable — older code ignores it.
-- The row is kept on purpose: status stays 'trashed', so the item stays hidden from editions and its 少推 learning (snapshot keys)
-- keeps counting until it decays (manage it on 学到的偏好). Purged rows are only left out of 垃圾箱 · 已删除 and can't be restored.
ALTER TABLE deletions ADD COLUMN purged_at INTEGER;
