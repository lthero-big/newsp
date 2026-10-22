// Owner-only MCP token admin. GET -> list. POST {action:create|regenerate|revoke|delete, name?, id?}. Tokens are server-generated only (no manual / pasted values).
import { json, ownerGate, sha256hex } from './_auth.js';
const b64u = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function mint(env, name) { const secret = b64u(crypto.getRandomValues(new Uint8Array(32))); const token = 'ndm_' + secret; const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO mcp_tokens (id,name,hash,prefix,created_at) VALUES (?1,?2,?3,?4,?5)').bind(id, name, await sha256hex(token), secret.slice(0, 6), Date.now()).run();
  return { id, name, token, prefix: secret.slice(0, 6) }; }
const list = async env => (await env.DB.prepare('SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM mcp_tokens ORDER BY created_at DESC').all()).results;
export async function onRequestGet({ request, env }) { const deny = await ownerGate(request, env); if (deny) return deny; return json({ tokens: await list(env) }); }
export async function onRequestPost({ request, env }) {
  const deny = await ownerGate(request, env); if (deny) return deny;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  // tokens are only ever minted here (random 32 bytes, shown once); a client-chosen value is refused, never stored
  if (b && ['token', 'value', 'secret', 'hash', 'prefix'].some(k => b[k] !== undefined)) return json({ error: 'tokens are server-generated; custom values are not accepted' }, 400);
  const name = String(b.name || '').trim().slice(0, 60);
  if (b.action === 'create') { if (!name) return json({ error: 'name required' }, 400); return json({ created: await mint(env, name), tokens: await list(env) }); }
  const row = b.id ? await env.DB.prepare('SELECT * FROM mcp_tokens WHERE id=?1').bind(String(b.id)).first() : null; if (!row) return json({ error: 'not found' }, 404);
  if (b.action === 'revoke') { await env.DB.prepare('UPDATE mcp_tokens SET revoked_at=?1 WHERE id=?2 AND revoked_at IS NULL').bind(Date.now(), row.id).run(); return json({ ok: true, tokens: await list(env) }); }
  if (b.action === 'regenerate') { await env.DB.prepare('UPDATE mcp_tokens SET revoked_at=?1 WHERE id=?2 AND revoked_at IS NULL').bind(Date.now(), row.id).run(); return json({ created: await mint(env, row.name), tokens: await list(env) }); }
  if (b.action === 'delete') { if (!row.revoked_at) return json({ error: 'revoke before delete' }, 409); await env.DB.prepare('DELETE FROM mcp_tokens WHERE id=?1').bind(row.id).run(); return json({ ok: true, tokens: await list(env) }); }
  return json({ error: 'unknown action' }, 400);
}
