// Owner-only 不感兴趣 API.  GET → { now, items: {id: row}, overrides: {key: cleared_at} }
// POST { action: 'click'|'undo'|'restore'|'purge'|'purge_all'|'clear_key'|'unclear_key', id?, snapshot?, key? } → { now, item?, overrides }
// purge / purge_all (永久删除 / 清空已删除) set purged_at on trashed rows; the row stays (status 'trashed') so the item stays hidden and its 少推 learning is kept.
import { json, ownerGate } from './_auth.js';
import { click, undo, settle, purge, isPurged } from './_deletion-logic.js';
const USER = 'me', ITEM = /^sha256:[0-9a-f]{64}$/, KEY = /^[a-z]+:[^\s]{1,120}$/i;
const parse = r => r && { status: r.status, deleted_at: r.deleted_at, expires_at: r.expires_at, clicks: r.clicks, trashed_at: r.trashed_at, purged_at: r.purged_at ?? null, snapshot: JSON.parse(r.snapshot || '{}'), updated_at: r.updated_at };
function cleanSnap(s = {}) {
  const str = (v, n) => String(v ?? '').slice(0, n);
  return { title: str(s.title, 240), module: str(s.module, 20), source: str(s.source, 80), date: str(s.date, 10), url: str(s.url, 500),
    tags: (Array.isArray(s.tags) ? s.tags : []).slice(0, 6).map(t => str(t, 20)), keys: (Array.isArray(s.keys) ? s.keys : []).filter(k => KEY.test(k)).slice(0, 12) };
}
async function save(env, id, r) {
  await env.DB.prepare(`INSERT INTO deletions (user_id,item_id,status,deleted_at,expires_at,clicks,trashed_at,snapshot,updated_at,purged_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
    ON CONFLICT(user_id,item_id) DO UPDATE SET status=excluded.status, deleted_at=excluded.deleted_at, expires_at=excluded.expires_at, clicks=excluded.clicks, trashed_at=excluded.trashed_at, snapshot=excluded.snapshot, updated_at=excluded.updated_at, purged_at=excluded.purged_at`)
    .bind(USER, id, r.status, r.deleted_at, r.expires_at, r.clicks, r.trashed_at ?? null, JSON.stringify(r.snapshot || {}), r.updated_at, r.purged_at ?? null).run();
}
async function overrides(env) {
  const { results } = await env.DB.prepare('SELECT key, cleared_at FROM penalty_overrides WHERE user_id=?1').bind(USER).all();
  return Object.fromEntries(results.map(r => [r.key, r.cleared_at]));
}
export async function onRequestGet({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT * FROM deletions WHERE user_id=?1').bind(USER).all();
  const items = {};
  for (const raw of results) { const r = parse(raw), s = settle(r, now); if (s !== r) await save(env, raw.item_id, s); items[raw.item_id] = s; }
  return json({ now, items, overrides: await overrides(env) });
}
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const now = Date.now();
  if (b?.action === 'clear_key' || b?.action === 'unclear_key') {
    if (!KEY.test(b.key || '')) return json({ error: 'bad key' }, 400);
    if (b.action === 'clear_key') await env.DB.prepare('INSERT INTO penalty_overrides (user_id,key,cleared_at) VALUES (?1,?2,?3) ON CONFLICT(user_id,key) DO UPDATE SET cleared_at=excluded.cleared_at').bind(USER, b.key, now).run();
    else await env.DB.prepare('DELETE FROM penalty_overrides WHERE user_id=?1 AND key=?2').bind(USER, b.key).run();
    return json({ now, overrides: await overrides(env) });
  }
  if (b?.action === 'purge_all') { // 清空「已删除」: every trashed, not yet purged row (pending countdowns are untouched)
    const { results } = await env.DB.prepare('SELECT * FROM deletions WHERE user_id=?1 AND purged_at IS NULL').bind(USER).all(); const items = {};
    for (const raw of results) { const p = purge(parse(raw), now); if (p) { await save(env, raw.item_id, p); items[raw.item_id] = p; } }
    return json({ now, items, purged: Object.keys(items).length });
  }
  if (!ITEM.test(b?.id || '')) return json({ error: 'bad id' }, 400);
  const prev = parse(await env.DB.prepare('SELECT * FROM deletions WHERE user_id=?1 AND item_id=?2').bind(USER, b.id).first());
  if (isPurged(prev) && b.action !== 'purge') return json({ error: 'purged', item: prev }, 409);  // 永久删除 is final
  let next;
  if (b.action === 'click') next = click(prev, now, cleanSnap(b.snapshot));
  else if (b.action === 'undo' || b.action === 'restore') next = undo(prev, now);
  else if (b.action === 'purge') { next = purge(prev, now); if (!next) return json({ error: 'not in trash' }, 409); }
  else return json({ error: 'bad action' }, 400);
  if (!next) return json({ now, item: null });
  await save(env, b.id, next);
  if (b.action === 'click') // delete and favourite are mutually exclusive
    await env.DB.prepare('UPDATE ratings SET fav=0, updated_at=?3 WHERE user_id=?1 AND item_id=?2 AND fav=1').bind(USER, b.id, now).run();
  return json({ now, item: next });
}
