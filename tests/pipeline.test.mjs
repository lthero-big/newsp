import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fill as fillMechanical } from '../scripts/fill.mjs';
import { validateDaily } from '../scripts/validate.mjs';
import { renderMarkdown } from '../scripts/render-markdown.mjs';
import { pickTheme, loadThemes, rng, themeCss } from '../scripts/theme.mjs';

const sample = JSON.parse(await readFile(new URL('./fixtures/daily-v2-sample.json', import.meta.url), 'utf8'));
const filled = () => fillMechanical(structuredClone(sample));

test('fill-mechanical v2 computes ids, modules and visibility; result validates', () => {
  const data = filled();
  assert.deepEqual(data.modules.map(m => [m.id, m.index, m.count]), [['model', '01', 1], ['opensource', '02', 1], ['community', '03', 1]]);
  assert.ok(data.items.every(c => /^sha256:[0-9a-f]{64}$/.test(c.id) && c.visibility === 'public'));
  assert.deepEqual(validateDaily(data), []);
});

test('v2 validator rejects unknown tags, wrong counts, HTML and design/project modules', () => {
  const data = filled();
  data.items[0].tags = ['设计'];
  assert.ok(validateDaily(data).some(e => e.includes('/items/0/tags')));
  const counts = filled(); counts.modules[0].count = 9;
  assert.ok(validateDaily(counts).some(e => e.includes('/modules/0/count')));
  const html = filled(); html.items[1].excerpt = '<b>x</b>';
  assert.ok(validateDaily(html).some(e => e.includes('HTML')));
  const design = filled(); design.items[0].module = 'design';
  assert.ok(validateDaily(design).length);
});

test('render-markdown v2 lists modules and cards', () => {
  const md = renderMarkdown(filled());
  assert.match(md, /## 01 模型新闻/);
  assert.match(md, /^# 每日 AI 新闻 2026-10-16/);
  assert.match(md, /## 02 开源项目发现/);
  assert.match(md, /\[acme\/agent-kit\]\(https:\/\/github.com\/acme\/agent-kit\)/);
  assert.doesNotMatch(md, /设计灵感|P0/);
});

test('daily theme is deterministic, weighted and covers several themes', () => {
  const themes = loadThemes();
  assert.ok(themes.length >= 6 && themes.length <= 8);
  for (const t of themes) for (const k of ['bg', 'surface', 'ink', 'accent', 'radius', 'font-display']) assert.ok(t.tokens[k], `${t.id}.${k}`);
  assert.equal(pickTheme('2026-10-16', themes).id, pickTheme('2026-10-16', themes).id);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pickTheme(new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10), themes).id));
  assert.ok(seen.size >= 5);
  const heavy = pickTheme('2026-10-16', themes, Object.fromEntries(themes.map(t => [t.id, t.id === 'multistate' ? 5 : 0])));
  assert.equal(typeof heavy.id, 'string');
  assert.equal(rng('x')(), rng('x')());
  assert.match(themeCss(themes), /\[data-theme="one-accent"\]\{color-scheme:dark;--bg:#151515/);
});

test('build renders the new design with modules, tag chips and owner-only controls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-v2-'));
  const dist = join(dir, 'dist');
  await writeFile(join(dir, '2026-10-16.json'), JSON.stringify(filled()));
  execFileSync('node', ['scripts/build.mjs'], { env: { ...process.env, NEWS_DATA_DIR: dir, NEWS_DIST_DIR: dist, NEWS_CATALOG_FILE: join(dir, 'catalog.js') } });
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  for (const s of ['模型新闻', '开源项目发现', '社区新闻', 'data-tag="图片视频音频"', 'class="glyph"', 'class="fav"', 'data-theme="', 'WebDev']) assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, /设计灵感|DESIGN INSPIRATION|FIELD NOTES/);
  const files = await readdir(dist);
  for (const f of ['archive.html', 'favorites.html', 'items.json']) assert.ok(files.includes(f), f);
  assert.ok(!files.some(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)), 'no day pages at the root (v3.6)');
  const day = await readFile(join(dist, '2026/10/2026-10-16.html'), 'utf8');
  assert.match(day, /href="\.\.\/\.\.\/assets\/style\.css\?v=[0-9a-f]{10}"/); assert.match(day, /data-root="\.\.\/\.\.\/"/);
  assert.match(await readFile(join(dist, 'archive.html'), 'utf8'), /href="2026\/10\/2026-10-16\.html"/);
  for (const s of ['class="like"', 'aria-label="点赞：多推这类"']) assert.ok(html.includes(s), s);
  for (const s of ['class="stars"', 'class="rv"', 'class="focus"', '⤢', 'focus.js']) assert.ok(!html.includes(s), 'removed: ' + s);
  const app = await readFile(join(dist, 'assets/app.js'), 'utf8');
  assert.match(app, /ArrowUp','ArrowUp'/);
  assert.match(app, /api\/ratings/);
});


test('15:00 batch badge, image srcset and pm validation', async () => {
  const { cardHtml } = await import('../scripts/build.mjs');
  const base = fillMechanical(sample).items[0];
  const pm = { ...base, batch: 'pm', fetched_at: '2026-10-16T07:00:00Z', image: { src: 'https://pbs.twimg.com/media/A?format=jpg&name=large', srcset: 'https://pbs.twimg.com/media/A?format=jpg&name=small 680w, https://pbs.twimg.com/media/A?format=jpg&name=orig 1600w', width: 1600, height: 900, alt: '' } };
  const html = cardHtml(pm, 0, '2026-10-16T08:00:00Z');
  assert.match(html, /15:00 新增/);
  assert.match(html, /data-batch="pm"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /aspect-ratio:1600 \/ 900/);
  assert.match(html, /sizes="/);
  assert.doesNotMatch(cardHtml(base, 0, '2026-10-16T08:00:00Z'), /15:00 新增/);
  const doc = fillMechanical({ ...sample, items: [...sample.items.slice(1), pm] });
  assert.deepEqual(validateDaily(doc), []);
  const bad = fillMechanical({ ...sample, items: [...sample.items.slice(1), { ...pm, fetched_at: undefined }] });
  bad.items.at(-1).fetched_at === undefined && delete bad.items.at(-1).fetched_at;
  assert.ok(validateDaily(bad).some(e => /fetched_at/.test(e)));
});

test('big theme is weekly', async () => {
  const { isoWeek } = await import('../scripts/theme.mjs');
  const themes = loadThemes();
  assert.equal(isoWeek('2026-10-12'), '2026-W42'); assert.equal(isoWeek('2026-10-18'), '2026-W42'); assert.equal(isoWeek('2026-10-19'), '2026-W43'); assert.equal(isoWeek('2027-01-01'), '2026-W53');
  for (const d of ['2026-10-13', '2026-10-14', '2026-10-17', '2026-10-18']) assert.equal(pickTheme(d, themes).id, pickTheme('2026-10-12', themes).id);
});

test('zh title + 原标题, explicit links (no overlay), lead only with image, weekly theme contrast guard', async () => {
  const { cardHtml, leadFirst } = await import('../scripts/build.mjs');
  const base = fillMechanical(sample).items[0];
  const html = cardHtml({ ...base, title_zh: '中文标题', summary_zh: '一句话摘要。' }, 0, '2026-10-16T08:00:00Z');
  assert.match(html, /中文标题<\/a><\/h3>/); assert.match(html, /原标题<\/span>/); assert.match(html, /原文 ↗/); assert.match(html, /title="看过，收起"/);
  assert.match(cardHtml(base, 0, '2026-10-16T08:00:00Z'), new RegExp(base.title.slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const img = { src: 'https://opengraph.githubassets.com/1/a/b', width: 1200, height: 600 };
  assert.deepEqual(leadFirst([{ id: 1 }, { id: 2 }, { id: 3 }]).map(([, l]) => l), [false, false, false]);
  const lf = leadFirst([{ id: 1 }, { id: 2, image: img }, { id: 3 }]); assert.equal(lf[0][0].id, 2); assert.equal(lf[0][1], true);
  const { extractTokens, contrast, run } = await import('../scripts/weekly-theme.mjs');
  const t = extractTokens({ params: { bg: '#fff6e5', accent: '#ff5d8f' }, code: 'body{background:#fff6e5;color:#2b2118} .b{border-radius:14px;color:#ff5d8f}' });
  assert.ok(contrast(t.tokens.ink, t.tokens.bg) >= 4.5 && contrast(t.tokens.muted, t.tokens.bg) >= 4.5);
  assert.throws(() => extractTokens({ code: 'no colours here' }));
});
