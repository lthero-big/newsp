// news-daily static site builder: data/<date>.json (schema 2.0) → dist/ (server-side HTML, daily seeded theme).
// Env: NEWS_DATA_DIR (default data/), NEWS_DIST_DIR (default dist/).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateDaily } from './validate.mjs';
import { itemKeys } from './keys.mjs';
import { loadThemes, pickTheme, themeCss, isoWeek } from './theme.mjs';
import { archFor, constrain, archThemes, ARCHS } from './archetypes.mjs';
import { loadIx, healthy, checkRegistry, loadFavs, fileHash } from './ix.mjs';
import { loadEditions, checkEditions, editionFor, themeIdOf, editionThemes, previewWeek } from './editions.mjs';
import { loadUsage } from './llm-usage.mjs';
import { loadChain } from './llm-chain.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// newsp: a fresh fork has no editions yet — fall back to the bundled example edition (examples/data) so the site and the
// tests build out of the box; the first real run writes data/<date>.json and the example is never used again.
const hasEditions = d => { try { return readdirSync(d).some(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return false; } };
const dataDir = resolve(process.env.NEWS_DATA_DIR || (hasEditions(join(root, 'data')) ? join(root, 'data') : join(root, 'examples/data')));
const argument = process.argv[2];
export const MODULES = [
  ['model', '模型新闻', '新模型、版本发布与榜单'],
  ['opensource', '开源项目发现', '新仓库、热门模型权重与工具发布'],
  ['community', '社区新闻', 'HN、Reddit 与 X 上的讨论']
];
export const TAGS = ['AI', 'LLM', '图片视频音频', 'Agent'];
const BOARD_LABELS = { code: 'WebDev', agent_code: 'Agent Code', text_to_image: 'Text→Image', image_edit: 'Image Edit', vision: 'Vision' };
function fail(message) { throw new Error(message); }

// cache-busting: hash of the shipped assets, so a deploy never mixes old CSS/JS with new HTML
// hero slot widgets: site/assets/hero/<name>.js (slot.js = registry/loader). Each widget gets its own content hash.
const HERO_FILES = readdirSync(join(root, 'site/assets/hero')).filter(f => f.endsWith('.js')).sort();
const HERO_V = Object.fromEntries(HERO_FILES.map(f => [f.replace(/\.js$/, ''), createHash('sha256').update(readFileSync(join(root, 'site/assets/hero', f))).digest('hex').slice(0, 10)]));
const HERO_ROTATION = ['story']; // weekly-seeded pool when no ?hero= / owner pref / theme.hero; add widget names here
const jsonAttr = o => JSON.stringify(o).replace(/</g, '\\u003c');
const ASSET_V = createHash('sha256').update(['style.css', 'arch.css', 'app.js', 'favorites.js', 'mcp-admin.js', 'trash.js', 'sources.js', 'v34.css', 'calendar.js', 'day-cal.js', 'cal.css', 'archive.js', 'search.js', 'motion.js', 'switch.js', 'settings.js', 'console.css'].map(f => readFileSync(join(root, 'site/assets', f), 'utf8')).join('') + HERO_FILES.map(f => readFileSync(join(root, 'site/assets/hero', f), 'utf8')).join('') + readdirSync(join(root, 'themes')).sort().map(f => readFileSync(join(root, 'themes', f), 'utf8')).join('')).digest('hex').slice(0, 10);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- rendering ----------
function ago(iso, ref) {
  if (!iso) return '';
  const h = Math.max(0, (Date.parse(ref) - Date.parse(iso)) / 36e5);
  if (!Number.isFinite(h)) return '';
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} 分钟前` : h < 48 ? `${Math.round(h)} 小时前` : `${Math.round(h / 24)} 天前`;
}
const fmt = n => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n);
function metricsHtml(m) {
  const parts = [];
  if (m.points) parts.push(`▲ <b>${fmt(m.points)}</b>`);
  if (m.stars !== undefined) parts.push(`★ <b>${fmt(m.stars)}</b>`);
  if (m.likes !== undefined) parts.push(`♥ <b>${fmt(m.likes)}</b>`);
  if (m.engagement !== undefined) parts.push(`♥ <b>${fmt(m.engagement)}</b>`);
  if (m.downloads !== undefined) parts.push(`↓ <b>${fmt(m.downloads)}</b>`);
  if (m.comments !== undefined) parts.push(`💬 <b>${fmt(m.comments)}</b>`);
  if (m.replies !== undefined) parts.push(`💬 <b>${fmt(m.replies)}</b>`);
  if (m.forks !== undefined) parts.push(`⑂ <b>${fmt(m.forks)}</b>`);
  return parts.map(p => `<span class="m">${p}</span>`).join('');
}
// Full-resolution images only: the generator keeps sources ≥600px wide with known size, so the box
// reserves the real aspect ratio (no layout shift) and srcset lets the browser fetch a sharp variant.
// Incremental runs (15:00, 20:00, …): label from card.run, else from fetched_at (Shanghai hour ≥17 → 20:00).
export function runOf(c) { if (c.batch !== 'pm') return ''; if (c.run) return c.run; const h = c.fetched_at ? +new Date(c.fetched_at).toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }) : 15; return h >= 17 ? '20:00' : '15:00'; }
let LATEST_RUN = '';
// v3.6 page layout: day pages live in <yyyy>/<mm>/<date>.html (served as /yyyy/mm/date); old /date(.html) URLs 301 via functions/_middleware.js (run by src/worker.js).
export const dayPath = date => `${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.html`;
let ROOT = '';  // relative prefix back to the site root for the page being rendered ('' at root, '../../' for day pages)
const IC_LIKE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6z"/></svg>';
const IC_FAV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.4h7.6v11.2L8 10.9l-3.8 2.7z"/></svg>';
export const ACTS_HTML = `<span class="acts"><button class="like" type="button" aria-pressed="false" aria-label="点赞：多推这类" title="点赞：多推这类">${IC_LIKE}</button><button class="fav" type="button" aria-pressed="false" aria-label="收藏" title="收藏">${IC_FAV}</button><button class="adds" type="button" aria-label="更多：少推这类 / 加信息源 / 深挖 / 自由指令 / 不感兴趣" title="更多" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg></button><button class="del" type="button" hidden aria-label="不感兴趣" title="不感兴趣：12 小时后进垃圾箱，连点加速">✕</button></span>`;
export function imageHtml(img, lead = false) {
  if (!img?.src) return '';
  if (img.type === 'video') { const tall = img.height / img.width > 1.25; return `<figure class="pic vid${tall ? ' tall' : ''}" style="aspect-ratio:${tall ? '4 / 5' : `${img.width} / ${img.height}`}"><video src="${esc(img.src)}"${img.poster ? ` poster="${esc(img.poster)}"` : ''} controls muted playsinline preload="none" width="${esc(img.width)}" height="${esc(img.height)}"></video></figure>`; }
  // logo-like / flat brand marks never get big-image treatment: small square thumb only
  if (img.logo) return `<figure class="pic logo"><img src="${esc(img.src)}" width="${esc(img.width)}" height="${esc(img.height)}" alt="${esc(img.alt || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>`;
  const ratio = `${img.width} / ${img.height}`;
  const sizes = lead ? '(max-width: 760px) calc(100vw - 32px), 640px' : '(max-width: 760px) calc(100vw - 32px), 420px';
  // tall images are cropped to 4:5 at most; wide ones keep their ratio
  const tall = img.height / img.width > 1.25;
  return `<figure class="pic${tall ? ' tall' : ''}" style="aspect-ratio:${tall ? '4 / 5' : ratio}"><img src="${esc(img.src)}"${img.srcset ? ` srcset="${esc(img.srcset)}" sizes="${sizes}"` : ''} width="${esc(img.width)}" height="${esc(img.height)}" alt="${esc(img.alt || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>`;
}
// Media rank for slotting: video > gallery > non-logo image > none. Video/gallery never land in mini (DESIGN-RULES).
export function mediaRank(c) {
  if (c.image?.type === 'video') return 3;
  if (!c.image && c.gallery?.length) return 2;
  if (c.image && !c.image.logo) return 1;
  return 0;
}
export function isBigMedia(c) { return mediaRank(c) >= 2; }
// Classic grid: pick the best media among the module as the big card (video > gallery > image).
export function leadFirst(cards) {
  let best = -1, bestR = 0;
  cards.forEach((c, i) => { const r = mediaRank(c); if (r > bestR) { bestR = r; best = i; } });
  if (best < 0) return cards.map(c => [c, false]);
  return [[cards[best], true], ...cards.filter((_, i) => i !== best).map(c => [c, false])];
}
// Community cards: source-specific header (HN / X / Reddit); everything else (buttons, text, selection) is shared.
function srcHtml(card) {
  const comm = card.module === 'community';
  if (comm && card.source === 'x' && card.author) { const a = card.author;
    return `<span class="src who">${a.avatar ? `<img class="av" src="${esc(a.avatar)}" alt="" width="40" height="40" loading="lazy" referrerpolicy="no-referrer">` : '<span class="av ph" aria-hidden="true">𝕏</span>'}<span class="nm"><b>${esc(a.name || a.handle)}${a.verified ? '<svg class="vf" viewBox="0 0 16 16" aria-label="已认证"><path d="M8 1l1.8 1.3 2.2-.1.7 2.1 1.8 1.3-.7 2.1.7 2.1-1.8 1.3-.7 2.1-2.2-.1L8 15l-1.8-1.3-2.2.1-.7-2.1L1.5 10.4l.7-2.1-.7-2.1 1.8-1.3.7-2.1 2.2.1z"/><path class="ck" d="M5.3 8.2l1.8 1.8 3.6-3.8"/></svg>' : ''}</b><i>@${esc(a.handle)}</i></span></span>`; }
  if (comm && card.source === 'hn') return `<span class="src hn"><span class="yb" aria-hidden="true">Y</span>Hacker News</span>`;
  if (comm && card.source === 'reddit') return `<span class="src rd-sub"><span class="rdot" aria-hidden="true"></span>${esc(card.source_label)}</span>`;
  return `<span class="src">${esc(card.source_label)}</span>`;
}
// owner-only taste chip (DESIGN-RULES §4): the owner's 点赞 / 收藏 lifted this card (score.feedback > 1, set by generate.py)
const KEY_LABEL = k => { const [t, ...r] = k.split(':'), v = r.join(':');
  return { repo: `仓库 ${v}`, x: v, hf: `HF ${v}`, hffam: `HF ${v}`, sub: `r/${v}`, feed: v, site: v, kw: v.replace(/_/g, ' ') }[t] || v; };
export function tasteHtml(card) {
  const f = card.score?.feedback; if (!(f > 1)) return '';
  const why = (card.score.feedback_why || []).map(KEY_LABEL).filter(Boolean);
  const tip = `按你的喜好排前了${why.length ? `：你赞过或收藏过 ${why.join('、')} 的内容` : ''}`;
  return `<span class="taste owner-only" title="${esc(tip)}" aria-label="${esc(tip)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6z"/></svg><b>合你口味</b></span>`;
}
export function cardHtml(card, index, ref, lead = false, variant = '') {
  const host = (() => { try { return new URL(card.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return `<article class="card${lead ? ' lead' : ''}${variant ? ' ' + variant : ''}${card.module === 'community' && ['hn', 'x', 'reddit'].includes(card.source) ? ` s-${card.source}` : ''}" id="${esc(card.id)}" data-id="${esc(card.id)}" data-tags="${esc(card.tags.join(','))}" data-batch="${card.batch === 'pm' ? (!LATEST_RUN || runOf(card) === LATEST_RUN ? 'pm' : 'pm-early') : 'am'}" data-run="${esc(runOf(card))}" data-module="${esc(card.module)}" data-date="${esc(card.date || '')}" data-src="${esc(card.source_label)}" data-source="${esc(card.source)}" data-url="${esc(card.url)}" data-title="${esc(card.title_zh || card.title)}" data-keys="${esc(itemKeys(card).join(' '))}" style="--i:${index}">
  <div class="meta">${card.batch === 'pm' ? `<span class="new${!LATEST_RUN || runOf(card) === LATEST_RUN ? '' : ' early'}" title="${runOf(card)} 增量抓取新增">${runOf(card)} 新增</span>` : ''}${srcHtml(card)}<span>${esc(ago(card.published_at, ref))}</span>${card.stale_link ? `<span class="stale" title="链接内容发布于 ${esc(card.stale_link.published_at.slice(0, 10))}">旧闻重提</span>` : ''}${tasteHtml(card)}<span class="rank">${String(index + 1).padStart(2, '0')}</span></div>
  <button class="rd" type="button" aria-pressed="false" aria-label="看过，收起" title="看过，收起"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.6 2.6 3.4 3.4 3.4-3.4M4.6 13.4 8 10l3.4 3.4"/></svg></button>
  <h3><a href="${esc(card.url)}" target="_blank" rel="noopener">${esc(card.title_zh || card.title)}</a></h3>
  ${card.title_zh ? `<p class="orig"><span>原标题</span> ${esc(card.title)}</p>` : ''}
  ${card.summary_zh ? `<p class="ex sum">${esc(card.summary_zh)}</p>` : card.excerpt ? `<p class="ex">${esc(card.excerpt)}</p>` : ''}
  ${imageHtml(card.image, lead)}
  ${card.image ? '' : galleryHtml(card.gallery)}
  ${promptHtml(card.prompt)}
  ${card.audio?.src ? `<audio class="aud" controls preload="none" src="${esc(card.audio.src)}"></audio>` : ''}
  ${V34 && card.bench && variant !== 'mini' ? benchHtml(card.bench) : ''}
  ${V34 && card.comment_zh ? `<p class="take"><span>点评</span>${esc(card.comment_zh)}</p>` : ''}
  ${V34 && card.related?.length ? `<p class="ext"><span>延伸</span>${card.related.map(r => `<a href="${esc(r.href)}"${r.ext ? ' target="_blank" rel="noopener"' : ''}>${esc(r.label)}</a>`).join('')}</p>` : ''}
  <div class="tags">${card.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div class="foot">${metricsHtml(card.metrics || {})}<span class="links"><a class="orig-link" href="${esc(card.url)}" target="_blank" rel="noopener" title="${esc(host)}">原文 ↗</a>${(card.links || []).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</span>${ACTS_HTML}</div>
</article>`;
}
// ---- v3.4 preview (NEWS_LAYOUT=v34): editorial mix, 延伸 links, 点评, sourced Arena chart ----
const V34 = process.env.NEWS_LAYOUT !== 'classic';  // v3.4 editorial layout is the default; NEWS_LAYOUT=classic = old grid
function related(card, all) {
  const kw = new Set(card.keywords || []), out = [];
  for (const o of all) { if (o.id === card.id) continue; const n = (o.keywords || []).filter(k => kw.has(k)).length;
    if (n) out.push([n, { href: '#' + o.id, label: '↳ ' + (o.title_zh || o.title).slice(0, 60) }]); }
  const links = (card.links || []).map(l => ({ href: l.url, label: l.label + ' ↗', ext: true }));
  return [...out.sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]), ...links.slice(0, 2)];
}
function benchHtml(b) {
  const vs = b.rows.map(r => r.value), hi = Math.max(...vs), lo = Math.min(...vs), base = lo - (hi - lo) * 0.25 - 1e-9;
  let host = ''; try { host = new URL(b.source).hostname.replace(/^www\./, ''); } catch {}
  return `<figure class="chart bench"><figcaption><b>${esc(b.title)} · ${esc(b.metric)}</b><span>来源：<a href="${esc(b.source)}" target="_blank" rel="noopener">${esc(host)} README 评测表</a>（原样摘录）</span></figcaption>
<table><tbody>${b.rows.map(r => `<tr${r.self ? ' class="top"' : ''}><th scope="row" title="${esc(r.label)}">${esc(r.label)}</th><td><span class="cb" style="--w:${hi === base ? 100 : Math.max(4, Math.round(100 * (r.value - base) / (hi - base)))}%"></span></td><td class="num">${esc(r.raw || String(r.value))}</td></tr>`).join('')}</tbody></table></figure>`;
}
function editorialHtml(cards, all, ref) {
  const withRel = cards.map(c => ({ ...c, related: related(c, all) }));
  let best = 0, bestR = -1;
  withRel.forEach((c, i) => { const r = mediaRank(c); if (r > bestR) { bestR = r; best = i; } });
  const lead = withRel[best], rest = withRel.filter((_, i) => i !== best);
  const side = [], more = [];
  for (const c of rest) { if (side.length < 4 && !isBigMedia(c)) side.push(c); else more.push(c); }
  const leadHas = mediaRank(lead) > 0;
  return `<div class="ed"><div class="ed-lead">${cardHtml(lead, 0, ref, leadHas, leadHas ? 'feature' : 'feature noimg')}</div>
<div class="ed-side">${side.map((c, i) => cardHtml(c, i + 1, ref, false, 'mini')).join('')}</div></div>
${more.length ? `<div class="ed-more">${more.map((c, i) => cardHtml(c, i + 1 + side.length, ref, false, isBigMedia(c) || (i % 3 === 0 && mediaRank(c) === 1) ? 'wide' : 'std')).join('')}</div>` : ''}`;
}
function arenaChartHtml(boards) {
  const ok = boards.filter(b => b.fetch_status === 'ok' && b.rows.some(r => r.score > 10)).slice(0, 2);
  if (!ok.length) return '';
  return `<div class="charts">${ok.map(b => { const rows = b.rows.slice(0, 5).filter(r => r.score > 10), hi = Math.max(...rows.map(r => r.score)), lo = Math.min(...rows.map(r => r.score)) - 40;
    return `<figure class="chart"><figcaption><b>${esc(BOARD_LABELS[b.name] || b.name)} · Elo 前 ${rows.length}</b><span>来源：LMArena 榜单快照 ${esc(b.snapshot_date || '')}</span></figcaption>
<table><tbody>${rows.map((r, i) => `<tr${i === 0 ? ' class="top"' : ''}><th scope="row" title="${esc(r.model)}">${esc(r.model)}</th><td><span class="cb" style="--w:${Math.round(100 * (r.score - lo) / (hi - lo))}%"></span></td><td class="num">${Math.round(r.score)}</td></tr>`).join('')}</tbody></table></figure>`; }).join('')}</div>`;
}
function boardsHtml(boards) {
  const ok = boards.filter(b => b.fetch_status === 'ok' && b.rows.length);
  if (!ok.length) return '';
  const board = b => {
    const rows = b.rows.slice(0, 5), sc = rows.map(r => (r.score != null && r.score > 10 ? r.score : null));
    const vals = sc.filter(v => v != null), hi = Math.max(...vals), lo = Math.min(...vals);
    const li = (r, i) => {
      const v = sc[i], w = v == null ? 0 : hi === lo ? 100 : Math.round(35 + 65 * (v - lo) / (hi - lo));
      const d = r.delta === 'new' ? '<em class="dl nw">NEW</em>' : r.delta ? `<em class="dl ${r.delta > 0 ? 'up' : 'dn'}">${r.delta > 0 ? '↑' : '↓'}${Math.abs(r.delta)}</em>` : '';
      return `<li class="ar${i === 0 ? ' top' : ''}"><b class="rk">${esc(r.rank ?? i + 1)}</b><span class="nm" title="${esc(r.model)}">${esc(r.model)}</span>${d}${v == null ? '<span class="sv"></span>' : `<span class="sv">${Math.round(v)}</span>`}${v == null ? '' : `<span class="bar" aria-hidden="true"><i style="width:${w}%"></i></span>`}</li>`;
    };
    return `<section class="board"><h4><span class="cat">${esc(BOARD_LABELS[b.name] || b.name)}</span><span class="dt">Arena · ${esc(b.snapshot_date || '')}</span></h4><ol>${rows.map(li).join('')}</ol></section>`;
  };
  return `<div class="arena" aria-label="Arena 榜单快照"><button class="anav prev" type="button" aria-label="上一组榜单" disabled>‹</button><div class="boards" tabindex="0">${ok.map(board).join('')}</div><button class="anav next" type="button" aria-label="下一组榜单">›</button></div>`;
}
function head(title, filename, description, theme) {
  return `<!doctype html>
<html lang="zh-CN"${edAttrs()}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="theme-color" content="${esc(theme.tokens.bg)}">
  <link rel="icon" href="${ROOT}favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${ROOT}apple-touch-icon.png">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  ${process.env.NEWS_SITE ? `<meta property="og:image" content="${esc(process.env.NEWS_SITE.replace(/\/$/, ""))}/og.png">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="${ROOT}assets/theme.css?v=${ASSET_V}">
  <link rel="stylesheet" href="${ROOT}assets/style.css?v=${ASSET_V}">
  <link rel="stylesheet" href="${ROOT}assets/arch.css?v=${ASSET_V}">
  <link rel="stylesheet" href="${ROOT}assets/cal.css?v=${ASSET_V}">
  <link rel="stylesheet" href="${ROOT}assets/console.css?v=${ASSET_V}">
  <script src="${ROOT}assets/motion.js?v=${ASSET_V}"></script>${V34 ? `
  <link rel="stylesheet" href="${ROOT}assets/v34.css?v=${ASSET_V}">` : ''}
${ixHead()}
</head>`;
}
// ---- weekly edition + shared ix slots (DESIGN-RULES §12, site/assets/ix/README.md) ----
const IXREG = loadIx(), IXFAVS = loadFavs(), IXOK = healthy(IXREG, IXFAVS);
for (const e of checkRegistry(IXREG, IXFAVS)) console.warn('! ix → default:', e);
const IX_BOOT_V = fileHash('assets/ix/boot.js'), IX_SITE_V = fileHash('assets/ix/site-news.css');
let ED = null, EDS = [], ED_META = {};  // ED = edition of the page being rendered
const edSlots = e => Object.fromEntries(Object.entries(e?.slots || {}).filter(([k, v]) => v !== 'default' && IXOK[k]?.[v]));
function edAttrs() { if (!ED) return ''; return ` data-ed="${esc(ED.id)}"${Object.entries(edSlots(ED)).map(([k, v]) => ` data-ix-${k}="${esc(v)}"`).join('')}`; }
function ixHead() {
  const links = ED ? Object.entries(edSlots(ED)).filter(([k, v]) => IXOK[k][v].css).map(([k, v]) => `  <link rel="stylesheet" id="ix-${k}" href="${ROOT}${IXOK[k][v].css}?v=${IXOK[k][v].h}">`) : [];
  if (ED?.cssFile) links.push(`  <link rel="stylesheet" id="ix-ed" href="${ROOT}assets/editions/${esc(ED.id)}.css?v=${ED_META[ED.id].h}">`);
  return `  <link rel="stylesheet" href="${ROOT}assets/ix/site-news.css?v=${IX_SITE_V}">
${links.join('\n')}${links.length ? '\n' : ''}  <script type="application/json" id="ix-data">${jsonAttr({ up: ROOT, ok: IXOK, ed: ED?.id || null, eds: ED_META })}</script>
  <script src="${ROOT}assets/ix/boot.js?v=${IX_BOOT_V}"></script>`;
}
function ixCredits() { if (!ED) return ''; const c = Object.entries(edSlots(ED)).map(([k, v]) => { const x = IXREG.slots[k].variants[v], ib = x.inspiredBy;
    return `${esc(IXREG.slots[k].label.replace(/（.*$/, ''))} · ${ib.url ? `<a href="${esc(ib.url)}" target="_blank" rel="noopener">${esc(ib.title)}</a>` : esc(ib.title)}`; });
  return c.length ? `<span>本周版式（${esc(ED.id)}）：${c.join(' · ')}</span>` : ''; }
let THEMES = [];
function orbStyle(t) { const k = t.tokens || {}; return `--ob:${k.bg || '#888'};--oa:${k.accent || '#f60'}`; }
function themeDock() {
  if (!THEMES.length) return '';
  return `<div class="tsw" data-weekly="${esc(THEMES[0].id)}"><button class="orb cur" type="button" aria-haspopup="true" aria-expanded="false" aria-label="切换主题（T 键循环，Shift+T 回到本周）"><i></i></button>
  <div class="dock" role="menu" aria-label="主题" hidden>${THEMES.map((t, i) => `<button class="orb" type="button" role="menuitemradio" aria-checked="false" data-t="${esc(t.id)}" data-a="${esc(t.arch || 'classic')}" data-name="${esc(t.name)}${i === 0 ? '（本周）' : ''}" aria-label="${esc(t.name)}${i === 0 ? '（本周）' : ''}" style="${orbStyle(t)};--i:${i}"><i></i></button>`).join('')}<span class="tact owner-only"><button class="tfav" type="button" aria-pressed="false" aria-label="收藏当前主题" title="收藏当前主题"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6z"/></svg></button><button class="tdef" type="button" aria-pressed="false" aria-label="设为我的默认主题" title="设为我的默认主题（再点跟随每周）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg></button></span><a class="tall" href="${ROOT}settings.html#theme" aria-label="全部主题" title="全部主题与动效"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg></a></div></div>`;
}
function topBar(current, latest) {
  return `<header class="top" data-ixh="topbar"><i class="prog" aria-hidden="true"></i><div class="wrap">
  <a class="logo" href="${ROOT}index.html" aria-label="News Daily 首页"><span class="glyph" title="news"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="22" cy="42" r="6" fill="var(--accent)"/><path d="M22 24a18 18 0 0 1 18 18" fill="none" stroke="var(--accent)" stroke-width="6.5" stroke-linecap="round"/><path d="M22 10a32 32 0 0 1 32 32" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round"/></svg></span><span class="word">News<b>Daily</b></span></a>
  ${themeDock()}
  <nav class="nav" data-ixh="nav">
    <a href="${ROOT}index.html"${current === 'latest' ? ' aria-current="page"' : ''}>最新</a>
    <a href="${ROOT}archive.html"${current === 'archive' ? ' aria-current="page"' : ''}>往期</a>
    <a class="owner-only" href="${ROOT}favorites.html"${current === 'favorites' ? ' aria-current="page"' : ''}>收藏<span class="favcount">0</span></a>
    ${userMenu(current)}
  </nav>
</div></header>
${tabBar(current)}`;
}
// v3.6.1 phones (≤640px, DESIGN-RULES §11): the top bar keeps only logo + wordmark + theme orb; navigation lives in this bottom
// floating pill (icon + small label). Guests: 最新 · 往期. Owner adds 收藏 · 垃圾箱 (badges) · 更多 (sheet: 信息源 · MCP | 同步状态 · 退出).
// Hidden on desktop. Hides on scroll down, back on scroll up / near the top or the end (app.js).
const TI = {
  home: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  book: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>',
  src: '<circle cx="6.5" cy="17.5" r="2"/><path d="M4.5 11a8.5 8.5 0 0 1 8.5 8.5M4.5 4.5a15 15 0 0 1 15 15"/>',
  mcp: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5.5l-3 13"/>',
  exit: '<path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14M10.5 12H20M16.5 8.5 20 12l-3.5 3.5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  pref: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.5a7.2 7.2 0 0 1 14.4 0"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
};
const ti = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${TI[k]}</svg>`;
// 顶栏只放 最新 / 往期 / 收藏；其余收进右侧菜单（DESIGN-RULES §11，参考 zip 顶栏头像菜单）。访客只看到 偏好与主题。
const CONSOLE = ['sources', 'models', 'settings', 'learn', 'trash', 'mcp'];
function userMenu(current) {
  const on = k => current === k ? ' aria-current="page"' : '';
  return `<div class="umenu" data-ixh="umenu"><button class="avatar${CONSOLE.includes(current) ? ' on' : ''}" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="菜单" title="菜单">${ti('user')}<i class="sync owner-only"></i><b class="bdg trashcount owner-only" data-n="0"></b></button>
    <div class="umenu-pop" role="menu" hidden>
      <div class="who owner-only"><b>主人</b><small class="synctxt">未同步</small></div>
      <div class="grp">设置</div>
      <a role="menuitem" class="owner-only" href="${ROOT}sources.html"${on('sources')}>订阅源</a>
      <a role="menuitem" class="owner-only" href="${ROOT}models.html"${on('models')}>模型</a>
      <a role="menuitem" href="${ROOT}settings.html"${on('settings')}>偏好与主题</a>
      <a role="menuitem" class="owner-only" href="${ROOT}settings.html#learn">学到的偏好</a>
      <div class="grp owner-only">工具</div>
      <a role="menuitem" class="owner-only" href="${ROOT}trash.html"${on('trash')}>垃圾箱<b class="trashcount"></b></a>
      <a role="menuitem" class="owner-only" href="${ROOT}mcp-admin.html"${on('mcp')}>MCP</a>
      <hr class="owner-only"><button role="menuitem" class="exit owner-only" type="button">退出</button>
    </div></div>`;
}
function tabBar(current) {
  const on = (...k) => k.includes(current) ? ' aria-current="page"' : '';
  const inMore = CONSOLE.includes(current);
  return `<nav class="tabbar" data-ixh="tabbar" aria-label="主导航">
  <a class="tab" data-ixh="tab" href="${ROOT}index.html"${on('latest')}>${ti('home')}<span>最新</span></a>
  <a class="tab" data-ixh="tab" href="${ROOT}archive.html"${on('archive', 'day')}>${ti('cal')}<span>往期</span></a>
  <a class="tab owner-only" data-ixh="tab" href="${ROOT}favorites.html"${on('favorites')}>${ti('book')}<span>收藏</span><b class="bdg favcount" data-n="0">0</b></a>
  <button data-ixh="tab" class="tab more owner-only${inMore ? ' on' : ''}" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="更多">${ti('more')}<span>更多</span><i class="sync owner-only" title="同步状态"></i><b class="bdg trashcount" data-n="0"></b></button>
</nav>
<div class="mscrim" hidden></div>
<div class="msheet owner-only" role="dialog" aria-label="更多" hidden><i class="grab" aria-hidden="true"></i>
  <a class="mrow" href="${ROOT}trash.html"${on('trash')}>${ti('trash')}<span>垃圾箱</span><b class="trashcount"></b>${ti('chev')}</a>
  <a class="mrow" href="${ROOT}sources.html"${on('sources')}>${ti('src')}<span>订阅源</span>${ti('chev')}</a>
  <a class="mrow" href="${ROOT}models.html"${on('models')}>${ti('chip')}<span>模型</span>${ti('chev')}</a>
  <a class="mrow" href="${ROOT}settings.html"${on('settings', 'learn')}>${ti('pref')}<span>偏好与主题</span>${ti('chev')}</a>
  <a class="mrow" href="${ROOT}mcp-admin.html"${on('mcp')}>${ti('mcp')}<span>MCP</span>${ti('chev')}</a>
  <hr>
  <div class="mrow msync" role="status"><i class="sync owner-only"></i><span class="synctxt">未同步</span></div>
  <button class="mrow exit" type="button">${ti('exit')}<span>退出</span></button>
</div>`;
}
// Daily design components (cached in data/design/<date>.json): each demo is its own file under /demos/,
// framed with sandbox="allow-scripts" (opaque origin: no cookies/localStorage of this site) and a strict CSP.
function promptsHtml(view, ref) {
  const cards = view.items.filter(c => c.prompt_pick);
  if (!cards.length) return '';
  return `<section class="module prompts" id="m-prompts">
  <div class="mhead"><span class="idx">✎</span><h2>今日提示词</h2><p>大家在分享的出图提示词，点一下就能复制</p><span class="count">${String(cards.length).padStart(2, '0')}</span></div>
  <div class="pgrid">${cards.map((c, i) => cardHtml({ ...c, date: view.date }, i, ref, false, 'pcard')).join('\n')}</div>
</section>`;
}
function galleryHtml(g) {
  if (!g?.length) return '';
  return `<div class="gal n${g.length}">${g.map(x => `<a href="${esc(x.src.replace(/name=\w+/, 'name=orig'))}" target="_blank" rel="noopener"><img src="${esc(x.src)}" width="${esc(x.width)}" height="${esc(x.height)}" alt="" loading="lazy" decoding="async"></a>`).join('')}</div>`;
}
function promptHtml(p) {
  if (!p?.text) return '';
  return `<div class="prompt"><div class="ph"><span>提示词${p.from === 'thread' ? ' · 来自楼主回复' : p.from === 'alt' ? ' · 来自图片说明' : ''}</span><button type="button" class="cp" aria-label="复制提示词">复制</button></div><pre>${esc(p.text)}</pre></div>`;
}
function designHtml(view) {
  const cs = view.design?.components || [];
  if (!cs.length) return '';
  return `<section class="wrap design" aria-label="今日设计小组件">
  <div class="mhead"><span class="idx">✦</span><h2>今日小组件</h2><p>今天值得一玩的交互小设计</p></div>
  <div class="dgrid">${cs.map(c => `<figure class="demo"><iframe src="${ROOT}demos/${esc(view.date)}-${esc(c.id.replace(/[^\w-]/g, ''))}.html" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer" title="${esc(c.title)}"></iframe><figcaption><span>${esc(c.title)}</span>${c.pageUrl ? `<a href="${esc(c.pageUrl)}" target="_blank" rel="noopener">来源 ↗</a>` : ''}</figcaption></figure>`).join('')}</div>
</section>`;
}
function footer(themes, theme, data) {
  return `<footer><div class="wrap">
  <span>News Daily · 每天 09:00 更新，15:00、20:00 补充 · <a href="${ROOT}settings.html#theme">全部主题</a></span>
  <span>本周主题灵感：${theme.pageUrl ? `<a href="${esc(theme.pageUrl)}" target="_blank" rel="noopener">${esc(theme.inspiredBy)}</a>` : esc(theme.inspiredBy)}</span>${ixCredits() ? '\n  ' + ixCredits() : ''}
  ${data?.design?.components?.length ? `<span>今日组件：${data.design.components.map(c => `${c.pageUrl ? `<a href="${esc(c.pageUrl)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}`).join(' · ')}</span>` : ''}
</div></footer>`;
}
export function dayPage(view, { themes, theme, prev, next, filename, dayIndex = {} }) {
  const ref = view.window?.end || `${view.date}T23:59:59Z`;
  const counts = Object.fromEntries(TAGS.map(t => [t, view.items.filter(c => c.tags.includes(t)).length]));
  // header meter + rail jump: the three modules (prompt picks live in their own section, so they're not counted under community)
  // plus 今日提示词 (#m-prompts) when the day has prompt picks
  const nPrompts = view.items.filter(c => c.prompt_pick).length;
  const navMods = [...view.modules.map(m => ({ ...m, count: view.items.filter(c => c.module === m.id && !c.prompt_pick).length })),
    ...(nPrompts ? [{ id: 'prompts', index: String(view.modules.length + 1).padStart(2, '0'), title: '今日提示词', count: nPrompts }] : [])];
  const max = Math.max(1, ...navMods.map(m => m.count));
  const lead = view.items.find(c => c.module === 'model') || view.items[0];
  const [y, mo, d] = view.date.split('-');
  const sources = new Set(view.items.map(c => c.source_label.split(' · ')[0]));
  const allPm = view.items.filter(c => c.batch === 'pm');
  LATEST_RUN = allPm.map(runOf).sort().at(-1) || '';
  const pm = allPm.filter(c => runOf(c) === LATEST_RUN);
  const am = view.items.length - allPm.length;
  const earlier = [...new Set(allPm.map(runOf))].filter(r => r !== LATEST_RUN).sort().map(r => ` + ${r} 新增 ${allPm.filter(c => runOf(c) === r).length}`).join('');
  const pmAt = pm.length ? new Date(pm.map(c => c.fetched_at).sort().at(-1)).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const fan = view.items.filter(c => c.image && !c.image.logo && c.image.type !== 'video').slice(0, 3);
  const modules = view.modules.map(m => {
    const cards = view.items.filter(c => c.module === m.id && !c.prompt_pick);
    return `<section class="module" id="m-${esc(m.id)}">
  <div class="mhead"><span class="idx">${esc(m.index)}</span><h2>${esc(m.title)}</h2><p>${esc(m.desc)}</p><span class="count">${String(cards.length).padStart(2, '0')}</span></div>
  ${V34 ? (cards.length ? editorialHtml(cards.map(c => ({ ...c, date: view.date })), view.items, ref) : '<div class="empty">本时段没有符合规则的条目</div>') + (m.id === 'model' ? arenaChartHtml(view.arena?.boards || []) : '')
    : `${cards.length ? `<div class="grid">${leadFirst(cards).map(([c, lead], i) => cardHtml({ ...c, date: view.date }, i, ref, lead)).join('\n')}</div>` : '<div class="empty">本时段没有符合规则的条目</div>'}
  ${m.id === 'model' ? boardsHtml(view.arena?.boards || []) : ''}`}
</section>`;
  }).join('\n');
  const title = `每日 AI 新闻 · ${view.date}`;
  return `${head(title, filename, view.headline, theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}">
${topBar(filename === 'index.html' ? 'latest' : 'day')}
<main class="wrap">
  <section class="hero${fan.length >= 2 ? '' : ' solo'}">
    <div class="hero-main">
      <div class="kicker"><span class="dot"></span><span>${pm.length ? `上午 ${esc(am)}${esc(earlier)} + ${esc(LATEST_RUN)} 新增 ${esc(pm.length)}` : `每日 AI 新闻 · ${esc(view.items.length)} 条`} · ${esc(sources.size)} 个来源</span></div>
      <h1>${esc(y)}<span class="accent">.</span>${esc(mo)}<span class="accent">.</span>${esc(d)}</h1>
      <p class="lead">${lead ? `<a href="#${esc(lead.id)}">${esc(lead.title_zh || lead.title)}</a>` : esc(view.headline)}</p>
      <div class="btns"><a class="pill" href="#m-model">从头开始读 ↓</a>${pm.length ? `<a class="ghost onlynew" href="#new">只看 ${esc(LATEST_RUN)} 新增 ${esc(pm.length)} →</a>` : ''}</div>
      <div class="proof${pm.length ? '' : ' two'}"><div><b data-ixh="num">${esc(view.items.length)}</b><span>今日条数</span></div>${pm.length ? `<div class="pmstat"><b data-ixh="num">${esc(pm.length)}</b><span>${esc(LATEST_RUN)} 新增</span></div>` : ''}<div><b class="readn">0</b><span>已收起</span></div></div>
      <div class="ical" data-cur="${esc(view.date)}" data-days="${esc(JSON.stringify(dayIndex))}"><div class="calbox"><div class="roll" role="img"></div><div class="cal"></div></div></div>
    </div>
    ${fan.length >= 2 ? `<div class="hero-art" data-slot="hero"><div class="fan" aria-hidden="true">${fan.map((c, i) => `<a class="fc" href="#${esc(c.id)}" tabindex="-1" style="--k:${i - (fan.length - 1) / 2}"><img src="${esc(c.image.src)}" alt="" width="${esc(c.image.width)}" height="${esc(c.image.height)}" decoding="async" referrerpolicy="no-referrer"><span>${esc(c.title)}</span></a>`).join('')}</div></div>
    <script type="application/json" id="hero-data">${jsonAttr({ v: 1, date: view.date, week: isoWeek(view.date), widgets: HERO_V, rotation: HERO_ROTATION, themes: Object.fromEntries((themes || []).filter(t => t.hero).map(t => [t.id, t.hero])), items: fan.map(c => ({ id: c.id, title: c.title_zh || c.title, img: c.image.src, w: c.image.width, h: c.image.height, url: '#' + c.id, ext: c.url, src: c.source_label, module: c.module, published_at: c.published_at || null })) })}</script>` : ''}
  </section>
  <nav class="meter" aria-label="模块" style="--n:${navMods.length}">
    ${navMods.map(m => `<a class="row" href="#m-${esc(m.id)}" data-m="${esc(m.id)}"><small>${esc(m.index)}</small><span>${esc(m.title)}</span><b>${esc(m.count)}</b><span class="bar"><i style="width:${Math.round(100 * m.count / max)}%"></i></span></a>`).join('')}
  </nav>
  ${prev || next ? `<p class="pager">${prev ? `<a href="${ROOT}${esc(dayPath(prev))}">← ${esc(prev)}</a>` : '<span></span>'}${next ? `<a href="${ROOT}${esc(dayPath(next))}">${esc(next)} →</a>` : ''}</p>` : ''}
  </section>
</main>
<div class="rail"><div class="wrap" data-ixh="chips">
  <button class="chip" data-ixh="chip" data-tag="*" aria-pressed="true">全部<span class="n">${view.items.length}</span></button>
  ${pm.length ? `<button class="chip newchip" data-ixh="chip" data-batch="pm" aria-pressed="false">仅看新增<span class="n">${pm.length}</span></button><span class="div"></span>` : ''}
  ${TAGS.map(t => `<button class="chip" data-ixh="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}<span class="n">${counts[t]}</span></button>`).join('')}
  <span class="jump">${navMods.map(m => `<a href="#m-${esc(m.id)}">${esc(m.index)} ${esc(m.title)}</a>`).join('')}</span>
</div></div>
<main class="wrap">
${modules}
${promptsHtml(view, ref)}
</main>
${designHtml(view)}
${footer(themes, theme, view)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/calendar.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/day-cal.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/hero/slot.js?v=${HERO_V.slot}"></script>
</body>
</html>
`;
}
// 往期 (DESIGN-RULES §5): the big month calendar is the page's only calendar (public). Cells = day number + item count (heat by count); picking a day
// fills the day panel (owner: that day's 收藏 first; everyone: the top headlines → originals; 打开当日日报). Data = #arch-data (JSON, CSP-safe).
// The date list is the no-JS fallback and the 列表 view; search results replace both while a query is typed.
const ARCH_MODS = [['model', '模型新闻'], ['opensource', '开源项目发现'], ['community', '社区新闻'], ['prompts', '今日提示词']];
function archivePage(rows, { themes, theme, tops = {} }) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  const data = { cur: rows[0]?.date || null, days: Object.fromEntries(rows.map(r => [r.date, { n: r.count, top: tops[r.date] || [] }])) };
  return `${head('每日 AI 新闻 · 往期', 'archive.html', '往期日报索引', theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}">
${topBar('archive')}
<main class="wrap">
  <section class="hero ahero"><div class="hero-main"><div class="kicker"><span class="dot"></span><span>往期日报</span></div><h1>往期<span class="accent">.</span></h1><p class="lead">点日历上的一天看当天头条，再点一次打开那一期。</p></div>
    <dl class="astat"><div><dt>期</dt><dd>${rows.length}</dd></div><div><dt>条</dt><dd>${total}</dd></div></dl></section>
  <div class="filters asearch">${searchBox('aq', '搜索全部往期：标题、摘要、来源、标签', '搜索往期')}<span class="qn" aria-live="polite"></span><span class="aview" role="group" aria-label="视图" hidden><button type="button" data-v="m" aria-pressed="true">月历</button><button type="button" data-v="l" aria-pressed="false">列表</button></span></div>
  <div class="amods" role="group" aria-label="按模块筛选" hidden><button type="button" class="chip" data-m="" aria-pressed="true">全部</button>${ARCH_MODS.map(([k, n]) => `<button type="button" class="chip" data-m="${k}" aria-pressed="false">${n}</button>`).join('')}</div>
  <section class="amonth" hidden aria-label="月历"><div class="am-bar"><h2 class="am-title"><b class="am-m"></b><span class="am-y"></span></h2><span class="am-navs" hidden><button type="button" class="am-nav" data-step="-1" aria-label="上个月">‹</button><button type="button" class="am-nav" data-step="1" aria-label="下个月">›</button></span></div>
    <div class="am-body"><div class="am-grid" role="grid" aria-label="日报月历"></div><aside class="apanel" aria-live="polite"></aside></div></section>
  <div class="sres" id="sres" hidden></div>
  <div class="days">${rows.map(r => `<a class="day" data-d="${esc(r.date)}" href="${esc(dayPath(r.date))}"><b>${esc(r.date)}</b><span>${esc(r.headline)}</span><small>${esc(r.count)} 条</small></a>`).join('')}</div>
  <script type="application/json" id="arch-data">${jsonAttr(data)}</script>
</main>
${footer(themes, theme)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/search.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/archive.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}
function mcpAdminPage({ themes, theme }) {
  return `${head('每日 AI 新闻 · MCP', 'mcp-admin.html', 'MCP 令牌管理', theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}">
${topBar('mcp')}
<main class="wrap">
  <section class="hero solo"><div class="hero-main"><div class="kicker"><span class="dot"></span><span>只读 MCP · 仅主人</span></div><h1>MCP<span class="accent">.</span></h1></div></section>
  <div id="mcp" class="mcp"></div>
</main>
${footer(themes, theme)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/mcp-admin.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}
// ---- 设置区（参考 zip 的 console：左侧导航 + 右侧内容；顶栏和阅读区共用）----
// 订阅源 · 模型 · 偏好与主题 · 学到的偏好（个人），垃圾箱 · MCP（工具）。zip 的「管理」组（概览 / 用户与分组 / 源健康 / 日志）不做。
function consoleShell(cur, main) {
  const a = (k, href, t, own = true) => `<a${own ? ' class="owner-only"' : ''} href="${ROOT}${href}" data-k="${k}"${cur === k ? ' aria-current="page"' : ''}>${t}</a>`;
  return `<div class="console wrap"><aside class="cside" aria-label="设置"><div class="grp">个人</div>${a('sources', 'sources.html', '订阅源')}${a('models', 'models.html', '模型')}${a('settings', 'settings.html', '偏好与主题', false)}${a('learn', 'settings.html#learn', '学到的偏好')}
  <div class="grp owner-only">工具</div>${a('trash', 'trash.html', '垃圾箱')}${a('mcp', 'mcp-admin.html', 'MCP')}<a class="back" href="${ROOT}index.html">← 返回阅读</a></aside>
<main class="cmain">${main}</main></div>`;
}
const phead = (kick, h1, p = '', side = '') => `<div class="phead"><div><div class="kicker"><span class="dot"></span><span>${kick}</span></div><h1 class="display">${h1}</h1>${p ? `<p>${p}</p>` : ''}</div>${side}</div>`;
function consolePage({ themes, theme, file, title, cur, body, scripts = [] }) {
  return `${head('每日 AI 新闻 · ' + title, file, title, theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}" data-area="console">
${topBar(cur)}
${consoleShell(cur, body)}
${footer(themes, theme)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
${scripts.map(f => `<script src="${ROOT}assets/${f}?v=${ASSET_V}"></script>`).join('\n')}
</body>
</html>
`;
}
function sourcesPage({ themes, theme }) {
  return consolePage({ themes, theme, file: 'sources.html', title: '订阅源', cur: 'sources', scripts: ['switch.js', 'sources.js'], body: `
  ${phead('Sources', '订阅<em>源</em>', '按类别管理：X、Reddit、Hacker News、RSS、RSSHub、GitHub、Hugging Face、OSSInsight。每个源可以单独开关、设<b>权重</b>；X 账号按分组整体开关。改完点「保存」，下一期开始生效。', '<button class="btn primary owner-only" id="addSrc" type="button">＋ 添加源</button>')}
  <p class="empty locked-note">这是主人页面。</p>
  <section class="owner-only" id="src" aria-live="polite"></section>` });
}
const RUNL = { am: '09:00', pm: '15:00', 'pm-2000': '20:00' };
const kfmt = n => (n >= 1000 ? (n / 1000).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n));
const TILE = { primary: '#10a37f', fallback: '#4d6bfe' };
// 模型 (read-only, zip models.html layout): failover chain from scripts/llm.py + per-provider use in the last 7 runs + run table.
function modelsPage({ themes, theme, usage, chain }) {
  const R = (usage || []).slice(0, 7), C = chain.chain, used = n => R.filter(r => r.per?.[n] || r.models.some(m => m.startsWith(n + ':')));
  const node = (p, i) => `${i ? '<span class="arr">失败 →</span>' : ''}<span class="node${i ? '' : ' p'}">${i ? `备份 ${i}` : '主用'} · ${esc(p.model)}</span>`;
  const prov = (p, i, opt) => { const u = used(p.name), last = u[0], tok = u.reduce((a, r) => a + (r.per?.[p.name]?.in || 0) + (r.per?.[p.name]?.out || 0), 0), calls = u.reduce((a, r) => a + (r.per?.[p.name]?.calls || 0), 0);
    const st = opt ? '<span class="st off">默认不用</span>' : u.length ? `<span class="st ok">最近 ${R.length} 期用了 ${u.length} 期${last ? ` · 上次 ${esc(last.date.slice(5).replace('-', '.'))} ${esc(RUNL[last.run] || last.run)}` : ''}</span>` : `<span class="st">最近 ${R.length} 期没用到</span>`;
    return `<li class="prov${opt ? ' disabled' : ''}"><span class="rk">${opt ? '—' : i + 1}</span><span class="tile" style="--c:${TILE[p.name] || '#555'}">${esc(p.label.slice(0, 2))}</span><div class="pbody"><h4>${esc(p.label)} ${opt ? '<span class="rank backup">可选</span>' : i ? `<span class="rank backup">备份 ${i}</span>` : '<span class="rank primary">主用</span>'}</h4>
      <div class="sub"><code>${esc(p.model)}</code><span>${esc(p.channel)}</span>${st}</div></div><div class="pnum">${calls ? `<b>${calls}</b><small>次调用 · ${kfmt(tok)} token</small>` : '<small>—</small>'}</div></li>`; };
  const rows = R.map(r => `<li${r.fallbacks.length ? ' class="fb"' : ''}><span class="lm-d"><b>${esc(r.date.slice(5).replace('-', '.'))}</b><small>${esc(RUNL[r.run] || r.run)}</small></span><span class="lm-m">${r.models.map(m => `<code>${esc(m.replace(/^[a-z-]+:/, ''))}</code>`).join(' ') || '—'}</span><span class="lm-t" title="输入 ${r.in} · 输出 ${r.out} token · ${r.calls} 次调用">${kfmt(r.in)}<i>入</i> ${kfmt(r.out)}<i>出</i></span><span class="lm-f">${r.fallbacks.length ? '备用 ' + r.fallbacks.map(esc).join('、') : '主链路'}</span></li>`).join('');
  return consolePage({ themes, theme, file: 'models.html', title: '模型', cur: 'models', body: `
  ${phead('Models', '<em>模型</em>', '写中文标题和摘要用的模型。按顺序排：第一个是<b>主用</b>，其余是<b>备份</b>，主用失败时按顺序自动切换。这里只读，在环境变量（或 GitHub Actions secrets）里配置。')}
  <p class="empty locked-note">这是主人页面。</p>
  <div class="owner-only">
  <section class="cbox"><div class="row sp"><div><b>故障切换链</b><div class="muted">NEWS_LLM_* 是主用，NEWS_LLM_FALLBACK_* 是备份；429 / 5xx 退避两次后换下一个，连续 429 的本期跳过</div></div></div>
    <div class="failover">${C.map(node).join('')}</div></section>
  <h2 class="csec">链路里的模型 <span class="tag plain">${C.length} 个</span></h2>
  <ol class="prov-list">${C.map((p, i) => prov(p, i)).join('')}${chain.optin.map(p => prov(p, 0, true)).join('')}</ol>
  <h2 class="csec">最近 ${R.length || 7} 期</h2>
  <section class="lmodel" id="usage">${rows ? `<ol>${rows}</ol>` : '<p class="empty">还没有记录，下一期起显示。</p>'}</section>
  <div class="callout"><span aria-hidden="true">ⓘ</span><span>Key 只存在运行环境里，网页里不显示、也不能改；这一页只有模型名、调用次数和 token 数。</span></div>
  </div>` });
}
// 偏好与主题 + 学到的偏好 (zip settings.html / #learn). zip 里和 DESIGN-RULES 冲突的设置不做（卡片 👎/🗑 并排、翻书动效、语言、推送时间、踩的力度）。
const TOK = ['bg', 'surface', 'ink', 'muted', 'line', 'accent', 'accent-ink', 'radius', 'border-w', 'shadow', 'font-display'];
const ARCHL = Object.fromEntries([['classic', '经典版式'], ...ARCHS.map(a => [a.id, a.name])]);
function settingsPage({ themes, theme }) {
  const cards = THEMES.map((t, i) => { const k = t.tokens || {}; const st = TOK.filter(n => k[n]).map(n => `--${n}:${k[n]}`).join(';');
    return `<li class="tcard" style="${esc(st)}"><button type="button" data-pick="${esc(t.id)}" aria-pressed="false"><span class="tc-sw" aria-hidden="true"><b>Aa</b><i></i></span><span class="tc-n">${esc(t.name)}</span><span class="tc-m">${esc(ARCHL[t.arch || 'classic'] || t.arch)} · ${t.scheme === 'dark' ? '深色' : '浅色'}</span><span class="tc-tags">${i === 0 ? '<em class="wk">本周</em>' : ''}<em class="cur">当前</em><em class="fv owner-only">♥ 收藏</em><em class="df owner-only">★ 默认</em></span></button></li>`; }).join('');
  const row = (b, sm, ctl, cls = '') => `<div class="cset${cls}"><div><b>${b}</b><small>${sm}</small></div>${ctl}</div>`;
  return consolePage({ themes, theme, file: 'settings.html', title: '偏好与主题', cur: 'settings', scripts: ['switch.js', 'settings.js'], body: `
  ${phead('Settings', '偏好与<em>主题</em>')}
  <h2 class="csec" id="fb">反馈与偏好</h2>
  <section class="cbox">
    ${row('卡片反馈', '不打分。♥ 赞 = 多推相似；「＋」菜单里的少推 = 少推这类；不感兴趣 = 进垃圾箱，并更强地少推', '<span class="tag plain">固定</span>')}
    ${row('收起的条目', '卡片上的 ✓ 收起：放到本栏底部「已收起 N 条」，可以随时放回。收起只是整理，不算负反馈', '<span class="tag plain">固定</span>')}
    ${row('减少动效', '<span class="rm-sys">跟随系统</span>', '<button class="switch" id="rmsw" type="button" role="switch" aria-checked="false" aria-label="减少动效"><i></i></button>')}
    ${row('页面切换动效', '<span class="pt-note">换页、换日期时旧页滑走、新页滑入，日期和日历留在原位；只在本机记住</span>', '<button class="switch" id="ptsw" type="button" role="switch" aria-checked="true" aria-label="页面切换动效"><i></i></button>')}
    ${row('默认主题', '<span class="defnote">跟随每周主题</span>', '<button class="btn sm" id="defclr" type="button" hidden>改回跟随每周</button>', ' owner-only')}
  </section>
  <h2 class="csec owner-only" id="learn">学到的偏好</h2>
  <section class="cbox owner-only learned" aria-label="学到的偏好">
    <div class="row sp"><div class="lead2"><b>从你的点赞、收藏、少推和删除里学到的偏好</b><div class="muted">按<b>账号 / 仓库 / 网站 / 关键词</b>累计。少推的排到后面，不会被直接隐藏；多推的往前排。每一项都可以撤销。</div></div>
      <button class="btn sm ghost danger" id="lall" type="button" hidden>全部撤销</button></div>
    <div class="rule-box"><div><b>删除 = 1.0 · 少推 = 0.5</b>删除是更强的信号；在垃圾箱里恢复就撤掉这次删除</div><div><b>少推每单位 −25%，最低 ×0.4</b>多推每单位 +8%，最多 +30%；点赞、收藏都算多推</div><div><b>30 天减半 · 上限 2</b>旧信号慢慢变弱；只认具体的来源和少数关键词，不按大话题降权</div></div>
    <div class="lfilt"><div class="seg" id="ldir" role="group" aria-label="方向"><button type="button" data-d="penalty" aria-pressed="true">少推 <span></span></button><button type="button" data-d="boost" aria-pressed="false">多推 <span></span></button></div>
      <div class="seg" id="lkind" role="group" aria-label="类型"><button type="button" data-k="" aria-pressed="true">全部</button><button type="button" data-k="src" aria-pressed="false">来源</button><button type="button" data-k="kw" aria-pressed="false">关键词</button></div></div>
    <ol class="lp-list" id="llist"></ol>
    <details class="lcleared" hidden><summary>已撤销 <span></span></summary><ol id="lclr"></ol></details>
    <p class="lmsg" role="status" aria-live="polite"></p>
  </section>
  <h2 class="csec" id="theme">主题</h2>
  <section class="cbox"><p class="muted tnote">${THEMES.length} 套主题，每周换一套新的。点卡片就能换，只在这次浏览里有效；顶栏中间的主题球也能换，按 <span class="mono">T</span> 循环。主人可以在主题球里 ♥ 收藏或 ★ 设为默认。</p>
    <ol class="tgrid">${cards}</ol></section>` });
}
// old URLs (prefs.html, themes.html) → the new pages; meta refresh works without scripts (CSP: no inline JS)
const redirectPage = (to, title) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${to}"><title>${esc(title)}</title><link rel="canonical" href="${to}"></head><body><p>已搬到 <a href="${to}">${esc(title)}</a>。</p></body></html>
`;
function trashPage({ themes, theme }) {
  return `${head('每日 AI 新闻 · 垃圾箱', 'trash.html', '垃圾箱', theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}">
${topBar('trash')}
<main class="wrap">
  <section class="hero solo"><div class="hero-main"><div class="kicker"><span class="dot"></span><span>仅主人</span></div><h1>垃圾箱<span class="accent">.</span></h1><p class="lead">标为不感兴趣的新闻在这里，可以恢复。</p></div></section>
  <p class="empty locked-note">这是主人页面。</p>
  <section class="owner-only">
    <div class="mhead"><span class="idx">⏳</span><h2>倒计时中</h2><p>还没进垃圾箱，可以撤销</p></div>
    <div class="grid" id="pending"></div>
    <div class="mhead"><span class="idx">🗑</span><h2>已删除</h2><p>已从日报隐藏，类似内容会少推 · 永久删除后不能恢复，但仍不会出现在日报里，少推的学习保留</p><button class="trash-act tclear" id="tclear" type="button" hidden>清空 <span class="n"></span> 条</button></div>
    <p class="tmsg" id="tmsg" role="status" aria-live="polite"></p>
    <div class="grid" id="trashed"></div>
    <div class="mhead"><span class="idx">↓</span><h2>最近少推</h2><p>近期会少推的来源和话题，30 天后逐渐恢复 · <a class="owner-only" href="${ROOT}settings.html#learn">全部学到的偏好 →</a></p></div>
    <ul class="penalties" id="penalties"></ul>
  </section>
</main>
${footer(themes, theme)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/trash.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}
// search input shared by 收藏 / 往期 (assets/search.js wires it; × clears, Esc clears)
export const searchBox = (id, ph, label) => `<span class="sbox"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="${id}" placeholder="${esc(ph)}" aria-label="${esc(label)}" autocomplete="off" enterkeyhint="search"><button type="button" class="sx" aria-label="清除搜索" hidden>×</button></span>`;
function favoritesPage({ themes, theme }) {
  return `${head('每日 AI 新闻 · 收藏', 'favorites.html', '收藏', theme)}
<body data-theme="${esc(theme.id)}" data-arch="${esc(theme.arch || 'classic')}" data-root="${ROOT}">
${topBar('favorites')}
<main class="wrap">
  <section class="hero phero"><div class="hero-main"><div class="kicker"><span class="dot"></span><span class="favmode">仅主人</span></div><h1>收藏<span class="accent">.</span></h1><p class="lead favnote"></p></div>
    <div class="pcal owner-only"><div class="calbox"><div class="roll" role="img"></div><div class="cal"></div></div></div></section>
  <div class="filters"><select class="chip" id="fmod" aria-label="模块"><option value="">全部模块</option><option value="model">模型新闻</option><option value="opensource">开源项目发现</option><option value="community">社区新闻</option><option value="prompts">今日提示词</option></select><select class="chip" id="ftag" aria-label="标签"><option value="">全部标签</option><option>AI</option><option>LLM</option><option>图片视频音频</option><option>Agent</option></select><span class="fliked owner-only"><button class="switch" id="withliked" type="button" role="switch" aria-checked="true" aria-labelledby="wlk"><i></i></button><span id="wlk">同时列出 ♥ 点赞的</span></span><span class="aview fsort owner-only" role="group" aria-label="排序与分组"><button type="button" data-s="fav" aria-pressed="true">收藏时间</button><button type="button" data-s="pub" aria-pressed="false">发布日期</button></span>${searchBox('fq', '搜索标题、摘要、来源、标签、提示词', '搜索收藏')}<span class="qn" aria-live="polite"></span></div>
  <div class="grid" id="favs"></div>
  <p class="empty" hidden></p>
</main>
${footer(themes, theme)}
<script src="${ROOT}assets/app.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/calendar.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/search.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/switch.js?v=${ASSET_V}"></script>
<script src="${ROOT}assets/favorites.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

// ---------- IO ----------
async function dateFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(e => e.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(e.name)).map(e => join(directory, e.name)).sort();
}
async function inputFiles() {
  const available = await dateFiles(dataDir).catch(() => []);
  if (!argument) { if (!available.length) fail(`没有找到日报 JSON：${dataDir}`); return available; }
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(argument) ? join(dataDir, `${argument}.json`) : resolve(argument);
  try { await stat(requested); } catch { fail(`找不到输入 JSON：${requested}`); }
  return [...available, requested].filter((f, i, all) => all.indexOf(f) === i);
}
// Items the owner trashed (不感兴趣, countdown finished) are hidden from public pages at build time.
const HIDDEN = (() => { const ids = new Set(); for (const f of [process.env.NEWS_FEEDBACK_FILE || join(root, 'var/state/feedback.json'), join(root, 'data/state/hidden.json')]) { try { for (const t of JSON.parse(readFileSync(f, 'utf8')).trashed || []) ids.add(typeof t === 'string' ? t : t.id); } catch {} } return ids; })();
async function loadRecords(files) {
  const records = [];
  for (const file of files) {
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); } catch (error) { fail(`构建失败：无法读取/解析 ${file}: ${error.message}`); }
    const errors = validateDaily(data);
    if (errors.length) fail(`构建失败：校验未通过 ${file}\n${errors.map(e => `- ${e}`).join('\n')}`);
    const dfile = join(process.env.NEWS_DESIGN_DIR || join(dirname(file), 'design'), `${data.date}.json`);
    let design = null;
    try { design = JSON.parse(await readFile(dfile, 'utf8')); } catch { /* no cached components for this day */ }
    const items = data.items.filter(c => !HIDDEN.has(c.id));
    const modules = data.modules.map(m => ({ ...m, count: items.filter(c => c.module === m.id).length }));
    records.push({ file, data, view: { ...data, items, modules, design } });
  }
  return records.sort((a, b) => b.data.date.localeCompare(a.data.date));
}
async function writeMetadata(output) {
  await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  const sha = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || '';  // Workers Builds (Git) / direct deploy (publish.sh)
  const branch = process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || '';
  await writeFile(join(output, 'build.txt'), `commit ${sha || 'local'}\nbranch ${branch || 'local'}\nbuilt ${new Date().toISOString()}\nby ${process.env.WORKERS_CI_COMMIT_SHA ? 'cloudflare-workers-git' : sha ? 'direct' : 'local'}\n`);
  await writeFile(join(output, '404.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>404 · NewsDaily</title><style>body{font:16px/1.7 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#faf7f0;color:#222}a{color:#c2410c}</style></head><body><main><h1>404</h1><p>页面不存在。<a href="/">回到今日新闻</a></p></main></body></html>\n`);
  await writeFile(join(output, '_headers'), `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n/demos/*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-scripts\n/\n  Cache-Control: no-cache\n/:page\n  Cache-Control: no-cache\n/:y/:m/:page\n  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=300, must-revalidate\n/api/*\n  Cache-Control: no-store\n/build.txt\n  Cache-Control: no-store\n`);
}

async function main() {
  const records = await loadRecords(await inputFiles());
  // weekly themes derived from design-daily (data/themes/<week>.json); static themes stay as safe fallback/preview
  const tdir = process.env.NEWS_THEMES_DIR || (existsSync(join(dataDir, 'themes')) ? join(dataDir, 'themes') : join(root, 'data/themes'));
  const weekly = existsSync(tdir) ? readdirSync(tdir).filter(f => /^\d{4}-W\d{2}\.json$/.test(f)).sort().map(f => JSON.parse(readFileSync(join(tdir, f), 'utf8'))).map(w => constrain(w, archFor(w.week))) : [];
  const statics = loadThemes();
  const arch = archThemes();
  EDS = loadEditions();
  const edT = editionThemes(EDS);
  const themes = [...weekly, ...edT, ...arch, ...statics];
  { const errs = checkEditions(EDS, { slots: IXREG.slots, themeIds: new Set(themes.map(t => t.id)) }); const soft = errs.filter(e => /unknown theme/.test(e)), hard = errs.filter(e => !soft.includes(e));
    // a theme ref missing from this data dir (tests, fresh box) only loses the edition's colours: themeFor falls back to the legacy pick
    if (soft.length) console.warn(`警告：${soft.join('；')}（该周回退到旧主题）`);
    if (hard.length) fail(`构建失败：每周版本校验未通过\n${hard.map(e => '- ' + e).join('\n')}`); }
  const byId = id => themes.find(t => t.id === id);
  const favIds = (() => { try { return JSON.parse(readFileSync(join(root, 'data/state/theme-prefs.json'), 'utf8')).theme_favs || []; } catch { return []; } })();
  const legacyTheme = date => weekly.find(t => t.week === isoWeek(date)) || pickTheme(date, statics);
  // a page's look = its edition (theme + slots); no approved edition yet → legacy weekly theme pick
  const edFor = (date, latest = false) => editionFor(date, EDS, { latest });
  const themeFor = (date, latest = false) => { const e = edFor(date, latest); return (e && byId(themeIdOf(e))) || legacyTheme(date); };
  const latestDate = records[0].data.date, cur = themeFor(latestDate, true);
  THEMES = [cur, ...weekly.slice().reverse().filter(w => w.id !== cur.id && (favIds.includes(w.id) || (!EDS.length && w === weekly.at(-1)))), ...arch, ...statics].filter((t, i, a) => a.findIndex(x => x.id === t.id) === i);  // this week's look first; favourited past weeks stay pickable
  ED_META = Object.fromEntries(EDS.filter(e => e.status === 'approved' || e.week === previewWeek()).map(e => { const t = byId(themeIdOf(e));
    return [e.id, { theme: t?.id || null, arch: t?.arch || 'classic', slots: edSlots(e), ...(e.cssFile ? { css: `assets/editions/${e.id}.css`, h: createHash('sha256').update(readFileSync(e.cssFile)).digest('hex').slice(0, 10) } : {}) }]; }));
  const rows = records.map(r => ({ date: r.data.date, headline: r.view.headline, count: r.view.items.length, }));
  const tempDir = await mkdtemp(join(root, '.build-'));
  try {
    await mkdir(join(tempDir, 'assets'), { recursive: true });
    await writeFile(join(tempDir, 'assets', 'theme.css'), themeCss(themes));
    for (const f of ['style.css', 'arch.css', 'app.js', 'favorites.js', 'mcp-admin.js', 'trash.js', 'sources.js', 'v34.css', 'calendar.js', 'day-cal.js', 'cal.css', 'archive.js', 'search.js', 'motion.js', 'switch.js', 'settings.js', 'console.css']) await copyFile(join(root, 'site/assets', f), join(tempDir, 'assets', f));
    await cp(join(root, 'site/assets/ix'), join(tempDir, 'assets', 'ix'), { recursive: true });
    for (const e of EDS) if (e.cssFile && ED_META[e.id]) { await mkdir(join(tempDir, 'assets', 'editions'), { recursive: true }); await copyFile(e.cssFile, join(tempDir, 'assets', 'editions', `${e.id}.css`)); }
    await mkdir(join(tempDir, 'assets', 'hero'), { recursive: true });
    for (const f of HERO_FILES) await copyFile(join(root, 'site/assets/hero', f), join(tempDir, 'assets', 'hero', f));
    for (const f of ['favicon.svg', 'apple-touch-icon.png', 'og.png']) await copyFile(join(root, 'site/brand', f), join(tempDir, f));
    const latestTheme = cur, latestEd = edFor(latestDate, true);
    const items = [], catalogItems = [], fkeys = {};  // fkeys: every card's feedback keys + title (all edition cards, like sync-state.mjs) for /api/learned
    const dayIndex = Object.fromEntries(records.map(r => [r.data.date, r.view.items.length]));
    for (const [i, r] of records.entries()) {
      const theme = themeFor(r.data.date, i === 0); ED = edFor(r.data.date, i === 0);
      const ctx = { themes, theme, dayIndex, prev: records[i + 1]?.data.date, next: records[i - 1]?.data.date };
      for (const c of r.view.design?.components || []) {
        await mkdir(join(tempDir, 'demos'), { recursive: true });
        await writeFile(join(tempDir, 'demos', `${r.data.date}-${c.id.replace(/[^\w-]/g, '')}.html`), c.demoHtml);
      }
      ROOT = '../../'; await mkdir(join(tempDir, dirname(dayPath(r.data.date))), { recursive: true });
      await writeFile(join(tempDir, dayPath(r.data.date)), dayPage(r.view, { ...ctx, filename: dayPath(r.data.date) }));
      ROOT = '';
      if (i === 0) { ED = latestEd; await writeFile(join(tempDir, 'index.html'), dayPage(r.view, { ...ctx, theme: latestTheme, filename: 'index.html' })); }
      for (const c of r.data.items || []) fkeys[c.id] ||= [itemKeys(c), c.title_zh || c.title || ''];
      for (const c of r.view.items) { items.push({ id: c.id, date: r.data.date, module: c.module, ...(c.prompt_pick ? { prompt_pick: true, ...(c.prompt?.text ? { prompt: { text: c.prompt.text, from: c.prompt.from } } : {}) } : {}), title: c.title_zh || c.title, ...(c.title_zh ? { title_orig: c.title } : {}), excerpt: c.excerpt, url: c.url, source: c.source_label, tags: c.tags }); catalogItems.push({ ...c, date: r.data.date, source: c.source_label }); }
    }
    ED = latestEd;
    // 往期 day panel: each day's top headlines (by score, prompt picks excluded) → [id, title, url, module, source]
    const tops = Object.fromEntries(records.map(r => [r.data.date, r.view.items.filter(c => !c.prompt_pick).slice().sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0)).slice(0, 6).map(c => [c.id, c.title_zh || c.title, c.url, c.module, c.source_label])]));
    await writeFile(join(tempDir, 'archive.html'), archivePage(rows, { themes, theme: latestTheme, tops }));
    await writeFile(join(tempDir, 'favorites.html'), favoritesPage({ themes, theme: latestTheme }));
    await writeFile(join(tempDir, 'trash.html'), trashPage({ themes, theme: latestTheme }));
    await writeFile(join(tempDir, 'sources.html'), sourcesPage({ themes, theme: latestTheme }));
    await writeFile(join(tempDir, 'settings.html'), settingsPage({ themes, theme: latestTheme }));
    await writeFile(join(tempDir, 'models.html'), modelsPage({ themes, theme: latestTheme, usage: loadUsage(root, { write: !process.env.NEWS_DIST_DIR }), chain: loadChain(root) }));
    await writeFile(join(tempDir, 'prefs.html'), redirectPage('settings.html#learn', '学到的偏好'));
    await writeFile(join(tempDir, 'themes.html'), redirectPage('settings.html#theme', '偏好与主题'));
    await copyFile(join(root, 'scripts/keys.mjs'), join(tempDir, 'assets', 'keys.mjs'));
    await writeFile(join(tempDir, 'items.json'), JSON.stringify(items));
    await writeFile(join(tempDir, 'mcp-admin.html'), mcpAdminPage({ themes, theme: latestTheme }));
    // MCP catalog for functions/mcp.js (bundled into src/worker.js by wrangler at deploy time).
    const catalogFile = process.env.NEWS_CATALOG_FILE || join(root, 'lib', 'catalog.js');
    await mkdir(dirname(catalogFile), { recursive: true });
    await writeFile(catalogFile, `export default ${JSON.stringify({ version: records[0].data.date, items: catalogItems.map(({ score, visibility, ...c }) => ({ ...c, score: score.total })), fkeys })};\n`);
    await writeMetadata(tempDir);
    // guard: every asset URL must carry a filled content hash (an unexpanded ${V}/${ASSET_V} once pinned phones to stale JS); day pages are nested
    for (const f of (await readdir(tempDir, { recursive: true })).filter(f => f.endsWith('.html') && !f.startsWith('demos'))) { const h = await readFile(join(tempDir, f), 'utf8');
      const bad = h.match(/(?:src|href)="[^"]*assets\/[^"]*\.(?:js|css)(?!\?v=[0-9a-f]{10}")[^"]*"|\$\{(?:V|ASSET_V|ROOT)\}/); if (bad) throw new Error(`unfilled asset hash in ${f}: ${bad[0]}`);
      const depth = f.split('/').length - 1, rel = h.match(/\s(?:src|href)="(?![a-z]+:|#|\/|data:)([^"]+)"/g) || [];
      for (const m of rel) { const u = m.replace(/^\s[a-z]+="|"$/g, '').replace(/&amp;/g, '&').split(/[?#]/)[0]; if (!u) continue; const t = join(tempDir, dirname(f), u); if (!existsSync(t) && !existsSync(t + '.html')) throw new Error(`broken relative link in ${f} (depth ${depth}): ${u}`); } }

    const output = resolve(process.env.NEWS_DIST_DIR || join(root, 'dist'));
    await rm(output, { recursive: true, force: true });
    await mkdir(dirname(output), { recursive: true });
    await rename(tempDir, output);
    console.log(`构建成功：${records.length} 份日报，${items.length} 条 → ${relative(root, output) || output}（本周主题 ${latestTheme.id}${latestEd ? `，版本 ${latestEd.id}${latestEd.status === 'approved' ? '' : '（预览）'}` : ''}）`);
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
