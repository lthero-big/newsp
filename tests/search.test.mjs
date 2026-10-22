// 收藏 / 往期 search (site/assets/search.js) + page structure for the shared hero calendar (.phero/.pcal) on both pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const src = await readFile(new URL('../site/assets/search.js', import.meta.url), 'utf8');
const load = () => { const module = { exports: {} }; vm.runInNewContext(src, { module, globalThis: {} }); return module.exports; };
const S = load();
const items = [
  { id: 'a', date: '2026-10-21', module: 'model', title: 'Mistral 新语音模型登上评测榜', title_orig: 'Voxtral Small Transcribe 3', excerpt: 'Speech to Text leaderboard', source: 'X · @ArtificialAnlys', tags: ['AI', 'LLM'] },
  { id: 'b', date: '2026-10-20', module: 'community', title: '美国要求联邦机构全面清除 DeepSeek', excerpt: '', source: 'Hacker News', tags: ['AI'] },
  { id: 'c', date: '2026-10-19', module: 'community', prompt_pick: true, title: '赛博朋克海报', excerpt: 'an image', source: 'r/StableDiffusion', tags: ['图片视频音频'], prompt: { text: 'neon city, cinematic lighting, 35mm' } },
];
const ids = q => S.filter(items, q).map(m => m.id);

test('search: case-insensitive, Chinese substring, AND terms', () => {
  assert.deepEqual(ids('deepseek'), ['b']);
  assert.deepEqual(ids('DEEPSEEK'), ['b']);
  assert.deepEqual(ids('语音'), ['a']);            // Chinese substring inside a word
  assert.deepEqual(ids('模型 mistral'), ['a']);     // terms ANDed, any order
  assert.deepEqual(ids('模型 deepseek'), []);
  assert.deepEqual(ids('ＤｅｅｐＳｅｅｋ'), ['b']);     // full-width → NFKC
});

test('search: fields — source/handle, tags, module name, original title, prompt text', () => {
  assert.deepEqual(ids('@artificialanlys'), ['a']);
  assert.deepEqual(ids('hacker news'), ['b']);
  assert.deepEqual(ids('图片视频音频'), ['c']);
  assert.deepEqual(ids('今日提示词'), ['c']);       // prompt picks file under 今日提示词
  assert.deepEqual(ids('transcribe'), ['a']);
  assert.deepEqual(ids('cinematic lighting'), ['c']);
});

test('search: empty / whitespace query keeps everything', () => {
  assert.equal(S.filter(items, '').length, 3);
  assert.equal(S.filter(items, '   ').length, 3);
  assert.deepEqual([...S.terms('  A  b ')], ['a', 'b']);
});

test('search: hl marks hits (case-insensitive, merged overlaps) and escapes everything else', () => {
  assert.equal(S.hl('DeepSeek <b>V4</b>', 'deepseek'), '<mark>DeepSeek</mark> &lt;b&gt;V4&lt;/b&gt;');
  assert.equal(S.hl('模型 Mistral 模型', '模型'), '<mark>模型</mark> Mistral <mark>模型</mark>');
  assert.equal(S.hl('abcdef', ['abc', 'cde']), '<mark>abcde</mark>f');            // overlapping terms → one mark
  assert.equal(S.hl('a & b', ''), 'a &amp; b');
  assert.equal(S.hl('ＤｅｅｐＳｅｅｋ x', 'deepseek'), '<mark>ＤｅｅｐＳｅｅｋ</mark> x');   // full-width text, NFKC keeps the length
  assert.equal(S.hl('no hit "here"', 'zz'), 'no hit &quot;here&quot;');
  assert.equal(S.hl(null, 'a'), '');
});

test('build: 收藏 hero calendar, 往期 big month calendar, search box on both; no hero text squeezed into one grid column', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'nd-search-')), dist = join(tmp, 'dist');
  execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, NEWS_DIST_DIR: dist, NEWS_CATALOG_FILE: join(tmp, 'catalog.js') } });
  const arch = await readFile(join(dist, 'archive.html'), 'utf8'), fav = await readFile(join(dist, 'favorites.html'), 'utf8');
  assert.match(fav, /<section class="hero phero"><div class="hero-main">/);
  assert.match(fav, /class="pcal[^"]*"[^>]*><div class="calbox"><div class="roll" role="img"><\/div><div class="cal"><\/div>/);
  assert.match(fav, /assets\/calendar\.js\?v=[0-9a-f]{10}/);
  for (const h of [arch, fav]) { assert.match(h, /assets\/search\.js\?v=[0-9a-f]{10}/);
    assert.match(h, /<input type="search" id="(aq|fq)"/); assert.match(h, /class="sx" aria-label="清除搜索" hidden/); }
  // 往期: one calendar only (the big month grid, public) — no DDCal hero calendar; data in #arch-data defaults to the latest edition
  assert.doesNotMatch(arch, /class="pcal|class="calbox|assets\/calendar\.js/);
  assert.match(arch, /<section class="hero ahero"><div class="hero-main">/);
  assert.match(arch, /<section class="amonth" hidden aria-label="月历">/); assert.doesNotMatch(arch, /class="amonth[^"]*owner-only/);
  const m = arch.match(/<script type="application\/json" id="arch-data">([^<]*)<\/script>/); assert.ok(m, 'archive data');
  const A = JSON.parse(m[1]), dates = Object.keys(A.days).sort();
  assert.ok(dates.length > 0); assert.equal(A.cur, dates[dates.length - 1]);
  for (const d of dates) { assert.match(arch, new RegExp(`<a class="day" data-d="${d}" href="${d.slice(0, 4)}/${d.slice(5, 7)}/${d}\\.html">`));
    const x = A.days[d]; assert.ok(x.n > 0); assert.ok(x.top.length > 0 && x.top.length <= 6, d);
    for (const t of x.top) { assert.equal(t.length, 5); assert.match(t[2], /^https?:/); } }
  assert.match(arch, /assets\/archive\.js\?v=[0-9a-f]{10}/); assert.match(arch, /id="sres" hidden/);
  assert.match(arch, /<div class="amods" role="group" aria-label="按模块筛选" hidden>/);
  assert.match(fav, /<div class="pcal owner-only">/);
  // every root page hero puts its text in .hero-main (a bare <div> lands in 1 of 12 columns: kicker/h1 wrapped per character)
  for (const f of ['archive.html', 'favorites.html', 'trash.html', 'sources.html', 'prefs.html', 'themes.html', 'mcp-admin.html']) assert.doesNotMatch(await readFile(join(dist, f), 'utf8'), /<section class="hero[^"]*"><div>/, f);
});
