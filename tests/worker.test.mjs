// src/worker.js (Workers + static assets): same routes / fallthrough / middleware as the Pages Functions file router.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
// functions/mcp.js imports config/*.json without import attributes; let node load it as json here (as in mcp.test.mjs)
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { return n(u, u.endsWith('.json') ? { ...c, importAttributes: { ...c.importAttributes, type: 'json' } } : c); }"));
const { default: worker, ROUTES, handlerFor } = await import('../src/worker.js');
const { d1 } = await import('./d1-sqlite.mjs');

const seen = [];
const ASSETS = { fetch: async r => { seen.push(`${r.method} ${new URL(r.url).pathname}`); return new Response('static ' + new URL(r.url).pathname, { status: 200, headers: { 'content-type': 'text/html' } }); } };

test('every Pages Functions route file has a Worker route (files starting with _ are helpers)', () => {
  const api = readdirSync(new URL('../functions/api/', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => '/api/' + f.slice(0, -3));
  assert.deepEqual(Object.keys(ROUTES).sort(), ['/mcp', ...api].sort());
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  for (const k of ['main = "src/worker.js"', 'directory = "dist"', 'binding = "ASSETS"', 'run_worker_first = true', 'binding = "DB"', 'migrations_dir = "migrations"']) assert.ok(toml.includes(k), k);
  assert.ok(!/database_id\s*=/.test(toml), 'no account-specific database_id');
});

test('handler lookup is Pages-style (method export, trailing slash, unknown -> static)', () => {
  assert.equal(handlerFor('/api/ratings', 'GET'), ROUTES['/api/ratings'].onRequestGet);
  assert.equal(handlerFor('/api/ratings/', 'POST'), ROUTES['/api/ratings'].onRequestPost);
  assert.equal(handlerFor('/api/ratings', 'PUT'), null);
  assert.equal(handlerFor('/mcp', 'OPTIONS'), ROUTES['/mcp'].onRequestOptions);
  assert.equal(handlerFor('/mcp-admin', 'GET'), null);
  assert.equal(handlerFor('/api/_auth', 'GET'), null);
  assert.equal(handlerFor('/', 'GET'), null);
});

test('static pages go to ASSETS with X-Robots-Tag; old day URLs 301', async () => {
  seen.length = 0;
  const r = await worker.fetch(new Request('https://n.test/archive'), { ASSETS }, {});
  assert.equal(await r.text(), 'static /archive'); assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  const red = await worker.fetch(new Request('https://n.test/2026-10-16.html?x=1'), { ASSETS }, {});
  assert.equal(red.status, 301); assert.equal(red.headers.get('location'), 'https://n.test/2026/10/2026-10-16?x=1');
  const put = await worker.fetch(new Request('https://n.test/api/ratings', { method: 'PUT' }), { ASSETS }, {});
  assert.equal(await put.text(), 'static /api/ratings', 'unexported method falls through like Pages');
  assert.deepEqual(seen, ['GET /archive', 'PUT /api/ratings']);
});

test('API through the Worker: ratings round-trip on real migrations, MCP CORS + auth', async () => {
  const env = { ASSETS, DB: d1(), RATINGS_TOKEN: 'open-sesame' };
  const id = 'sha256:' + 'b'.repeat(64);
  const h = { authorization: 'Bearer open-sesame', 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' };
  let r = await worker.fetch(new Request('https://n.test/api/ratings', { method: 'POST', headers: h, body: JSON.stringify({ items: { [id]: { fav: true, vote: 1, updatedAt: 1000 } } }) }), env, {});
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  r = await worker.fetch(new Request('https://n.test/api/ratings', { headers: h }), env, {});
  assert.equal((await r.json()).items[id].fav, true);
  assert.equal((await worker.fetch(new Request('https://n.test/api/ratings', { headers: { ...h, authorization: 'Bearer nope' } }), env, {})).status, 401);
  const o = await worker.fetch(new Request('https://n.test/mcp', { method: 'OPTIONS' }), env, {});
  assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), '*');
  assert.equal((await worker.fetch(new Request('https://n.test/mcp', { method: 'POST', body: '{}' }), env, {})).status, 401);
  const g = await worker.fetch(new Request('https://n.test/mcp', { headers: { accept: 'text/html' } }), env, {});
  assert.equal(g.status, 302); assert.equal(g.headers.get('location'), 'https://n.test/mcp-admin');
});
