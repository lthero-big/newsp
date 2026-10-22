// /api/ratings + lockout, ported from design-daily. Uses a tiny in-memory D1 stand-in.
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestPost, voteOf } from '../functions/api/ratings.js';
import { ipBucket } from '../functions/api/_auth.js';

function fakeDb() {
  const ratings = new Map(), fails = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { if (sql.includes('FROM auth_fail')) return fails.get(args.join('|')) ?? null; return null; },
    async run() {
      if (sql.startsWith('INSERT INTO auth_fail')) fails.set(`${args[0]}|${args[1]}`, { count: args[2], first_at: args[3], locked_until: args[4] });
      else if (sql.startsWith('DELETE FROM auth_fail')) fails.delete(`${args[0]}|${args[1]}`);
      else if (sql.includes('INSERT INTO ratings')) { const prev = ratings.get(args[1]); if (!prev || args[4] > prev.updated_at) ratings.set(args[1], { item_id: args[1], fav: args[2], vote: args[3], updated_at: args[4] }); }
      return {};
    },
    async all() { return { results: [...ratings.values()] }; }
  });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); }, ratings, fails };
}
const id = 'sha256:' + 'a'.repeat(64);
const req = (pass, body, ip = '1.2.3.4') => new Request('https://radar.test/api/ratings', { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${pass}`, 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

test('unconfigured endpoint returns 503', async () => {
  assert.equal((await onRequestGet({ request: req('x'), env: {} })).status, 503);
});

test('owner can write and read, newest wins, invalid ids ignored', async () => {
  const env = { DB: fakeDb(), RATINGS_TOKEN: 'open-sesame' };
  let res = await onRequestPost({ request: req('open-sesame', { items: { [id]: { fav: true, vote: 1, updatedAt: 1000 }, 'bad id': { fav: true } } }), env });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, { [id]: { fav: true, vote: 1, updatedAt: 1000 } });
  await onRequestPost({ request: req('open-sesame', { items: { [id]: { fav: false, vote: -1, updatedAt: 500 } } }), env });
  res = await onRequestGet({ request: req('open-sesame'), env });
  assert.equal((await res.json()).items[id].vote, 1, 'older write ignored');
  await onRequestPost({ request: req('open-sesame', { items: { [id]: { fav: true, vote: -7, updatedAt: 2000 } } }), env });
  assert.equal(env.DB.ratings.get(id).vote, -1, 'clamped');
  // a pre-v3.6 client (rating only) is mapped like migration 0009
  for (const [r, v, t] of [[5, 1, 3000], [4, 1, 3100], [3, 0, 3200], [2, -1, 3300], [1, -1, 3400], [0, 0, 3500]]) {
    await onRequestPost({ request: req('open-sesame', { items: { [id]: { fav: true, rating: r, favAuto: true, updatedAt: t } } }), env });
    assert.equal(env.DB.ratings.get(id).vote, v, `rating ${r}`); }
  assert.equal(voteOf({ vote: 0, rating: 5 }), 0, 'vote wins over rating');
});

test('three wrong passphrases lock the IP for 15 minutes', async () => {
  const env = { DB: fakeDb(), RATINGS_TOKEN: 'open-sesame' };
  assert.equal((await onRequestGet({ request: req('nope'), env })).status, 401);
  assert.equal((await onRequestGet({ request: req('nope'), env })).status, 401);
  const locked = await onRequestGet({ request: req('nope'), env });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) > 800);
  assert.equal((await onRequestGet({ request: req('open-sesame'), env })).status, 429, 'locked even with the right passphrase');
  assert.equal((await onRequestGet({ request: req('open-sesame', null, '5.6.7.8'), env })).status, 200);
});

test('IPv6 clients bucket by /64', () => {
  assert.equal(ipBucket('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
});
