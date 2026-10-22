// Edition / ix invariants (DESIGN-RULES §12): every shipped slot variant and every edition keeps the permanent rules.
// Usage: node tests/invariants.mjs [distDir]   (default ./dist; serves it locally). Exit 1 on failure. Fast (~1–2 min); the full
// behaviour suite per variant/edition is tests/editions.mjs (runs tests/mobile-layout.mjs with NEWS_TEST_QS).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadIx, healthy, checkRegistry, lintCss, loadFavs, SITE } from '../scripts/ix.mjs';
import { loadEditions, checkEditions, editionThemes } from '../scripts/editions.mjs';
import { contrast } from '../scripts/weekly-theme.mjs';
import { launchChrome } from '../scripts/chrome.mjs';
let fails = 0; const bad = (k, list) => { if (list.length) { fails++; console.log(`✗ ${k}: ${[...new Set(list)].slice(0, 6).join(' | ')}`); } };
// ---- static ----
const reg = loadIx(), favs = loadFavs(), ok = healthy(reg, favs), eds = loadEditions();
bad('registry', checkRegistry(reg, favs));
const shipped = Object.entries(reg.slots).flatMap(([s, x]) => Object.entries(x.variants || {}).filter(([, v]) => !v.sites || v.sites.includes(SITE)).map(([n]) => [s, n]));
bad('unhealthy variants', shipped.filter(([s, n]) => !ok[s]?.[n]).map(([s, n]) => `${s}/${n}`));
bad('lint self-test', [['.ed-more .card{transform:scale(1.02)}', 1], ['.card:hover{transform:none}', 0], ['.card::after{transform:rotate(3deg)}', 0], ['main .module{animation:x 1s}', 1], ['.ed-side>.card.mini{filter:blur(2px)}', 1]]
  .filter(([css, n]) => (lintCss(css, 't').length > 0) !== !!n).map(([css]) => 'lint missed/over-matched ' + css));
const AA = (t, id) => { const k = t.tokens || {}, o = []; if (!k.bg) return o;
  if (contrast(k.ink, k.bg) < 4.5) o.push(`${id} ink/bg`); if (contrast(k.muted, k.bg) < 4.5) o.push(`${id} muted/bg`); if (contrast(k.ink, k.surface) < 4.5) o.push(`${id} ink/surface`);
  if (contrast(k.muted, k.surface) < 4.5) o.push(`${id} muted/surface`); if (contrast(k['accent-ink'], k.accent) < 4.5) o.push(`${id} accent-ink/accent`); return o; };
bad('edition theme contrast', editionThemes(eds).flatMap(t => AA(t, t.id)));
bad('variant pair contrast', shipped.map(([s, n]) => [s + '/' + n, reg.slots[s].variants[n].pair]).filter(([, p]) => p).flatMap(([id, p]) => AA(p, id)));
console.log(`✓ static: ${shipped.length} variants (${Object.values(ok).reduce((a, x) => a + Object.keys(x).length, 0)} healthy), ${eds.length} editions`);
// ---- runtime ----
const dist = process.argv[2] || new URL('../dist/', import.meta.url).pathname;
bad('editions', checkEditions(eds, { slots: reg.slots, themeIds: new Set([...readFileSync(join(dist, 'assets/theme.css'), 'utf8').matchAll(/\[data-theme="([^"]+)"\]/g)].map(m => m[1])) }));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = createServer(async (q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; if (!extname(p)) p += '.html';
  try { const b = await readFile(join(dist, p)); s.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await launchChrome();   // pipe by default; NEWS_CDP_PORT → own CDP port (scripts/chrome.mjs)
const PNG = readFileSync(new URL('../site/brand/og.png', import.meta.url));
async function open(qs, w, opts = {}) { const ctx = await b.newContext({ viewport: { width: w, height: 900 }, ...(w < 641 ? { hasTouch: true, isMobile: true } : {}), ...opts }); const p = await ctx.newPage(), errs = [];
  await p.addInitScript(() => { if (!sessionStorage.getItem('t')) { localStorage.clear(); sessionStorage.setItem('t', 1); } localStorage.setItem('news-owner', 'test'); });
  p.on('pageerror', e => errs.push('js ' + e.message.slice(0, 80)));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.request().resourceType() === 'image' ? r.fulfill({ contentType: 'image/png', body: PNG }) : r.abort());
  await p.goto(base + '?' + qs, { waitUntil: 'load' }); await p.waitForTimeout(500); return [ctx, p, errs]; }
// in-page: permanent rules + computed text contrast on the elements a redesign restyles
const pageChk = ([want]) => { const out = [], vw = document.documentElement.clientWidth, H = document.documentElement, R = e => e.getBoundingClientRect();
  for (const [s, v] of Object.entries(want)) if (H.getAttribute('data-ix-' + s) !== v) out.push(`not-applied ${s}/${v}`);
  if ((window.__ddIxFail || []).length) out.push('fallback ' + window.__ddIxFail.join(','));
  if (H.scrollWidth > vw + 1) out.push(`hscroll ${H.scrollWidth}>${vw}`);
  for (const c of [...document.querySelectorAll('main .module:not(.prompts) .card[data-id]')].filter(c => c.offsetParent).slice(0, 30)) {
    const face = [...c.querySelector('.acts').children].filter(x => x.offsetParent).map(x => x.className.split(' ')[0]).join(','); if (face !== 'like,fav,adds') out.push('face ' + face);
    for (const x of c.querySelectorAll('.acts > .like, .acts > .fav, .acts > .adds')) { const r = R(x); if (Math.abs(r.width - r.height) > 1 || parseFloat(getComputedStyle(x).borderTopLeftRadius) < r.width / 2 - 1) out.push('acts-not-round'); }
    const rd = c.querySelector(':scope > .rd'), r = R(c), q = rd && R(rd); if (!rd || !q.width) out.push('rd-missing'); else if (r.right - q.right > 48 || q.top - r.top > 48) out.push('rd-not-corner');
    if (vw <= 640) { if (c.querySelector('.rank')?.offsetParent) out.push('rank-visible-on-phone'); if (r.width < vw - 40) out.push('narrow ' + Math.round(r.width));
      if (!c.closest('.ed-lead') && !!c.querySelector(':scope > .pic:not(.logo), :scope > .gal') === c.classList.contains('mini')) out.push('phone-big-small'); } }
  if (document.querySelector('main .card .stars, .dd-backdrop, main .card .focus')) out.push('legacy-or-fullscreen');
  const ical = document.querySelector('.ical'); if (ical) { const I = R(ical); for (const e of document.querySelectorAll('.ical .roll .rc')) { const q = R(e); if (q.width && (q.left < I.left - 1 || q.right > I.right + 1 || q.top < I.top - 1)) { out.push('digits-outside-calbox'); break; } } } else out.push('no-calendar');
  const tb = document.querySelector('.tabbar'), nav = document.querySelector('.top .nav'); const vis = e => e && getComputedStyle(e).display !== 'none' && R(e).width > 0;
  if (vw <= 640) { if (!vis(tb)) out.push('no-tabbar'); if (vis(nav)) out.push('top-nav-on-phone'); if (R(document.querySelector('.top .wrap')).height > 64) out.push('top-tall'); }
  else { if (vis(tb)) out.push('tabbar-on-desktop'); if (!vis(nav)) out.push('no-desktop-nav'); }
  // contrast: walk up to an opaque background, composite translucent layers
  const rgba = c => { const m = c.match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; const n = m.map(Number), f = /color\(srgb/.test(c) ? 255 : 1; return [n[0] * f, n[1] * f, n[2] * f, n.length > 3 ? n[3] : 1]; };
  const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= .99) break; }
    let acc = [255, 255, 255]; for (const c of layers.reverse()) acc = acc.map((v, i) => v * (1 - c[3]) + c[i] * c[3]); return acc; };
  const sel = 'main .card h3 a, main .card .ex, main .card .meta, .mhead h2, .mhead p, .rail .chip, .top .nav a, .top .word, .tabbar .tab span, .proof span, .hero .lead a, .seen .shbar';
  for (const el of [...document.querySelectorAll(sel)].filter(e => e.offsetParent && R(e).width).slice(0, 120)) { const cs = getComputedStyle(el);
    if (parseFloat(cs.webkitTextStrokeWidth) > 0 || el.closest('.pic,.gal,.fan')) continue;
    const fg = rgba(cs.color); if (fg[3] < .5) continue;
    const bub = el.matches('.ix-chips-on [data-ixh~="chip"]:is([aria-pressed="true"],[aria-checked="true"])') && el.closest('[data-ixh~="chips"]')?.querySelector('.ixbub'); const bgc = bub ? rgba(getComputedStyle(bub).backgroundColor).slice(0, 3) : bgOf(el), fgc = fg.slice(0, 3).map((v, i) => v * fg[3] + bgc[i] * (1 - fg[3]));
    const a = L(fgc), z = L(bgc), cr = (Math.max(a, z) + .05) / (Math.min(a, z) + .05), big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
    if (cr < (big ? 3 : 4.5)) out.push(`contrast ${el.className || el.tagName} ${cr.toFixed(2)}`); }
  return [...new Set(out)].slice(0, 8); };
const themes = await (async () => { const [ctx, p] = await open('', 1440); const t = await p.evaluate(() => [...document.querySelectorAll('.dock [data-t]')].map(x => x.dataset.t)); await ctx.close(); return t; })();
// 快检 (INV_SMOKE=1, run-edition.sh default): default look only (no ix variants, no chips fixture) × this week's + one editorial theme — the
// static registry/edition checks, contrast/layout on the default page, reduced motion and day-page pinning still run.
const SMOKE = process.env.INV_SMOKE === '1';
const pick = SMOKE ? [...new Set([themes[0], themes.find(t => /editorial|swiss/.test(t))].filter(Boolean))] : [...new Set([themes[0], themes.find(t => /crt|aurora/.test(t)), themes.find(t => /editorial|swiss/.test(t)), ...(process.env.INV_ALL_THEMES ? themes : [])].filter(Boolean))];
const runs = [['', {}], ...(SMOKE ? [] : shipped.filter(([s, n]) => ok[s]?.[n]).map(([s, n]) => [`ix=${s}:${n}`, { [s]: n }]))];
for (const [qs, want] of runs) for (const w of [1440, 390]) for (const t of pick) { const [ctx, p, errs] = await open(`theme=${t}&${qs}`, w);
  const list = await p.evaluate(pageChk, [want]);
  // reduced motion: interactions must not start any non-card animation
  bad(`${qs || 'default'} ${w} ${t}`, [...list, ...errs]); await ctx.close(); }
let rmBase = null; // animations the default page already runs under reduced motion (e.g. logo ping) are not the variant's
for (const [qs, want] of runs) { const [ctx, p, errs] = await open(qs, 390, { reducedMotion: 'reduce' });
  await p.click('.rail .chip[data-tag="AI"]').catch(() => {}); await p.evaluate(() => { const t = document.createElement('div'); t.className = 'ntoast in'; t.dataset.ixh = 'toast'; t.innerHTML = '<span>已记下</span><button>撤销</button>'; document.body.append(t); });
  await p.waitForTimeout(120); const n = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && !a.effect?.target?.closest?.('.card')).map(a => (a.effect?.target?.className || '') + ':' + (a.animationName || 'waapi')));
  if (rmBase === null) rmBase = new Set(n); else bad(`reduced-motion ${qs}`, [...n.filter(x => !rmBase.has(x)).map(x => 'anim ' + x), ...errs]); await ctx.close(); }
// pinning: each day page carries its own week's edition (old issues keep their look)
{ const ctx = await b.newContext(), p = await ctx.newPage(), out = [];
  await p.goto(base + 'archive.html'); const days = await p.$$eval('.days .day', a => a.map(x => x.getAttribute('href')));
  for (const h of days) { await p.goto(base + h); const [ed, date] = await p.evaluate(() => [document.documentElement.dataset.ed, document.querySelector('.ical')?.dataset.cur]);
    const want = (await p.evaluate(() => JSON.parse(document.getElementById('ix-data').textContent))); if (!ed || !want.eds[ed]) out.push(`${date}: data-ed ${ed}`); }
  bad('pinning', out); console.log(`✓ pinning: ${days.length} day pages carry data-ed`); await ctx.close(); }
// chips/direction2 (shared with design-daily): a role=radiogroup with aria-checked (design's favourites sort) and an aria-pressed row (news) both get
// the bubble; clicks and arrow / Home / End keys move it; reduced motion starts no animation. Fixture page, so it covers markup the news site lacks.
if (!SMOKE && ok.chips?.direction2) { const out = [], v = ok.chips.direction2;
  const page = (row, rm) => `<!doctype html><html data-ix-chips="direction2"${rm ? ' class="dd-rm"' : ''}><head><meta charset="utf-8"><style>:root{--ix-accent:#c8161d;--ix-on-accent:#fff}
    button{padding:6px 12px;border:1px solid #999;border-radius:999px;background:#eee;margin:0 4px}</style><link rel="stylesheet" href="/${v.css}"></head><body>${row}
    <script>window.__ddIxFail=[];window.ddIxFail=function(s,e){__ddIxFail.push(s+':'+e)};document.querySelector('[data-ixh~=chips]').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
    var a=b.hasAttribute('aria-checked')?'aria-checked':'aria-pressed';this.querySelectorAll('button').forEach(function(x){x.setAttribute(a,x===b?'true':'false');x.tabIndex=x===b?0:-1})})</script>
    <script src="/${v.js}"></script></body></html>`;
  const radio = `<div data-ixh="chips" role="radiogroup" aria-label="排序">${['最新', '星级', '名称'].map((t, i) => `<button role="radio" aria-checked="${!i}" tabindex="${i ? -1 : 0}">${t}</button>`).join('')}</div>`;
  const press = `<div data-ixh="chips">${['全部', 'AI', 'Agent'].map((t, i) => `<button data-ixh="chip" aria-pressed="${!i}">${t}</button>`).join('')}</div>`;
  const under = () => { const bub = document.querySelector('.ixbub'), on = document.querySelector('[aria-checked="true"],[aria-pressed="true"]'); if (!bub || getComputedStyle(bub).opacity !== '1') return 'no-bubble';
    const m = new DOMMatrix(getComputedStyle(bub).transform); return Math.abs(m.e - on.offsetLeft) < 1 && Math.abs(bub.offsetWidth - on.offsetWidth) < 1 ? on.textContent : 'bubble-off ' + on.textContent; };
  for (const [name, row, rm] of [['radio', radio], ['pressed', press], ['radio-rm', radio, 1]]) { const ctx = await b.newContext({ viewport: { width: 800, height: 300 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('js ' + e.message.slice(0, 80)));
    await p.route(base + 'ix-fixture.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page(row, rm) })); await p.goto(base + 'ix-fixture.html'); await p.waitForTimeout(100);
    const at = async want => { await p.waitForTimeout(rm ? 30 : 450); const got = await p.evaluate(under); if (got !== want) out.push(`${name}: want ${want} got ${got}`); };
    const st = await p.evaluate(() => [document.documentElement.classList.contains('ix-chips-on'), (window.__ddIx || []).join(), window.__ddIxFail.join()]);
    if (!st[0] || !st[1].includes('chips:direction2') || st[2]) out.push(`${name}: not on (${st.join(' / ')})`);
    const first = name.startsWith('radio') ? '最新' : '全部', [, second, third] = name.startsWith('radio') ? ['最新', '星级', '名称'] : ['全部', 'AI', 'Agent'];
    await at(first); await p.click(`button:text-is("${third}")`); await at(third);
    if (name.startsWith('radio')) { await p.keyboard.press('ArrowRight'); await at(first); await p.keyboard.press('ArrowLeft'); await at(third); await p.keyboard.press('Home'); await at(first);
      await p.keyboard.press('ArrowDown'); await at(second); if ((await p.evaluate(() => document.activeElement.textContent)) !== second) out.push(`${name}: focus did not follow`);
      if (rm) { await p.keyboard.press('End'); const n = await p.evaluate(() => document.getAnimations().length); if (n) out.push(`${name}: ${n} animations under dd-rm`); } }
    else { await p.focus('button:text-is("AI")'); await p.keyboard.press('ArrowRight'); await at(third); }   // no radiogroup: arrows do nothing
    out.push(...errs.map(e => name + ' ' + e)); await ctx.close(); }
  bad('chips/direction2 fixture', out); if (!out.length) console.log('✓ chips/direction2: radiogroup (aria-checked + arrows/Home/End), aria-pressed row, dd-rm'); }
await b.close(); srv.close();
console.log(fails ? `invariants${SMOKE ? ' 快检' : ''}: ${fails} 组失败` : `invariants${SMOKE ? ' 快检' : ''}: ${runs.length} 组（default + ${runs.length - 1} 个变体）× ${pick.length} 主题 × 1440/390 全部通过`);
process.exit(fails ? 1 : 0);
