// Pure state machine for 不感兴趣 (no I/O, unit-tested). All times are server ms.
export const COUNTDOWN_MS = 12 * 3600 * 1000, MAX_CLICKS = 5;
// lazily settle: a pending row whose countdown has passed is trashed
export function settle(row, now) {
  if (row && row.status === 'pending' && row.expires_at <= now) return { ...row, status: 'trashed', trashed_at: row.expires_at, updated_at: now };
  return row;
}
export function click(prev, now, snapshot = {}) {
  const row = settle(prev, now);
  if (!row || row.status !== 'pending') // new, restored or (re-)deleting → (re)start at 12h
    return { status: 'pending', deleted_at: now, expires_at: now + COUNTDOWN_MS, clicks: 1, trashed_at: null, snapshot: { ...(row?.snapshot || {}), ...snapshot }, updated_at: now };
  const clicks = row.clicks + 1;
  if (clicks >= MAX_CLICKS) return { ...row, clicks, status: 'trashed', expires_at: now, trashed_at: now, updated_at: now };
  return { ...row, clicks, expires_at: now + Math.floor((row.expires_at - now) / 2), updated_at: now };
}
export const undo = (row, now) => row ? { ...settle(row, now), status: 'restored', trashed_at: null, updated_at: now } : null;
// 永久删除: only a trashed row can be purged; it stays 'trashed' (hidden + still teaches 少推) and just leaves the 已删除 list.
// A purged row can't be restored or re-counted down.
export const purge = (row, now) => { const r = settle(row, now); return r && r.status === 'trashed' ? { ...r, purged_at: r.purged_at || now, updated_at: now } : null; };
export const isPurged = r => !!(r && r.purged_at);
