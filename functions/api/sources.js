// Owner-only 信息源 settings. GET -> { defaults, config, status }.
// POST {action:'config', config} (validated, replaces) · POST {action:'status', status} (written by the collector after each run).
// Defaults are bundled from config/collect-sources.json; the RSSHub base/key never live here (collector env only).
import { json, ownerGate } from './_auth.js';
import defaults from '../../config/collect-sources.json';
import { cleanConfig, discover } from './_sources-lib.js';
export { cleanConfig };
const USER = 'me';
const read = async (env, k) => { const r = await env.DB.prepare('SELECT v, updated_at FROM source_settings WHERE user_id=?1 AND k=?2').bind(USER, k).first(); return r ? { ...JSON.parse(r.v), updated_at: r.updated_at } : null; };
const write = (env, k, v) => env.DB.prepare('INSERT INTO source_settings (user_id,k,v,updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at').bind(USER, k, JSON.stringify(v), Date.now()).run();
export async function onRequestGet({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  return json({ defaults, config: (await read(env, 'config')) || cleanConfig({}), status: await read(env, 'status') });
}
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (b.action === 'config') { const c = cleanConfig(b.config); await write(env, 'config', c); return json({ ok: true, config: { ...c, updated_at: Date.now() } }); }
  if (b.action === 'discover') return json(await discover(String(b.url || '')));
  if (b.action === 'status') { const s = JSON.stringify(b.status || {}); if (s.length > 60000) return json({ error: 'too large' }, 413); await write(env, 'status', JSON.parse(s)); return json({ ok: true }); }
  return json({ error: 'unknown action' }, 400);
}

