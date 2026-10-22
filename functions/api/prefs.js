// GET /api/prefs -> { theme_favs: [themeId], theme_default: themeId|null, hero: widgetName|null, reduce_motion: bool|null }   POST same shape (partial ok). Owner only.
import { json, ownerGate } from './_auth.js';
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
export function clean(body) {
  const out = {};
  if ('theme_favs' in body) { if (!Array.isArray(body.theme_favs)) throw new Error('theme_favs'); out.theme_favs = [...new Set(body.theme_favs.filter(x => typeof x === 'string' && ID.test(x)))].slice(0, 60); }
  if ('theme_default' in body) { const d = body.theme_default; if (d !== null && !(typeof d === 'string' && ID.test(d))) throw new Error('theme_default'); out.theme_default = d; }
  if ('hero' in body) { const h = body.hero; if (h !== null && !(typeof h === 'string' && ID.test(h))) throw new Error('hero'); out.hero = h; }
  if ('reduce_motion' in body) { const v = body.reduce_motion; if (v !== null && typeof v !== 'boolean') throw new Error('reduce_motion'); out.reduce_motion = v; }
  return out;
}
async function read(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM owner_prefs WHERE key IN ('theme_favs','theme_default','hero','reduce_motion')").all();
  const m = Object.fromEntries(results.map(r => [r.key, JSON.parse(r.value)]));
  return { theme_favs: m.theme_favs || [], theme_default: m.theme_default ?? null, hero: m.hero ?? null, reduce_motion: m.reduce_motion ?? null };
}
export async function onRequestGet({ request, env }) { const deny = await ownerGate(request, env); if (deny) return deny; return json(await read(env)); }
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let c; try { c = clean(await request.json()); } catch (e) { return json({ error: 'bad request: ' + e.message }, 400); }
  const now = Date.now();
  const st = Object.entries(c).map(([k, v]) => env.DB.prepare('INSERT INTO owner_prefs (key,value,updated_at) VALUES (?1,?2,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind(k, JSON.stringify(v), now));
  if (st.length) await env.DB.batch(st);
  return json({ ok: true, ...(await read(env)) });
}
