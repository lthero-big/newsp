// Owner-only: forward a card to a generic webhook (深挖这条 / 自由指令) — any agent, automation or bot that accepts a JSON POST.
// No AI here, just a validated relay. Pages secrets: AGENT_WEBHOOK_URL (https), AGENT_WEBHOOK_KEY (optional); optional
// AGENT_WEBHOOK_AUTH = bearer | header | both (default both: "Authorization: Bearer <key>" and "X-Webhook-Key: <key>").
// URL unset -> {configured:false} and the site hides both buttons. 20 tasks / day.
import { json, ownerGate } from './_auth.js';
const LIMIT = 20;
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
export function buildTask(b) {
  const action = b.action === 'command' ? 'command' : b.action === 'deep_dive' ? 'deep_dive' : null;
  if (!action) return { error: 'bad action' };
  let url = ''; try { const u = new URL(String(b.url || '')); if (u.protocol === 'https:') url = u.href.slice(0, 500); } catch {}
  const t = { action, id: str(b.id, 80), title_zh: str(b.title_zh, 200), title: str(b.title, 300), url, source: str(b.source, 60), date: str(b.date, 10), text: str(b.text, 1000) };
  if (!/^sha256:[0-9a-f]{64}$/.test(t.id) || !url) return { error: 'bad item' };
  if (action === 'command' && !t.text) return { error: 'empty command' };
  return { task: t };
}
export function authHeaders(env) {
  const k = env.AGENT_WEBHOOK_KEY, mode = (env.AGENT_WEBHOOK_AUTH || 'both').toLowerCase(), h = {};
  if (!k) return h;
  if (mode === 'bearer' || mode === 'both') h.authorization = 'Bearer ' + k;
  if (mode === 'header' || mode === 'both') h['x-webhook-key'] = k;
  return h;
}
const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // Asia/Shanghai day
async function used(env) { const r = await env.DB.prepare('SELECT n FROM agent_rate WHERE day=?1').bind(day()).first(); return r ? r.n || 0 : 0; }
export async function onRequestGet({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  return json({ configured: !!env.AGENT_WEBHOOK_URL, used: await used(env), limit: LIMIT });
}
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  if (!env.AGENT_WEBHOOK_URL) return json({ configured: false, error: '未配置' }, 503);
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { task, error } = buildTask(b); if (error) return json({ error }, 400);
  const n = await used(env); if (n >= LIMIT) return json({ error: `今日已达上限 ${LIMIT} 次` }, 429);
  try { await env.DB.prepare('INSERT INTO agent_rate (day,n) VALUES (?1,1) ON CONFLICT(day) DO UPDATE SET n=n+1').bind(day()).run(); } catch { return json({ error: '计数失败' }, 500); }
  let r; try { r = await fetch(env.AGENT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders(env) }, body: JSON.stringify({ ...task, origin: new URL(request.url).host, sent_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000) }); }
  catch { return json({ error: 'webhook 不可达' }, 502); }
  if (!r.ok) return json({ error: `webhook 返回 ${r.status}` }, 502);
  return json({ ok: true, used: n + 1, limit: LIMIT });
}
