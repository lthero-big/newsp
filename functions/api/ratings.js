// GET /api/ratings -> { items: { [id]: { fav, vote, updatedAt, favAt? } } }   vote: 1 = 点赞（多推这类）, 0, -1 = 少推这类; favAt = when it was favourited (migration 0010)
// POST /api/ratings { items } -> merge newest-wins per item, returns full state.  Ported from design-daily functions/api/state.js.
// v3.6: ★ ratings and the ≥4★ auto-favourite (fav_auto) are retired; the rating column is kept only as history (migration 0009).
import { json, ownerGate } from './_auth.js';
const USER = 'me';
const ITEM = /^sha256:[0-9a-f]{64}$/;
// a client still running the pre-v3.6 script sends { rating } without vote: map it the same way migration 0009 did
export const voteOf = v => v.vote !== undefined ? Math.max(-1, Math.min(1, Math.round(+v.vote || 0))) : (+v.rating >= 4 ? 1 : +v.rating >= 1 && +v.rating <= 2 ? -1 : 0);
// favAt: a sane client time (2020 … now+60s) or, failing that, this write's time. Old clients send none → keep the stored one / use updated_at.
export const favAtOf = (v, ts) => { const t = +v.favAt; return Number.isFinite(t) && t > 1577836800000 && t <= Date.now() + 60000 ? Math.round(t) : ts; };
// newest-wins row; fav_at: cleared on un-favourite, kept while it stays favourited (first save time wins), else the incoming time
export const UPSERT = `INSERT INTO ratings (user_id,item_id,fav,vote,updated_at,fav_at) VALUES (?1,?2,?3,?4,?5,?6)
      ON CONFLICT(user_id,item_id) DO UPDATE SET fav=excluded.fav, vote=excluded.vote, updated_at=excluded.updated_at,
        fav_at = CASE WHEN excluded.fav = 0 THEN NULL WHEN ratings.fav = 1 AND ratings.fav_at IS NOT NULL THEN ratings.fav_at ELSE excluded.fav_at END
      WHERE excluded.updated_at > ratings.updated_at`;
async function all(env) {
  const { results } = await env.DB.prepare('SELECT item_id, fav, vote, updated_at, fav_at FROM ratings WHERE user_id = ?').bind(USER).all();
  return Object.fromEntries(results.map(r => [r.item_id, { fav: !!r.fav, vote: r.vote || 0, updatedAt: r.updated_at, ...(r.fav && r.fav_at ? { favAt: r.fav_at } : {}) }]));
}
export async function onRequestGet({ request, env }) { const deny = await ownerGate(request, env); if (deny) return deny; return json({ items: await all(env) }); }
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const entries = Object.entries(body?.items || {}).slice(0, 500); const stmts = [];
  for (const [id, v] of entries) {
    if (!ITEM.test(id) || !v || typeof v !== 'object') continue;
    const ts = Math.min(+v.updatedAt || Date.now(), Date.now() + 60000);
    stmts.push(env.DB.prepare(UPSERT).bind(USER, id, v.fav ? 1 : 0, voteOf(v), ts, v.fav ? favAtOf(v, ts) : null));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, items: await all(env) });
}
