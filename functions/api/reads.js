// GET /api/reads -> { items: { [id]: { on, t } } }   POST { items } -> newest-wins merge (on=false is a tombstone). Owner only.
import { json, ownerGate } from './_auth.js';
const USER = 'me', ITEM = /^sha256:[0-9a-f]{64}$/;
async function all(env) {
  const { results } = await env.DB.prepare('SELECT item_id, read, updated_at FROM reads WHERE user_id = ?').bind(USER).all();
  return Object.fromEntries(results.map(r => [r.item_id, { on: !!r.read, t: r.updated_at }]));
}
export async function onRequestGet({ request, env }) { const deny = await ownerGate(request, env); if (deny) return deny; return json({ items: await all(env) }); }
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const stmts = [];
  for (const [id, v] of Object.entries(body?.items || {}).slice(0, 1000)) {
    if (!ITEM.test(id) || !v || typeof v !== 'object') continue;
    const t = Math.min(Math.round(+v.t) || Date.now(), Date.now() + 60000);
    stmts.push(env.DB.prepare(`INSERT INTO reads (user_id,item_id,read,updated_at) VALUES (?1,?2,?3,?4)
      ON CONFLICT(user_id,item_id) DO UPDATE SET read=excluded.read, updated_at=excluded.updated_at WHERE excluded.updated_at > reads.updated_at`).bind(USER, id, v.on ? 1 : 0, t));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return json({ ok: true, items: await all(env) });
}
