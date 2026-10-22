// 学到的偏好 (owner only).  GET → { now, boost: [row], penalty: [row], cleared: [{key, kind, at}] }   row = { key, s, n, c:{like,fav,del,dis}, ex:[title], effect }
// POST { action: 'clear'|'unclear', kind: 'boost'|'penalty', key } → same as GET. Penalty clears share penalty_overrides with 垃圾箱
// (key as-is); boost clears are stored as '+key'. Strengths are exactly what learning.py ranks with (scripts/feedback.mjs + scripts/learned.mjs,
// card keys from the build's catalog). Read-only on ratings / deletions.
import catalog from '../../lib/catalog.js';
import { json, ownerGate } from './_auth.js';
import { settle } from './_deletion-logic.js';
import { buildFeedback } from '../../scripts/feedback.mjs';
import { learned } from '../../scripts/learned.mjs';
const USER = 'me', KEY = /^[a-z]+:[^\s]{1,120}$/i;
export async function compute(env, now = Date.now(), FK = catalog.fkeys || {}) {
  const [{ results: rr }, { results: dr }, { results: or }] = await Promise.all([
    env.DB.prepare('SELECT item_id, fav, vote, updated_at FROM ratings WHERE user_id=?1').bind(USER).all(),
    env.DB.prepare('SELECT * FROM deletions WHERE user_id=?1').bind(USER).all(),
    env.DB.prepare('SELECT key, cleared_at FROM penalty_overrides WHERE user_id=?1').bind(USER).all()]);
  const ratings = { items: Object.fromEntries(rr.map(r => [r.item_id, { fav: !!r.fav, vote: r.vote || 0, updatedAt: r.updated_at }])) };
  const deletions = { items: Object.fromEntries(dr.map(r => [r.item_id, settle({ status: r.status, deleted_at: r.deleted_at, expires_at: r.expires_at, clicks: r.clicks, trashed_at: r.trashed_at, snapshot: JSON.parse(r.snapshot || '{}'), updated_at: r.updated_at }, now)])),
    overrides: Object.fromEntries(or.map(r => [r.key, r.cleared_at])) };
  const fb = buildFeedback(deletions, ratings, id => (FK[id] ? FK[id][0] : null), id => FK[id]?.[1] || '');
  return learned(fb, now, id => ({ title: FK[id]?.[1] || '', fav: !!ratings.items[id]?.fav, like: ratings.items[id]?.vote > 0 }));
}
export async function onRequestGet({ request, env }) { const deny = await ownerGate(request, env); if (deny) return deny; return json(await compute(env)); }
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!['clear', 'unclear'].includes(b?.action) || !['boost', 'penalty'].includes(b?.kind) || !KEY.test(b?.key || '')) return json({ error: 'bad request' }, 400);
  const k = (b.kind === 'boost' ? '+' : '') + b.key, now = Date.now();
  if (b.action === 'clear') await env.DB.prepare('INSERT INTO penalty_overrides (user_id,key,cleared_at) VALUES (?1,?2,?3) ON CONFLICT(user_id,key) DO UPDATE SET cleared_at=excluded.cleared_at').bind(USER, k, now).run();
  else await env.DB.prepare('DELETE FROM penalty_overrides WHERE user_id=?1 AND key=?2').bind(USER, k).run();
  return json(await compute(env, now));
}
