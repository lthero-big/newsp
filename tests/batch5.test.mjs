// 偏好 · 模型 card data (scripts/llm-usage.mjs), /api/prefs reduce_motion, 主题 page + motion.js on every page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compact, mergeUsage, loadUsage, KEEP } from '../scripts/llm-usage.mjs';
import { clean } from '../functions/api/prefs.js';
import { loadChain, parseChain } from '../scripts/llm-chain.mjs';

test('llm-usage: compact keeps names/counts only; merge dedupes date+run, newest first, capped', () => {
  const s = { items: 8, written: 7, calls: [{ provider: 'gpt', model: 'm1', in: 1, out: 2, prompt: 'SECRET' }], providers: ['gpt:m1', 'ds:m2'], fallbacks: ['ds'], in: 1200.4, out: 300, sec: 12.6, errors: ['a', 'b'], key: 'sk-x' };
  const c = compact('2026-10-20', 'pm', s);
  assert.deepEqual(c, { date: '2026-10-20', run: 'pm', models: ['gpt:m1', 'ds:m2'], in: 1200, out: 300, calls: 1, sec: 13, written: 7, items: 8, fallbacks: ['ds'], errors: 2, per: { gpt: { calls: 1, in: 1, out: 2 } } });
  assert.doesNotMatch(JSON.stringify(c), /SECRET|sk-x/);
  const old = { ...c, in: 1 }, many = Array.from({ length: 20 }, (_, i) => ({ ...c, date: `2026-09-${String(i + 1).padStart(2, '0')}` }));
  const m = mergeUsage([old, ...many], [c, { ...c, run: 'am' }, { date: 'bad' }]);
  assert.equal(m.length, KEEP); assert.equal(m[0].run, 'pm'); assert.equal(m[0].in, 1200); assert.equal(m[1].run, 'am');
});
test('llm-usage: loadUsage folds var/llm into data/state/llm-usage.json, reads it back without var/', async () => {
  const r = await mkdtemp(join(tmpdir(), 'nd-usage-')); await mkdir(join(r, 'var/llm'), { recursive: true });
  await writeFile(join(r, 'var/llm/2026-10-21-am.summary.json'), JSON.stringify({ providers: ['gpt:x'], in: 10, out: 5, calls: [], fallbacks: [] }));
  await writeFile(join(r, 'var/llm/2026-10-21.jsonl'), '{}');
  assert.equal(loadUsage(r).length, 1);
  const f = JSON.parse(await readFile(join(r, 'data/state/llm-usage.json'), 'utf8')); assert.equal(f.runs[0].date, '2026-10-21');
  const r2 = await mkdtemp(join(tmpdir(), 'nd-usage-')); await mkdir(join(r2, 'data/state'), { recursive: true }); await writeFile(join(r2, 'data/state/llm-usage.json'), JSON.stringify(f));
  assert.deepEqual(loadUsage(r2), f.runs); assert.deepEqual(loadUsage(await mkdtemp(join(tmpdir(), 'nd-usage-'))), []);
});
test('/api/prefs: reduce_motion is boolean or null', () => {
  assert.deepEqual(clean({ reduce_motion: true }), { reduce_motion: true });
  assert.deepEqual(clean({ reduce_motion: null }), { reduce_motion: null });
  assert.throws(() => clean({ reduce_motion: 'yes' })); assert.throws(() => clean({ reduce_motion: 1 }));
});
test('build: 偏好与主题 lists every dock theme + 减少动效 switch, motion.js in <head>, 全部主题 → settings#theme, 模型 page read-only, old URLs redirect', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'nd-b5-')), dist = join(tmp, 'dist');
  execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, NEWS_DIST_DIR: dist, NEWS_CATALOG_FILE: join(tmp, 'catalog.js'),
    NEWS_LLM_PROVIDER: 'deepseek', NEWS_LLM_API_KEY: 'sk-testkey123', NEWS_LLM_FALLBACK_BASE_URL: 'https://api.example.com/v1', NEWS_LLM_FALLBACK_MODEL: 'my-model', NEWS_LLM_FALLBACK_API_KEY: 'sk-x' } });
  const th = await readFile(join(dist, 'settings.html'), 'utf8');
  const orbs = (th.match(/<button class="orb" type="button" role="menuitemradio"/g) || []).length, cards = (th.match(/<li class="tcard"/g) || []).length;
  assert.ok(orbs > 1); assert.equal(cards, orbs); assert.equal((th.match(/<em class="wk">本周<\/em>/g) || []).length, 1);
  assert.match(th, /<button class="switch" id="rmsw" type="button" role="switch" aria-checked="false"/); assert.match(th, /assets\/settings\.js\?v=[0-9a-f]{10}/);
  assert.match(th, /id="learn"/); assert.match(th, /id="theme"/); assert.match(th, /id="llist"/);
  const day = (await readdir(join(dist, '2026'), { recursive: true })).find(f => f.endsWith('.html'));
  for (const f of [...(await readdir(dist)).filter(f => f.endsWith('.html')), join('2026', day)]) { const h = await readFile(join(dist, f), 'utf8'); if (!h.includes('assets/style.css')) continue;  // 404.html + redirect stubs are self-contained
    const i = h.indexOf('assets/motion.js?v='), j = h.indexOf('</head>'); assert.ok(i > 0 && i < j, f + ' motion.js in head');
    if (/class="tsw"/.test(h)) assert.match(h, /<a class="tall" href="[^"]*settings\.html#theme"/, f);
    assert.match(h, /<div class="umenu"[ >]/, f + ' avatar menu'); }
  for (const [f, to] of [['prefs.html', 'settings.html#learn'], ['themes.html', 'settings.html#theme']]) assert.ok((await readFile(join(dist, f), 'utf8')).includes(`<meta http-equiv="refresh" content="0;url=${to}">`), f);
  const m = await readFile(join(dist, 'models.html'), 'utf8');
  assert.match(m, /<div class="failover"/); assert.equal((m.match(/<li class="prov"/g) || []).length, 2);
  const names = [...m.matchAll(/<li class="prov"[\s\S]*?<code>([^<]+)<\/code>/g)].map(x => x[1]);
  assert.deepEqual(names, ['deepseek-chat', 'my-model']);
  for (const bad of [/API_KEY/i, /\bsk-[A-Za-z0-9]/, /zuvi/i, /s2a\./i, /https?:\/\/api\./i, /<input/]) assert.doesNotMatch(m, bad, 'models page leaks ' + bad);
  assert.match(await readFile(join(dist, 'assets/motion.js'), 'utf8'), /NDMotion/);
});

test('llm-chain: slots from env + preset labels from scripts/llm.py, labels only (no keys / urls / env names)', async () => {
  const env = { NEWS_LLM_PROVIDER: 'qwen', NEWS_LLM_API_KEY: 'sk-secret', NEWS_LLM_FALLBACK_BASE_URL: 'https://gw.example.com/v1', NEWS_LLM_FALLBACK_MODEL: 'm2', NEWS_LLM_FALLBACK_API_KEY: 'k' };
  const { chain } = loadChain(process.cwd(), env);
  assert.deepEqual(chain.map(c => [c.name, c.label, c.model]), [['primary', '通义千问', 'qwen-plus'], ['fallback', 'OpenAI 兼容', 'm2']]);
  const s = JSON.stringify(chain);
  for (const bad of [/KEY/, /https?:/, /BASE/, /secret/]) assert.doesNotMatch(s, bad);
  assert.deepEqual(parseChain('nothing here', env), { chain: [], optin: [] });
  assert.deepEqual(loadChain(process.cwd(), {}).chain, []);
});
