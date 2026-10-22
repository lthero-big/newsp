// 学到的偏好: scripts/learned.mjs must report exactly the strengths learning.py ranks with (parity via python), and /api/learned's undo
// (boost '+key' / penalty key in penalty_overrides) must move both sides the same way.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { learned } from '../scripts/learned.mjs';
import { buildFeedback } from '../scripts/feedback.mjs';
import { compute, onRequestPost } from '../functions/api/learned.js';
import { d1 } from './d1-sqlite.mjs';
const NOW = 1792500000000, D = 864e5, id = n => 'sha256:' + String(n).padStart(64, '0');
const py = fb => JSON.parse(execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'scripts/collect'); from learning import Feedback
d=json.loads(sys.stdin.read()); f=Feedback(d, ${NOW}); print(json.dumps({"boost": f.boost, "penalty": f.penalty}))`], { input: JSON.stringify(fb) }).toString());
const fb = {
  trashed: [{ id: id(1), at: NOW - 2 * D, keys: ['x:@spam', 'kw:mailcheap'] }, { id: id(2), at: NOW - 40 * D, keys: ['kw:mailcheap', 'site:openai.com'] },
    { id: id(3), at: NOW - 1 * D, keys: ['site:openai.com', 'repo:a/b'] }, { id: id(4), at: NOW - 3 * D, keys: ['kw:qwen3', 'repo:c/d'] }],
  disliked: [{ id: id(5), at: NOW - 5 * D, keys: ['x:@spam', 'sub:foo'], weight: 0.5 }, { id: id(6), at: NOW - 6 * D, keys: ['kw:mailcheap'], weight: 0.5 }],
  liked: [{ id: id(7), at: NOW - D, keys: ['x:@karpathy', 'repo:e/f'], weight: 1 }, { id: id(8), at: NOW - 10 * D, keys: ['x:@karpathy'], weight: 1 },
    { id: id(9), at: NOW - 70 * D, keys: ['repo:e/f', 'x:@old'], weight: 1 }],
  overrides: { 'repo:a/b': NOW - D / 2, '+repo:e/f': NOW - 2 * D },
};
const asMap = rows => Object.fromEntries(rows.map(r => [r.key, r.s]));
const close = (a, b, m) => { assert.deepEqual(Object.keys(a).sort(), Object.keys(b).filter(k => b[k] > 0.005).sort(), m); for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - b[k]) < 2e-3, `${m} ${k} ${a[k]} vs ${b[k]}`); };

test('learned.mjs strengths == learning.py (gating, brands, decay, cap, penalty + boost overrides)', () => {
  const L = learned(fb, NOW), P = py(fb);
  close(asMap(L.penalty), P.penalty, 'penalty'); close(asMap(L.boost), P.boost, 'boost');
  assert.ok(!asMap(L.penalty)['repo:a/b'], 'cleared penalty'); assert.ok(!asMap(L.penalty)['kw:qwen3'], 'brand kw never'); assert.ok(asMap(L.penalty)['kw:mailcheap'] > 0, 'kw gated by 2 items');
  const ef = L.boost.find(r => r.key === 'repo:e/f'); assert.equal(ef.n, 1, 'like before the boost clear no longer counts'); assert.ok(Math.abs(ef.s - 0.5 ** (1 / 30)) < 1e-3);
  assert.ok(!asMap(L.boost)['x:@old'] || asMap(L.boost)['x:@old'] < 0.3);
  const k = L.boost.find(r => r.key === 'x:@karpathy'); assert.equal(k.n, 2); assert.equal(k.effect, +Math.min(0.3, 0.08 * k.s).toFixed(3));
  const sp = L.penalty.find(r => r.key === 'x:@spam'); assert.deepEqual(sp.c, { del: 1, dis: 1 }); assert.ok(sp.effect < 0);
  assert.deepEqual(L.cleared.map(c => c.kind).sort(), ['boost', 'penalty']);
});

test('/api/learned on sqlite: same events as sync-state, undo/redo for boost and penalty', async () => {
  const DB = d1(), env = { DB, RATINGS_TOKEN: 'pw' }, T = Date.now();
  const FK = { [id(1)]: [['x:@karpathy', 'repo:e/f'], '卡帕西'], [id(2)]: [['x:@karpathy'], '第二条'], [id(3)]: [['x:@spam', 'repo:z/z'], '垃圾'], [id(4)]: [['sub:foo'], '少推的'] };
  DB.db.exec(`INSERT INTO ratings (user_id,item_id,fav,vote,updated_at) VALUES ('me','${id(1)}',1,0,${T - 3 * D}),('me','${id(2)}',0,1,${T - D}),('me','${id(4)}',0,-1,${T - D}),('me','${id(9)}',1,1,${T})`);
  DB.db.exec(`INSERT INTO deletions (user_id,item_id,status,deleted_at,expires_at,clicks,trashed_at,snapshot,updated_at) VALUES ('me','${id(3)}','pending',${T - 2 * D},${T - D},1,NULL,'{"keys":["x:@spam","repo:z/z"],"title":"垃圾"}',${T - 2 * D})`);
  let L = await compute(env, T, FK);
  assert.deepEqual(L.boost.map(r => r.key).sort(), ['repo:e/f', 'x:@karpathy']);           // id(9) unknown card → ignored like sync-state
  assert.deepEqual(L.boost.find(r => r.key === 'x:@karpathy').c, { fav: 1, like: 1 });
  assert.deepEqual(L.penalty.map(r => r.key).sort(), ['repo:z/z', 'sub:foo', 'x:@spam']);  // expired countdown counts as trashed
  // equal to the sync-state path (buildFeedback with the same keys) through learning.py
  const fb = buildFeedback({ items: { [id(3)]: { status: 'trashed', trashed_at: T - D, snapshot: { keys: ['x:@spam', 'repo:z/z'] } } }, overrides: {} },
    { items: { [id(1)]: { fav: true, vote: 0, updatedAt: T - 3 * D }, [id(2)]: { fav: false, vote: 1, updatedAt: T - D }, [id(4)]: { fav: false, vote: -1, updatedAt: T - D } } }, i => FK[i]?.[0] || null);
  const P = JSON.parse(execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'scripts/collect'); from learning import Feedback
d=json.loads(sys.stdin.read()); f=Feedback(d, ${T}); print(json.dumps({"boost": f.boost, "penalty": f.penalty}))`], { input: JSON.stringify(fb) }).toString());
  close(asMap(L.penalty), P.penalty, 'api penalty'); close(asMap(L.boost), P.boost, 'api boost');
  const req = body => new Request('https://n.test/api/learned', { method: 'POST', headers: { authorization: 'Bearer pw', 'cf-connecting-ip': '1.2.3.4', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let r = await onRequestPost({ request: req({ action: 'clear', kind: 'boost', key: 'x:@karpathy' }), env }); assert.equal(r.status, 200);
  assert.equal(DB.db.prepare("SELECT count(*) n FROM penalty_overrides WHERE key='+x:@karpathy'").get().n, 1);
  await onRequestPost({ request: req({ action: 'clear', kind: 'penalty', key: 'x:@spam' }), env });
  L = await compute(env, Date.now() + 1, FK);
  assert.ok(!L.boost.some(r => r.key === 'x:@karpathy') && !L.penalty.some(r => r.key === 'x:@spam'));
  assert.equal(L.cleared.length, 2);
  await onRequestPost({ request: req({ action: 'unclear', kind: 'boost', key: 'x:@karpathy' }), env });
  L = await compute(env, Date.now() + 1, FK); assert.ok(L.boost.some(r => r.key === 'x:@karpathy'));
  assert.equal((await onRequestPost({ request: req({ action: 'clear', kind: 'boost', key: 'bad key' }), env })).status, 400);
  // learning.py reads the same overrides from feedback.json: '+key' clears the boost, plain key the penalty
  const P2 = JSON.parse(execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'scripts/collect'); from learning import Feedback
d=json.loads(sys.stdin.read()); f=Feedback(d, ${T + 1}); print(json.dumps({"boost": f.boost, "penalty": f.penalty}))`], { input: JSON.stringify({ ...fb, overrides: { '+x:@karpathy': T, 'x:@spam': T } }) }).toString());
  assert.ok(!P2.boost['x:@karpathy'] && !P2.penalty['x:@spam'] && P2.boost['repo:e/f'] > 0);
});
