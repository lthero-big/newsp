// Owner passphrase gate + brute-force lock (3 fails → 15 min), ported from design-daily lib/auth.js.
export const LOCK_MAX_FAILS = 3, LOCK_MS = 15 * 60 * 1000;
export const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });
// IPv6 clients are bucketed by /64.
export function ipBucket(ip) { if (!ip || !ip.includes(':')) return ip || 'unknown'; const [head, tail = ''] = ip.split('::'); const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]; return full.slice(0, 4).map(x => (x || '0').toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64'; }
export const clientIp = req => ipBucket(req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim());
export const bearer = req => { const h = req.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };
const enc = new TextEncoder();
export async function ctEqual(a, b) { const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', enc.encode(v)))); const A = new Uint8Array(x), B = new Uint8Array(y); let d = 0; for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i]; return d === 0; }
export async function lockedFor(env, ip, scope) { const r = await env.DB.prepare('SELECT locked_until FROM auth_fail WHERE ip=?1 AND scope=?2').bind(ip, scope).first(); const left = r && r.locked_until ? r.locked_until - Date.now() : 0; return left > 0 ? Math.ceil(left / 1000) : 0; }
export async function recordFail(env, ip, scope) { const now = Date.now();
  const r = await env.DB.prepare('SELECT count, first_at, locked_until FROM auth_fail WHERE ip=?1 AND scope=?2').bind(ip, scope).first();
  let count = 1, first = now; if (r && now - r.first_at < LOCK_MS && !(r.locked_until && r.locked_until <= now)) { count = r.count + 1; first = r.first_at; }
  const locked = count >= LOCK_MAX_FAILS ? now + LOCK_MS : null;
  await env.DB.prepare('INSERT INTO auth_fail (ip,scope,count,first_at,locked_until) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(ip,scope) DO UPDATE SET count=excluded.count, first_at=excluded.first_at, locked_until=excluded.locked_until').bind(ip, scope, count, first, locked).run();
  return locked ? Math.ceil(LOCK_MS / 1000) : 0; }
export const clearFails = (env, ip, scope) => env.DB.prepare('DELETE FROM auth_fail WHERE ip=?1 AND scope=?2').bind(ip, scope).run();
const tooMany = sec => json({ error: 'too many failed attempts, locked', retryAfter: sec }, 429, { 'retry-after': String(sec) });
// The passphrase is the Pages secret RATINGS_TOKEN (wrangler pages secret put RATINGS_TOKEN). Returns null when OK.
export async function ownerGate(request, env) {
  if (!env.DB || !env.RATINGS_TOKEN) return json({ error: 'not configured' }, 503);
  const ip = clientIp(request); const left = await lockedFor(env, ip, 'owner'); if (left) return tooMany(left);
  if (await ctEqual(bearer(request), env.RATINGS_TOKEN)) { await clearFails(env, ip, 'owner'); return null; }
  const lock = await recordFail(env, ip, 'owner'); return lock ? tooMany(lock) : json({ error: 'unauthorized' }, 401);
}
export async function sha256hex(s) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
// MCP token gate (tokens in mcp_tokens, sha256-hashed). Returns { row } or a Response.
export async function mcpGate(request, env, extraHeaders = {}) {
  if (!env.DB) return json({ error: 'not configured' }, 503, extraHeaders);
  const ip = clientIp(request); const left = await lockedFor(env, ip, 'mcp');
  if (left) return json({ error: 'too many failed attempts, locked', retryAfter: left }, 429, { 'retry-after': String(left), ...extraHeaders });
  const t = bearer(request); const row = t ? await env.DB.prepare('SELECT id, name FROM mcp_tokens WHERE hash=?1 AND revoked_at IS NULL').bind(await sha256hex(t)).first() : null;
  if (row) { await env.DB.prepare('UPDATE mcp_tokens SET last_used_at=?1 WHERE id=?2').bind(Date.now(), row.id).run(); await clearFails(env, ip, 'mcp'); return { row }; }
  const lock = await recordFail(env, ip, 'mcp');
  return lock ? json({ error: 'too many failed attempts, locked', retryAfter: lock }, 429, { 'retry-after': String(lock), ...extraHeaders })
    : json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } }, 401, { 'www-authenticate': 'Bearer realm="news-daily-mcp"', ...extraHeaders });
}
