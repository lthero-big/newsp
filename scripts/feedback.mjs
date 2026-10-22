// Owner feedback → learning signals (pure, no I/O). Shared by scripts/sync-state.mjs (→ var/state/feedback.json for learning.py)
// and functions/api/learned.js (学到的偏好 page), so both see exactly the same events.
// Signals (weights mirror learning.py, v3.6): 不感兴趣 → trashed (1); 少推这类 (vote -1) → disliked 0.5; 点赞 (vote 1) or 收藏 → liked 1
// (one entry per item, so ♥ + 收藏 on the same card counts once). 已收起 is UI-only and never a signal. A row from the pre-v3.6 API
// (rating, no vote) is mapped like migration 0009: ≥4★ → 1, 1–2★ → -1, 3★ → 0.
export const DISLIKE_WEIGHT = 0.5;
export const voteOf = r => r.vote !== undefined ? (+r.vote > 0 ? 1 : +r.vote < 0 ? -1 : 0) : (+r.rating >= 4 ? 1 : +r.rating >= 1 && +r.rating <= 2 ? -1 : 0);
// keysOf(id) → the card's feedback keys, or null when the card is unknown (not in any edition)
export function buildFeedback(deletions, ratings, keysOf, titleOf = () => '') {
  const trashed = [], pending = [], liked = [], disliked = [];
  for (const [id, r] of Object.entries(deletions.items || {})) {
    if (r.status === 'trashed') trashed.push({ id, at: r.trashed_at || r.expires_at, keys: r.snapshot?.keys?.length ? r.snapshot.keys : (keysOf(id) || []), title: r.snapshot?.title || titleOf(id) || '' });
    else if (r.status === 'pending') pending.push(id);
  }
  for (const [id, r] of Object.entries(ratings.items || {})) {
    const keys = keysOf(id); if (!keys) continue;
    const v = voteOf(r);
    if (v > 0 || r.fav) liked.push({ id, at: r.updatedAt, keys, weight: 1 });
    else if (v < 0) disliked.push({ id, at: r.updatedAt, keys, weight: DISLIKE_WEIGHT });
  }
  return { synced_at: new Date().toISOString(), trashed, pending, liked, disliked, overrides: deletions.overrides || {} };
}
