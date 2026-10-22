import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { click, undo, settle, COUNTDOWN_MS } from '../functions/api/_deletion-logic.js';
import { itemKeys, strengths } from '../scripts/keys.mjs';
import { buildFeedback } from '../scripts/sync-state.mjs';

test('delete countdown: 12h, each click halves, 5th click trashes, undo, restart', () => {
  const t0 = 1_000_000;
  let r = click(null, t0, { title: 'x' });
  assert.equal(r.status, 'pending'); assert.equal(r.expires_at - t0, COUNTDOWN_MS); assert.equal(r.clicks, 1);
  r = click(r, t0 + 3600e3);                         // 11h left → 5.5h
  assert.equal(r.expires_at, t0 + 3600e3 + 5.5 * 3600e3); assert.equal(r.clicks, 2);
  r = click(r, t0 + 3600e3); r = click(r, t0 + 3600e3);
  assert.equal(r.clicks, 4); assert.equal(r.status, 'pending');
  r = click(r, t0 + 3600e3);
  assert.equal(r.status, 'trashed'); assert.equal(r.trashed_at, t0 + 3600e3);
  const u = undo(r, t0 + 7200e3); assert.equal(u.status, 'restored');
  const again = click(u, t0 + 9000e3); assert.equal(again.status, 'pending'); assert.equal(again.expires_at - (t0 + 9000e3), COUNTDOWN_MS); assert.equal(again.clicks, 1);
  assert.equal(again.snapshot.title, 'x');
  const exp = settle(click(null, t0), t0 + COUNTDOWN_MS + 1); assert.equal(exp.status, 'trashed');
  assert.equal(click(exp, t0 + COUNTDOWN_MS + 2).clicks, 1);   // deleting a trashed item again restarts
});

test('specific keys only (no broad tags), JS and Python key extraction agree', () => {
  const cards = [
    { source: 'rss', url: 'https://github.com/ggml-org/llama.cpp/releases/tag/b1', source_label: 'llamacpp-releases', keywords: ['AI', 'LLM', 'Llama', 'GGUF'] },
    { source: 'x', url: 'https://x.com/Kalshi/status/1', source_label: 'X · @Kalshi', keywords: ['OpenAI', 'agent'] },
    { source: 'hf', url: 'https://huggingface.co/Lightricks/LTX-2.5', source_label: 'Hugging Face', keywords: ['LTX-Video', 'text-to-video'] },
    { source: 'reddit', url: 'https://www.reddit.com/r/StableDiffusion/comments/x', source_label: 'r/StableDiffusion', keywords: ['FLUX', 'diffusion'] },
    { source: 'hn', url: 'https://www.theverge.com/a', source_label: 'Hacker News', keywords: ['Claude Code', 'model'] },
  ];
  const js = cards.map(itemKeys);
  assert.deepEqual(js[0], ['feed:llamacpp-releases', 'repo:ggml-org/llama.cpp']);
  assert.deepEqual(js[2], ['hf:lightricks', 'hffam:lightricks/ltx', 'kw:ltx-video']);
  assert.ok(js.flat().every(k => !/^kw:(ai|llm|agent|model|diffusion|gguf|text-to-video)$/.test(k)));
  const py = JSON.parse(execFileSync('python3', ['-c', 'import json,sys;sys.path.insert(0,"scripts/collect");import learning;print(json.dumps([learning.item_keys(c) for c in json.load(sys.stdin)]))'], { input: JSON.stringify(cards) }).toString());
  assert.deepEqual(py, js);
});

test('penalty strength decays (30d half-life), stacks to cap, overrides clear, feedback file', () => {
  const now = 100 * 864e5;
  const s = strengths([{ at: now, keys: ['repo:a/b'] }, { at: now - 30 * 864e5, keys: ['repo:a/b', 'x:@c'] }], {}, now);
  assert.equal(s['repo:a/b'], 1.5); assert.equal(s['x:@c'], 0.5);
  assert.equal(strengths([1, 2, 3].map(() => ({ at: now, keys: ['k:x'] })), {}, now)['k:x'], 2);
  assert.equal(strengths([{ at: now - 1, keys: ['k:x'] }], { 'k:x': now }, now)['k:x'], undefined);
  const card = { id: 'sha256:1', source: 'x', url: 'https://x.com/a/status/1', source_label: 'X · @a', keywords: [] };
  const fb = buildFeedback({ items: { 'sha256:1': { status: 'trashed', trashed_at: 5, snapshot: { keys: [] } }, 'sha256:2': { status: 'restored' }, 'sha256:3': { status: 'pending' } }, overrides: { 'x:@z': 9 } },
    { items: { 'sha256:1': { fav: false, vote: 0 }, 'sha256:4': { fav: true, vote: 1, updatedAt: 7 } } }, { 'sha256:1': card, 'sha256:4': { ...card, id: 'sha256:4' } });
  assert.deepEqual(fb.trashed.map(t => [t.id, t.keys]), [['sha256:1', ['x:@a']]]);
  assert.deepEqual(fb.pending, ['sha256:3']); assert.equal(fb.liked[0].weight, 1); assert.deepEqual(fb.overrides, { 'x:@z': 9 });
});

// v3.2: broad brands never penalized; kw: / first-party lab channels need >=2 distinct deletes; mirrors learning.py
import { strengths as st32, itemKeys as ik32, isBrand as ib32 } from '../scripts/keys.mjs';
import { execFileSync as ex32 } from 'node:child_process';
test('penalty gating: brands, first-party, kw needs 2 items', () => {
  const now = Date.parse('2026-10-16T09:00:00Z'), at = now - 3600e3;
  const ev = [
    { id: 'a', at, keys: ['kw:claude', 'kw:claude_code', 'kw:nvidia', 'kw:scion', 'site:snitch.alphaventure.com'] },
    { id: 'b', at, keys: ['feed:hf-blog', 'kw:nvidia', 'repo:x/y'] },
    { id: 'c', at, keys: ['feed:openai-news', 'kw:openai', 'site:openai.com'] },
  ];
  assert.deepEqual(Object.keys(st32(ev, {}, now, true)).sort(), ['repo:x/y', 'site:snitch.alphaventure.com']);
  const ev2 = [...ev, { id: 'd', at, keys: ['kw:scion', 'site:openai.com'] }];
  assert.deepEqual(Object.keys(st32(ev2, {}, now, true)).sort(), ['kw:scion', 'repo:x/y', 'site:openai.com', 'site:snitch.alphaventure.com']);
  assert.ok(Object.keys(st32(ev, {}, now)).includes('kw:nvidia'), 'boost path ungated');
  assert.deepEqual(ik32({ url: 'https://news.ycombinator.com/x', source: 'hn', keywords: ['Claude Code', 'NVIDIA', 'GPT-5', 'scion'] }), ['kw:scion']);
  assert.ok(ib32('qwen3') && !ib32('metallica'));
  const py = ex32('python3', ['-c', `import sys,json;sys.path.insert(0,'scripts/collect');import learning as l
ev=json.loads(sys.argv[1]);print(json.dumps(sorted(l.strengths(ev,{},${now},gate=True))))`, JSON.stringify(ev2)], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(py), ['kw:scion', 'repo:x/y', 'site:openai.com', 'site:snitch.alphaventure.com']);
});

// v3.6: vote 1 / 收藏 → liked 1 (once per item); vote -1 → disliked 0.5 (not when 收藏); 已收起 is never a signal; legacy rating rows mapped
import { buildFeedback as bf36 } from '../scripts/sync-state.mjs';
import { tasteHtml } from '../scripts/build.mjs';
test('feedback v3.6: votes + favourites; tucks ignored; legacy ratings mapped', () => {
  const card = id => ({ id, source: 'x', url: `https://x.com/a${id.slice(-1)}/status/1`, source_label: `X · @a${id.slice(-1)}`, keywords: [] });
  const ids = ['sha256:1', 'sha256:2', 'sha256:3', 'sha256:4', 'sha256:5', 'sha256:6', 'sha256:7', 'sha256:8'], cards = Object.fromEntries(ids.map(i => [i, card(i)]));
  const fb = bf36({ items: {} }, { items: { 'sha256:1': { vote: 1, updatedAt: 5 }, 'sha256:2': { vote: -1, updatedAt: 5 }, 'sha256:3': { vote: 0, fav: true, updatedAt: 5 },
      'sha256:4': { vote: 1, fav: true, updatedAt: 5 }, 'sha256:5': { vote: -1, fav: true, updatedAt: 5 }, 'sha256:6': { rating: 5, updatedAt: 5 }, 'sha256:7': { rating: 2, updatedAt: 5 }, 'sha256:8': { rating: 3, updatedAt: 5 } } },
    cards, { items: { 'sha256:8': { on: true, t: 9 } } });
  assert.deepEqual(fb.liked.map(d => [d.id, d.weight]), [['sha256:1', 1], ['sha256:3', 1], ['sha256:4', 1], ['sha256:5', 1], ['sha256:6', 1]]);
  assert.deepEqual(fb.disliked.map(d => [d.id, d.weight]), [['sha256:2', 0.5], ['sha256:7', 0.5]]);
  assert.equal(fb.tucked, undefined);
});
test('taste chip: only when factor > 1, owner-only, names the reason', () => {
  assert.equal(tasteHtml({ score: { total: 1, feedback: 0.8 } }), '');
  assert.equal(tasteHtml({ score: { total: 1 } }), '');
  const h = tasteHtml({ score: { total: 1, feedback: 1.16, feedback_why: ['x:@karpathy', 'kw:mcp_server'] } });
  assert.match(h, /class="taste owner-only"/); assert.match(h, /合你口味/); assert.match(h, /@karpathy、mcp server/);
});
