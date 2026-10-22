// MCP: token gate stays on, tokens are server-generated only, 收藏 / ♥ 点赞 filters (search_news only=…, list_favorites) over the real SQL on sqlite.
import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../lib/catalog.js';
import { register } from 'node:module';
// functions/mcp.js imports config/*.json without import attributes (as the Pages bundler wants); let node load it as json here
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { return n(u, u.endsWith('.json') ? { ...c, importAttributes: { ...c.importAttributes, type: 'json' } } : c); }"));
const { onRequestPost: mcp } = await import('../functions/mcp.js');
import { onRequestPost as tokens } from '../functions/api/mcp-tokens.js';
import { d1 } from './d1-sqlite.mjs';
const H = (t, ip = '9.9.9.9') => ({ authorization: 'Bearer ' + t, 'cf-connecting-ip': ip, 'content-type': 'application/json' });
const admin = (env, body) => tokens({ request: new Request('https://n.test/api/mcp-tokens', { method: 'POST', headers: H('pw', '1.1.1.1'), body: JSON.stringify(body) }), env });
let n = 0; const rpc = async (env, tok, method, params) => { const r = await mcp({ request: new Request('https://n.test/mcp', { method: 'POST', headers: H(tok), body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) }), env }); return { status: r.status, body: await r.json() }; };
const call = async (env, tok, name, args) => (await rpc(env, tok, 'tools/call', { name, arguments: args })).body.result;
const [A, B, C] = catalog.items.slice(0, 3);
async function setup() {
  const env = { DB: d1(), RATINGS_TOKEN: 'pw' };
  const tok = (await (await admin(env, { action: 'create', name: 't' })).json()).created.token;
  const T = Date.parse('2026-10-20T10:00:00+08:00');
  env.DB.db.prepare('INSERT INTO ratings (user_id,item_id,fav,vote,updated_at,fav_at) VALUES (?,?,?,?,?,?)').run('me', A.id, 1, 0, T, T);              // 收藏
  env.DB.db.prepare('INSERT INTO ratings (user_id,item_id,fav,vote,updated_at,fav_at) VALUES (?,?,?,?,?,?)').run('me', B.id, 0, 1, T + 86400e3, null); // 点赞 only, 10-21
  env.DB.db.prepare('INSERT INTO ratings (user_id,item_id,fav,vote,updated_at,fav_at) VALUES (?,?,?,?,?,?)').run('me', C.id, 1, 1, T + 2 * 86400e3, T + 2 * 86400e3); // both, 10-22
  return { env, tok };
}
test('no / bad token → 401; owner data never reachable without it', async () => {
  const { env } = await setup();
  const r = await rpc(env, 'ndm_nope', 'tools/call', { name: 'list_favorites', arguments: {} });
  assert.equal(r.status, 401); assert.equal(r.body.result, undefined);
});
test('custom token values are refused; minted ones are random ndm_ and work', async () => {
  const { env, tok } = await setup();
  for (const k of ['token', 'value', 'hash']) assert.equal((await admin(env, { action: 'create', name: 'x', [k]: 'ndm_mine' })).status, 400);
  assert.match(tok, /^ndm_[A-Za-z0-9_-]{43}$/);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM mcp_tokens').get().n, 1);
  assert.equal((await rpc(env, tok, 'ping', {})).status, 200);
});
test('tools/list advertises only + list_favorites', async () => {
  const { env, tok } = await setup();
  const tools = (await rpc(env, tok, 'tools/list', {})).body.result.tools;
  assert.deepEqual(tools.map(t => t.name), ['search_news', 'list_favorites', 'list_sources', 'list_filters', 'get_item']);
  assert.deepEqual(tools[0].inputSchema.properties.only.enum, ['favorites', 'liked', 'either', 'both']);
});
test('search_news only= filters by 收藏 / 点赞', async () => {
  const { env, tok } = await setup();
  const ids = async only => (await call(env, tok, 'search_news', { only, limit: 50 })).structuredContent.results.map(r => r.id).sort();
  assert.deepEqual(await ids('favorites'), [A.id, C.id].sort());
  assert.deepEqual(await ids('liked'), [B.id, C.id].sort());
  assert.deepEqual(await ids('both'), [C.id]);
  assert.deepEqual(await ids('either'), [A.id, B.id, C.id].sort());
  const r = (await call(env, tok, 'search_news', { only: 'favorites', limit: 50 })).structuredContent.results.find(x => x.id === A.id);
  assert.equal(r.fav, true); assert.equal(r.liked, false); assert.equal(r.fav_at, '2026-10-20T10:00:00+08:00');
  assert.equal((await call(env, tok, 'search_news', { only: 'nope' })).isError, true);
});
test('list_favorites: default either, fav-time order, fav_from/fav_to, liked', async () => {
  const { env, tok } = await setup();
  let r = (await call(env, tok, 'list_favorites', {})).structuredContent;
  assert.equal(r.only, 'either'); assert.deepEqual(r.results.map(x => x.id), [C.id, B.id, A.id]);
  r = (await call(env, tok, 'list_favorites', { fav_from: '2026-10-21', fav_to: '2026-10-21' })).structuredContent;
  assert.deepEqual(r.results.map(x => x.id), [B.id]); assert.equal(r.results[0].liked_at, '2026-10-21T10:00:00+08:00');
  r = (await call(env, tok, 'list_favorites', { only: 'favorites' })).structuredContent; assert.deepEqual(r.results.map(x => x.id), [C.id, A.id]);
  assert.equal((await call(env, tok, 'list_favorites', { fav_from: '10/21' })).isError, true);
  const f = (await call(env, tok, 'list_filters', {})).structuredContent.mine; assert.deepEqual(f, { favorites: 2, liked: 2, either: 3, both: 1 });
  const g = (await call(env, tok, 'get_item', { id: C.id })).structuredContent; assert.equal(g.fav, true); assert.equal(g.liked, true);
});
test('list_sources: 订阅源 merged like sources.html, filters, no secrets, behind the token', async () => {
  const { env, tok } = await setup();
  const put = (k, v) => env.DB.db.prepare('INSERT INTO source_settings (user_id,k,v,updated_at) VALUES (?,?,?,?)').run('me', k, JSON.stringify(v), 1);
  put('config', { disabled: ['plugin:hn', 'rss:openai-news'], x_accounts: [{ handle: 'alice', enabled: true, group: 'G1' }, { handle: 'bob', enabled: true, group: 'G2' }, { handle: 'carol', enabled: false, group: 'G1' }],
    x_groups: { G2: false }, weights: { 'xa:alice': 2, 'reddit:localllama': -1 }, feeds: [{ id: 'u-x', url: 'https://example.com/feed.xml', label: 'Ex' }] });
  put('status', { run_at: '2026-10-22T00:30:00Z', run: 'am', sources: { 'plugin:hf': { fetched: 20, selected: 2, status: 'failed:FetchError:http://10.0.0.1:1200/?key=SECRET' }, 'reddit:LocalLLaMA': { fetched: 9, selected: 1 } } });
  const r = await rpc(env, 'ndm_nope', 'tools/call', { name: 'list_sources', arguments: {} }); assert.equal(r.status, 401);
  const all = (await call(env, tok, 'list_sources', {})).structuredContent, by = id => all.sources.find(s => s.id === id);
  assert.ok(all.total >= 30); assert.equal(all.last_collect.at, '2026-10-22T08:30:00+08:00');
  assert.deepEqual([by('xa:alice').weight, by('xa:alice').active, by('xa:alice').url], [2, true, 'https://x.com/alice']);
  assert.deepEqual([by('xa:bob').enabled, by('xa:bob').active], [true, false]);          // group switched off
  assert.equal(by('xa:carol').active, false);
  assert.equal(by('reddit:LocalLLaMA').weight, -1); assert.deepEqual(by('reddit:LocalLLaMA').last_run, { fetched: 9, selected: 1, status: 'ok' });
  assert.equal(by('plugin:hf').last_run.status, 'failed');
  assert.equal(all.sources.filter(s => s.category === 'hn').every(s => !s.active), true);  // category off
  assert.equal(by('rss:u-x').url, 'https://example.com/feed.xml');
  const txt = JSON.stringify(all); for (const bad of ['SECRET', '10.0.0.1', 'RSSHUB_', 'ACCESS_KEY', '.config', '_note', 'endpoint']) assert.ok(!txt.includes(bad), bad);
  const xs = (await call(env, tok, 'list_sources', { category: 'x', type: 'x_account', enabled: true })).structuredContent.sources.map(s => s.id);
  assert.deepEqual(xs, ['xa:alice']);
  assert.deepEqual((await call(env, tok, 'list_sources', { query: 'example.com' })).structuredContent.sources.map(s => s.id), ['rss:u-x']);
  assert.equal((await call(env, tok, 'list_sources', { category: 'nope' })).isError, true);
  const tools = (await rpc(env, tok, 'tools/list', {})).body.result.tools.map(t => t.name); assert.ok(tools.includes('list_sources'));
});
