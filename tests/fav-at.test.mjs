// 收藏时间轴: ratings.fav_at (migration 0010) through the real /api/ratings SQL on sqlite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestPost, favAtOf } from '../functions/api/ratings.js';
import { d1 } from './d1-sqlite.mjs';
const id = 'sha256:' + 'b'.repeat(64), id2 = 'sha256:' + 'c'.repeat(64), T = 1792000000000; // 2026-10
const req = body => new Request('https://n.test/api/ratings', { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer pw', 'cf-connecting-ip': '1.2.3.4', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const post = async (env, items) => (await (await onRequestPost({ request: req({ items }), env })).json()).items;

test('migration 0010 backfills fav_at from updated_at for existing favourites only', () => {
  const D = d1();
  // pretend these rows predate 0010: clear the column, re-run the backfill statement
  D.db.exec(`INSERT INTO ratings (user_id,item_id,fav,vote,updated_at) VALUES ('me','${id}',1,0,${T}),('me','${id2}',0,1,${T + 5})`);
  D.db.exec('UPDATE ratings SET fav_at = NULL'); D.db.exec('UPDATE ratings SET fav_at = updated_at WHERE fav = 1 AND fav_at IS NULL');
  assert.deepEqual(D.db.prepare('SELECT item_id, fav_at FROM ratings ORDER BY item_id').all().map(r => ({ ...r })), [{ item_id: id, fav_at: T }, { item_id: id2, fav_at: null }]);
});

test('favAt: stored on favourite, kept while favourited, cleared on un-favourite, old clients fall back to updatedAt', async () => {
  const env = { DB: d1(), RATINGS_TOKEN: 'pw' };
  let it = await post(env, { [id]: { fav: true, vote: 0, updatedAt: T + 100, favAt: T + 90 } });
  assert.equal(it[id].favAt, T + 90);
  it = await post(env, { [id]: { fav: true, vote: 1, updatedAt: T + 200, favAt: T + 200 } });   // 点赞 later: first save time stays
  assert.equal(it[id].favAt, T + 90); assert.equal(it[id].vote, 1);
  it = await post(env, { [id]: { fav: false, vote: 1, updatedAt: T + 300 } });
  assert.equal(it[id].favAt, undefined); assert.equal(env.DB.db.prepare('SELECT fav_at FROM ratings').get().fav_at, null);
  it = await post(env, { [id]: { fav: true, vote: 1, updatedAt: T + 400 } });                // pre-0010 client: no favAt → write time
  assert.equal(it[id].favAt, T + 400);
  it = await post(env, { [id]: { fav: true, vote: 0, updatedAt: T + 350, favAt: T + 1 } });    // older write ignored entirely
  assert.equal(it[id].favAt, T + 400); assert.equal(it[id].vote, 1);
  it = await post(env, { [id2]: { fav: false, vote: 1, updatedAt: T + 500, favAt: T } });       // 点赞 only: no favAt
  assert.equal(it[id2].favAt, undefined);
  const g = await (await onRequestGet({ request: req(), env })).json(); assert.equal(g.items[id].favAt, T + 400);
});

test('favAtOf rejects junk / future times', () => {
  assert.equal(favAtOf({ favAt: 'x' }, 5), 5); assert.equal(favAtOf({ favAt: 1 }, 5), 5);
  assert.equal(favAtOf({ favAt: Date.now() + 3600e3 }, 5), 5); assert.equal(favAtOf({ favAt: T }, 5), T);
});
