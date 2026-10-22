// 垃圾箱 永久删除 (migration 0011, deletions.purged_at) through the real /api/deletions SQL on sqlite:
// purge / purge_all keep the row as 'trashed' (item stays hidden, 少推 learning kept) but it can't be restored; owner-only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestPost } from '../functions/api/deletions.js';
import { purge, settle, COUNTDOWN_MS } from '../functions/api/_deletion-logic.js';
import { buildFeedback } from '../scripts/sync-state.mjs';
import { d1 } from './d1-sqlite.mjs';
const A = 'sha256:' + 'a'.repeat(64), B = 'sha256:' + 'b'.repeat(64), C = 'sha256:' + 'c'.repeat(64);
const req = (body, tok = 'pw') => new Request('https://n.test/api/deletions', { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + tok, 'cf-connecting-ip': '1.2.3.' + (tok === 'pw' ? 4 : 9), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const post = async (env, b, tok) => { const r = await onRequestPost({ request: req(b, tok), env }); return { status: r.status, j: await r.json() }; };
const trash = async (env, id, keys) => { for (let i = 0; i < 5; i++) await post(env, { action: 'click', id, snapshot: { title: id.slice(-4), keys } }); };

test('purge logic: only trashed rows, keeps status + snapshot, idempotent timestamp', () => {
  const t = 1e6, tr = { status: 'trashed', trashed_at: t, snapshot: { keys: ['x:@a'] } };
  assert.equal(purge(null, t), null); assert.equal(purge({ status: 'pending', expires_at: t + 1 }, t), null); assert.equal(purge({ status: 'restored' }, t), null);
  const p = purge(tr, t + 5); assert.equal(p.status, 'trashed'); assert.equal(p.purged_at, t + 5); assert.deepEqual(p.snapshot, tr.snapshot);
  assert.equal(purge(p, t + 9).purged_at, t + 5);
  assert.equal(purge({ status: 'pending', expires_at: t, deleted_at: t - COUNTDOWN_MS }, t + 1).purged_at, t + 1);   // an expired countdown settles to trashed first
  assert.equal(settle(p, t + 99).purged_at, t + 5);
});

test('/api/deletions purge + purge_all: row kept as trashed, not restorable, still hides + teaches 少推; owner-only', async () => {
  const env = { DB: d1(), RATINGS_TOKEN: 'pw' };
  await trash(env, A, ['x:@spam']); await trash(env, B, ['repo:a/b']); await post(env, { action: 'click', id: C, snapshot: { title: 'c' } });   // C stays pending
  assert.equal((await post(env, { action: 'purge', id: C })).status, 409);                       // a countdown can't be purged
  const r = await post(env, { action: 'purge', id: A }); assert.equal(r.status, 200); assert.equal(r.j.item.status, 'trashed'); assert.ok(r.j.item.purged_at > 0);
  assert.equal((await post(env, { action: 'restore', id: A })).status, 409);                     // 永久删除 is final
  assert.equal((await post(env, { action: 'click', id: A })).status, 409);
  const all = await post(env, { action: 'purge_all' }); assert.equal(all.j.purged, 1); assert.deepEqual(Object.keys(all.j.items), [B]);
  const row = env.DB.db.prepare('SELECT status, purged_at, snapshot FROM deletions WHERE item_id=?').get(A); assert.equal(row.status, 'trashed'); assert.ok(row.purged_at); assert.match(row.snapshot, /x:@spam/);
  const g = await (await onRequestGet({ request: req(), env })).json();
  assert.equal(g.items[A].status, 'trashed'); assert.ok(g.items[A].purged_at && g.items[B].purged_at); assert.equal(g.items[C].status, 'pending'); assert.equal(g.items[C].purged_at, null);
  // the edition pipeline (sync-state → feedback.json → learning.py / generate.py) still sees purged rows as trashed: hidden + penalised
  const card = id => ({ id, source: 'x', url: 'https://x.com/spam/status/1', source_label: 'X · @spam', keywords: [] });
  const fb = buildFeedback(g, { items: {} }, { [A]: card(A) });
  assert.ok(fb.trashed.some(t => t.id === A && t.keys.includes('x:@spam'))); assert.ok(fb.trashed.some(t => t.id === B));
  // guests / wrong token can't purge
  assert.notEqual((await post(env, { action: 'purge_all' }, 'nope')).status, 200);
});
