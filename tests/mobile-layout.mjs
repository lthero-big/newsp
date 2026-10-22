// Mobile layout check (+ v3.6.1 phone tab bar at 320/360/390/430, owner/guest): at 360/390/412 for every theme, every visible card >= viewport-40px wide, no horizontal overflow.
// Usage: node tests/mobile-layout.mjs [baseUrl] [shotPrefix]   (default: serves ./dist on a local port). Exit 1 on failure.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { launchChrome } from '../scripts/chrome.mjs';
let base = process.argv[2], srv;
if (!base) {
  const root = process.env.NEWS_TEST_DIST || new URL('../dist/', import.meta.url).pathname;
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  srv = createServer(async (q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; if (!extname(p)) p += '.html';
    try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
  await new Promise(r => srv.listen(0, r)); base = `http://127.0.0.1:${srv.address().port}/`;
}
const shot = process.argv[3];
const b = await launchChrome();   // pipe by default; NEWS_CDP_PORT → own CDP port (scripts/chrome.mjs)
// v3.7 editions/ix (DESIGN-RULES §12): NEWS_TEST_QS="ed=2026-W44" or "ix=layout:bento" is appended to every page this test opens, so the whole
// suite runs against one edition / slot variant; NEWS_TEST_THEMES="a,b" or "3" (first N) limits the theme loop. tests/editions.mjs drives both.
const QS = process.env.NEWS_TEST_QS || '';
if (QS) { const P = Object.getPrototypeOf(await (await b.newContext()).newPage()), go = P.goto;
  P.goto = function (url, o) { const [u, h] = String(url).split('#'); return go.call(this, u + (u.includes('?') ? '&' : '?') + QS + (h !== undefined ? '#' + h : ''), o); }; }
const p0 = await b.newPage(); await p0.goto(base, { waitUntil: 'load' });
let themes = [...new Set(await p0.evaluate(() => [...document.querySelectorAll('.dock [data-t]')].map(x => x.dataset.t)))]; await p0.close();
{ const T = process.env.NEWS_TEST_THEMES; if (T) themes = /^\d+$/.test(T) ? themes.slice(0, +T) : T.split(',').filter(t => themes.includes(t)); }
// 快检 (NEWS_TEST_SMOKE=1, the default edition check in run-edition.sh): content-only safety net, <1 min — the card layout check on 2 representative
// themes (this week's + a contrasting light/editorial one) × 390/1440, plus the newest day page and 往期; then exit. The full suite is NEWS_FULL_TESTS=1.
const SMOKE = process.env.NEWS_TEST_SMOKE === '1';
if (SMOKE && !process.env.NEWS_TEST_THEMES) themes = [...new Set([themes[0], themes.find(t => /editorial|swiss|brutal/.test(t) && t !== themes[0]) || themes[1]].filter(Boolean))];
if (QS) console.log(`(editions) ${QS} · themes ${themes.join(',')}`);
let fails = 0;
for (const w of SMOKE ? [390, 1440] : [360, 390, 412, 1440]) for (const t of themes) {
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await p.goto(base + (base.includes('?') ? '&' : '?') + 'theme=' + t, { waitUntil: 'load' });
  const bad = await p.evaluate(() => { const vw = document.documentElement.clientWidth, out = [];
    for (const t of document.querySelectorAll('main .card .tags > *')) { const h = t.getBoundingClientRect().height; if (h >= 40) out.push(`tall-tag ${Math.round(h)}`); }
    for (const c of document.querySelectorAll('main .card.wide')) { const kids = [...c.children].filter(e => !e.matches('.pic,.foot') && e.getBoundingClientRect().height);
      for (let i = 1; i < kids.length; i++) { const g = kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom; if (g > 48) out.push(`wide-gap ${Math.round(g)} before .${kids[i].className}`); } }
    if (!document.querySelector('.ical .cal .cd.sel')) out.push('no-calendar');
    // tuck-away glyph (arrow into tray) renders ≥14px with a visible stroke and a plain-Chinese label
    for (const rd of [...document.querySelectorAll('main .card>.rd')].slice(0, 6)) { const sv = rd.querySelector('svg'), q = sv?.getBoundingClientRect(), cs = sv && getComputedStyle(sv);
      if (!sv || !q.width || q.width < 14 || !(sv.querySelector('path')?.getAttribute('d') || '').includes('m4.6 2.6 3.4 3.4')) out.push('rd-icon');
      if (['::after', '::before'].some(x => { const a = getComputedStyle(rd, x); return a.content !== 'none' && a.content !== 'normal' && a.display !== 'none'; })) out.push('rd-dot');
      else if (cs.stroke === 'none' || cs.stroke === getComputedStyle(rd).backgroundColor || parseFloat(cs.opacity) < .5) out.push('rd-icon-invisible');
      if (rd.getAttribute('aria-label') !== '看过，收起') out.push('rd-label ' + rd.getAttribute('aria-label')); }
    // v3.6 face: ♥ · 收藏 · ＋ only — no stars, no x/5, no ⤢
    if (document.querySelector('main .card .stars, main .card .rv, main .card .focus, .dd-backdrop')) out.push('legacy-control');
    if (vw <= 640) for (const c of document.querySelectorAll('main .module:not(.prompts) .card[data-id]')) { if (!c.offsetParent || c.closest('.ed-lead,.seen')) continue;
      const media = !!c.querySelector(':scope > .pic:not(.logo), :scope > .gal'); if (media === c.classList.contains('mini')) out.push(media ? 'phone-media-small' : 'phone-text-big'); }
    if (vw > 900) return [...new Set(out)].slice(0, 4);
    if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`);
    for (const c of document.querySelectorAll('main .card')) { const r = c.getBoundingClientRect(); if (!r.width || getComputedStyle(c).display === 'none') continue;
      const rd = c.querySelector(':scope > .rd'); if (rd && rd.offsetParent) { const q = rd.getBoundingClientRect(); if (r.right - q.right > 48 || q.top - r.top > 48 || q.left < r.right - 60) out.push(`rd-not-corner ${Math.round(r.right - q.right)},${Math.round(q.top - r.top)}`); } else if (c.dataset.id) out.push('rd-missing');
      if (r.width < vw - 40) out.push(`narrow ${c.className.split(' ').slice(0, 3).join('.')} ${Math.round(r.width)}<${vw - 40}`);
      if (r.right > vw + 1) out.push(`offscreen ${Math.round(r.right)}`); }
    return [...new Set(out)].slice(0, 4); });
  if (bad.length) { fails++; console.log(`✗ ${w} ${t}: ${bad.join(' | ')}`); }
  if (shot && (w === 412 || w === 1440)) await p.screenshot({ path: `${shot}-${t}-${w}.png` });
  await p.close();
}
// 换日期 = one digit change (2026-10-22 bug: the old page rolled to the new date, then the new page rolled 00 → date again) + 页面切换动效 runs (design-site drift, not the old book turn).
// Newest edition → pick another day in the calendar: the old page's digits must not move; the new page's roll must start at the old date's digits.
{ const p = await b.newPage({ viewport: { width: 1280, height: 860 } }), log = [], errs = [];
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await p.addInitScript(() => { let last = ''; const rd = () => [...document.querySelectorAll('.ical .roll .rl.f .rs')].map(c => { const m = /translateY\((-?[\d.]+)em\)/.exec(c.style.transform || ''); return m ? (-parseFloat(m[1])).toFixed(2) : null; });
    const loop = () => { const v = rd(); if (v.length && !v.includes(null)) { const k = v.join('|'); if (k !== last) { last = k; console.log('ROLL ' + location.pathname + ' ' + k); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    addEventListener('pagereveal', e => { if (e.viewTransition) setTimeout(() => { const H = document.documentElement; let a = ''; try { a = H.getAnimations({ subtree: true }).map(x => x.animationName).filter(Boolean).join(','); } catch {} console.log('TURN ' + H.classList.contains('pt-vt') + ' ' + a); }, 30); }); });
  p.on('console', m => log.push(m.text())); p.on('pageerror', e => errs.push(e.message.slice(0, 80)));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const [cur, to] = await p.evaluate(() => [document.querySelector('.ical')?.dataset.cur, [...document.querySelectorAll('.ical .cd.has:not(.sel)')].pop()?.dataset.d]);
  const bad = [...errs];
  if (!cur || !to) bad.push('no second edition day in the calendar');
  else { const n0 = log.length; await p.click(`.ical .cd[data-d="${to}"]`); await p.waitForURL(u => String(u).includes(to)); await p.waitForTimeout(1800);
    const after = log.slice(n0), rolls = after.filter(l => l.startsWith('ROLL ')), oldMoves = rolls.filter(l => !l.includes(to)), fresh = rolls.filter(l => l.includes(to)).map(l => l.split(' ').pop());
    const dg = d => [...String(+d.slice(8))].map(x => (+x).toFixed(2)).join('|');
    if (oldMoves.length) bad.push(`old page rolled before navigating (${oldMoves.length} frames): ${oldMoves.slice(0, 3).join(' / ')}`);
    if (!fresh.length) bad.push('new page: no digits'); else { const o = dg(cur).split('|').map(Number), t = dg(to).split('|').map(Number);  // every frame stays between the old and new digit (+ spring overshoot)
        if (o.length === t.length) { const off = fresh.find(f => f.split('|').some((v, i) => +v < Math.min(o[i], t[i]) - .3 || +v > Math.max(o[i], t[i]) + .3)); if (off) bad.push(`new page digits pass through ${off} on the way ${dg(cur)} → ${dg(to)} (double change)`); } if (fresh[fresh.length - 1] !== dg(to)) bad.push(`ends at ${fresh[fresh.length - 1]}`); }
    if (await p.evaluate(() => 'onpagereveal' in window)) { const tl = after.find(l => l.startsWith('TURN ')) || '';
      if (!tl.startsWith('TURN true')) bad.push('no 页面切换 view transition'); else if (tl.split(' ')[2] && !tl.split(' ')[2].split(',').some(n => /^pt(M?)(Out|In)[LR]$/.test(n))) bad.push('transition is not the drift: ' + tl.slice(0, 80)); } }
  if (bad.length) { fails++; console.log(`✗ 换日期 ${cur} → ${to}: ${bad.join(' | ')}`); } else console.log(`✓ 换日期 ${cur} → ${to}: 数字只变一次，页面切换动效`);
  await p.close(); }
if (SMOKE) { // + newest day page and 往期 at 390/1440: loads, no JS errors, no horizontal scroll, cards present
  const pg = await b.newPage(); await pg.goto(base + 'archive.html', { waitUntil: 'load' }); const day = await pg.$eval('.days .day', a => a.getAttribute('href')).catch(() => ''); await pg.close();
  for (const u of [day, 'archive.html'].filter(Boolean)) for (const w of [390, 1440]) for (const t of themes) { const p = await b.newPage({ viewport: { width: w, height: 800 } }), errs = [];
    p.on('pageerror', e => errs.push('js ' + e.message.slice(0, 80))); await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + u + '?theme=' + t, { waitUntil: 'load' }); await p.waitForTimeout(150);
    const bad = [...errs, ...await p.evaluate(isDay => { const vw = document.documentElement.clientWidth, out = []; if (document.documentElement.scrollWidth > vw + 1) out.push('hscroll');
      if (isDay && !document.querySelector('main .card[data-id]')) out.push('no-cards'); if (!isDay && !document.querySelector('.days .day')) out.push('no-days');
      for (const c of document.querySelectorAll('main .card')) { const r = c.getBoundingClientRect(); if (r.width && r.right > vw + 1) { out.push('offscreen'); break; } } return out; }, u === day)];
    if (bad.length) { fails++; console.log(`✗ 快检 ${u} ${w} ${t}: ${[...new Set(bad)].join(' | ')}`); } await p.close(); }
  await b.close(); srv?.close();
  console.log(fails ? `mobile-layout 快检: ${fails} 组失败` : `mobile-layout 快检: ${themes.length} 主题（${themes.join('、')}）× 390/1440 通过`);
  process.exit(fails ? 1 : 0); }
// filters: every visible card must match the chip; module counts = visible cards; empty containers hidden
{ const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await p.goto(base, { waitUntil: 'load' });
  const chips = await p.$$eval('.chip[data-tag]:not([data-tag="*"]), .chip[data-batch]', cs => cs.map(c => c.dataset.tag ? `[data-tag="${c.dataset.tag}"]` : '[data-batch]'));
  for (const sel of chips) {
    await p.click(`.chip${sel}`); await p.waitForTimeout(350);
    const bad = await p.evaluate(sel => { const out = [], chip = document.querySelector('.chip' + sel), tag = chip.dataset.tag;
      const pressed = [...document.querySelectorAll('.chip[aria-pressed="true"]')]; if (pressed.length !== 1 || pressed[0] !== chip) out.push('pressed ' + pressed.map(c => c.textContent.trim()).join('/'));
      const all = document.querySelector('.chip[data-tag="*"]'), plain = document.querySelector('.chip[data-tag]:not([aria-pressed="true"]):not([data-tag="*"])'); if (all && plain && getComputedStyle(all).backgroundColor !== getComputedStyle(plain).backgroundColor) out.push('全部 looks selected');
      const vis = [...document.querySelectorAll('main .card[data-id]')].filter(c => c.offsetParent !== null);
      for (const c of vis) if (tag ? !c.dataset.tags.split(',').includes(tag) : c.dataset.batch !== 'pm') out.push('leak ' + c.dataset.id.slice(7, 15));
      const want = +(chip.querySelector('.n')?.textContent || vis.length); if (want !== vis.length) out.push(`count ${vis.length}!=${want}`);
      for (const m of document.querySelectorAll('.module')) { const n = [...m.querySelectorAll('.card[data-id]')].filter(c => c.offsetParent !== null).length; const cnt = m.querySelector('.count'); if (cnt && +cnt.textContent !== n && m.offsetParent) out.push('modcount'); if (!n && m.offsetParent !== null && m.querySelector('.card')) out.push('empty-module-visible'); }
      return out.slice(0, 4); }, sel);
    if (bad.length) { fails++; console.log(`✗ filter ${sel}: ${bad.join(' | ')}`); }
    await p.click(`.chip${sel}`); if (sel.includes('tag')) await p.click('.chip[data-tag="*"]').catch(() => {});
  }
  if (shot) { await p.click('.chip[data-tag="Agent"]').catch(() => {}); await p.screenshot({ path: `${shot}-filter-agent-1440.png`, fullPage: true }); }
  await p.close(); }
// trash page (owner, mocked API): no hscroll, chips wrap (no raw feed:/repo: keys), card shadows clear the next heading
{ const now = Date.now(), keys = ['feed:vllm-releases', 'repo:vllm-project/vllm', 'site:github.com', 'kw:very-long-keyword-that-should-wrap-nicely-on-small-phones'];
  const snap = n => ({ title: '示例条目 ' + n + ' 一个比较长的标题用来测试换行情况', module: 'opensource', source: 'github', date: '2026-10-16', url: 'https://example.com/' + n, keys });
  const items = { a: { status: 'pending', expires_at: now + 3600e3, clicks: 1, snapshot: snap(1) }, b: { status: 'trashed', trashed_at: now - 1e5, expires_at: now - 1e5, snapshot: snap(2) }, c: { status: 'trashed', trashed_at: now - 2e5, expires_at: now - 2e5, snapshot: snap(3) } };
  for (const w of [360, 390, 412]) for (const t of themes) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
    await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.request().url().includes('/api/deletions') ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: Date.now(), items, overrides: {} }) }) : r.fulfill({ contentType: 'application/json', body: '{"items":{}}' }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'trash.html' + '?theme=' + t, { waitUntil: 'load' }); await p.waitForSelector('#trashed .card', { timeout: 5000 }).catch(() => {});
    const bad = await p.evaluate(() => { const vw = document.documentElement.clientWidth, out = [];
      if (!document.querySelector('#trashed .card')) out.push('no-cards');
      if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`);
      for (const k of document.querySelectorAll('.tags .tag, #penalties code')) { if (/^(feed|repo|site|kw|x|hf):/.test(k.textContent)) out.push('raw-key ' + k.textContent); if (k.getBoundingClientRect().right > vw + 1) out.push('chip-offscreen'); }
      for (const g of document.querySelectorAll('#pending, #trashed')) { const h = g.nextElementSibling; const cards = [...g.querySelectorAll('.card')]; if (!h || !cards.length) continue;
        const last = cards[cards.length - 1], cs = getComputedStyle(last), sh = cs.boxShadow === 'none' ? 0 : Math.max(0, ...(cs.boxShadow.match(/-?\d+(\.\d+)?px/g) || []).slice(0, 2).map(parseFloat));
        const gap = h.getBoundingClientRect().top - last.getBoundingClientRect().bottom; if (gap < sh + 12) out.push(`shadow-overlap gap ${Math.round(gap)} shadow ${sh}`); }
      return [...new Set(out)].slice(0, 4); });
    if (bad.length) { fails++; console.log(`✗ trash ${w} ${t}: ${bad.join(' | ')}`); }
    if (shot && w === 390) await p.screenshot({ path: `${shot}-trash-${t}-${w}.png`, fullPage: true });
    await p.close();
  } }
// 已看 shelf: ticking parks a card in its section's bar; no holes in lead/side/grid; un-tick restores the original order
const holes = () => { const out = [];
  for (const ed of document.querySelectorAll('.ed')) { if (ed.hidden) continue; const L = ed.querySelector('.ed-lead'), S = ed.querySelector('.ed-side');
    if (L.querySelector('.card.read') || S.querySelector('.card.read')) out.push('read-in-layout');
    if (!ed.classList.contains('nolead') && (L.hidden || S.hidden)) out.push('empty-column');
    const lc = [...L.querySelectorAll('.card')].find(c => c.offsetParent); if (lc && L.getBoundingClientRect().height - lc.getBoundingClientRect().height > 40 && lc.getBoundingClientRect().height < S.getBoundingClientRect().height - 40) out.push('lead-hole'); }
  for (const M of document.querySelectorAll('.ed-more')) { if (M.hidden || !M.offsetParent) continue; const W = M.getBoundingClientRect(), rows = new Map();
    for (const c of M.querySelectorAll(':scope>.card')) { if (!c.offsetParent) continue; if (c.classList.contains('read')) out.push('read-in-grid'); const r = c.getBoundingClientRect(), k = Math.round(r.top); rows.set(k, (rows.get(k) || 0) + r.width); }
    for (const [, w] of rows) if (w < W.width * 0.9) out.push(`grid-hole ${Math.round(w)}/${Math.round(W.width)}`); }
  return [...new Set(out)]; };
const ownerPage = async (w, t, ctxOpts = {}) => { const ctx = await b.newContext({ viewport: { width: w, height: 900 }, ...ctxOpts }); const p = await ctx.newPage();
  await p.addInitScript(() => { if (!sessionStorage.getItem('t')) { localStorage.clear(); sessionStorage.setItem('t', 1); } localStorage.setItem('news-owner', 'test'); });
  await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: '{"items":{},"now":0,"overrides":{}}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await p.goto(base + (t ? '?theme=' + t : ''), { waitUntil: 'load' }); await p.waitForTimeout(300); return [ctx, p]; };
const order = p => p.evaluate(() => [...document.querySelectorAll('main .module')].map(m => [...m.querySelectorAll('.card[data-id]')].filter(c => c.offsetParent).map(c => c.dataset.id).join(',')).join('|'));
// every theme × 1440/390: tick the first lead + first grid card of each section → parked, no holes
for (const w of [1440, 390]) for (const t of themes) { const [ctx, p] = await ownerPage(w, t);
  const ids = await p.evaluate(() => [...document.querySelectorAll('.ed-lead .card, .ed-more > .card:first-child')].map(c => c.dataset.id));
  for (const id of ids) await p.$eval(`.card[data-id="${id}"] .rd`, e => e.click());
  await p.waitForTimeout(700);
  const bad = await p.evaluate(([ids, holesSrc]) => { const out = eval(holesSrc)();
    for (const id of ids) if (!document.querySelector(`[data-id="${id}"]`).closest('.seen .park')) out.push('not-parked');
    for (const s of document.querySelectorAll('.seen:not([hidden])')) { const r = s.querySelector('.shbar').getBoundingClientRect(); if (r.right > document.documentElement.clientWidth + 1) out.push('bar-offscreen'); }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('hscroll');
    return [...new Set(out)]; }, [ids, holes.toString()]);
  if (bad.length) { fails++; console.log(`✗ shelf ${w} ${t}: ${bad.join(' | ')}`); }
  await ctx.close(); }
console.log(`✓ shelf check done (${themes.length} 主题 × 1440/390)`);
// interaction: tick → shelf; expand; tap title → restored; ✓ in list → restored; original order back
for (const w of [1440, 390]) { const [ctx, p] = await ownerPage(w);
  const o0 = await order(p), ids = await p.evaluate(() => { const m = [...document.querySelectorAll('.module')].find(m => m.querySelector('.ed-more .card')); return [m.querySelector('.ed-lead .card').dataset.id, m.querySelector('.ed-more .card').dataset.id]; });
  for (const id of ids) await p.$eval(`.card[data-id="${id}"] .rd`, e => e.click()); await p.waitForTimeout(600);
  const bad = [], sec = await p.evaluateHandle(id => document.querySelector(`[data-id="${id}"]`).closest('.module'), ids[0]);
  if (await sec.evaluate(m => m.querySelector('.shbar b').textContent) !== '2') bad.push('count');
  bad.push(...await p.evaluate(h => eval(h)(), holes.toString()));
  if (shot) await sec.screenshot({ path: `${shot}-shelf-closed-${w}.png` });
  await sec.evaluate(m => m.querySelector('.shbar').click()); await p.waitForTimeout(350);
  if (await sec.evaluate(m => m.querySelectorAll('.slist li').length) !== 2) bad.push('list');
  if (shot) await sec.screenshot({ path: `${shot}-shelf-open-${w}.png` });
  await p.$eval(`.slist li[data-sid="${ids[0]}"] a`, e => e.click()); await p.waitForTimeout(500);
  if (await p.$eval(`.card[data-id="${ids[0]}"] .rd`, e => e.getAttribute('aria-pressed')) !== 'false') bad.push('title-not-untick');
  await p.$eval(`.slist li[data-sid="${ids[1]}"] .su`, e => e.click()); await p.waitForTimeout(500);
  if (await order(p) !== o0) bad.push('order-not-restored');
  if (await p.$$eval('.seen:not([hidden])', s => s.length)) bad.push('bar-still-visible');
  if (bad.length) { fails++; console.log(`✗ shelf-cycle ${w}: ${bad.join(' | ')}`); } else console.log(`✓ shelf tick→expand→untick→order restored ${w}`);
  await ctx.close(); }
// mobile swipe left → parked; undo → back in place
{ const [ctx, p] = await ownerPage(390, '', { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const o0 = await order(p), bad = [];
  const id = await p.evaluate(() => document.querySelector('.ed-side .card, .ed-more .card').dataset.id);
  await p.evaluate(id => { const c = document.querySelector(`[data-id="${id}"]`), h = c.querySelector('h3'), r = h.getBoundingClientRect(), y = r.top + 5;
    const t = x => new Touch({ identifier: 1, target: h, clientX: x, clientY: y });
    h.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(300)] }));
    for (const x of [280, 240, 200, 180]) h.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(x)] }));
    h.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })); }, id);
  await p.waitForTimeout(600);
  if (!await p.$eval(`[data-id="${id}"]`, c => !!c.closest('.seen .park'))) bad.push('swipe-not-parked');
  if (!await p.$('.rtoast')) bad.push('no-toast'); else if (!/已收起/.test(await p.$eval('.rtoast', e => e.textContent))) bad.push('toast-copy');
  else if (await p.evaluate(() => { const a = document.querySelector('.rtoast').getBoundingClientRect(), c = document.querySelector('.tabbar').getBoundingClientRect(); return !document.body.classList.contains('tb-hide') && a.bottom > c.top; })) bad.push('toast×tabbar');
  bad.push(...await p.evaluate(h => eval(h)(), holes.toString()));
  if (shot) await p.screenshot({ path: `${shot}-swipe-390.png` });
  await p.$eval('.rtoast button', e => e.click()); await p.waitForTimeout(500);
  if (await order(p) !== o0) bad.push('undo-order');
  if (bad.length) { fails++; console.log(`✗ swipe: ${bad.join(' | ')}`); } else console.log('✓ swipe → shelf → undo restores');
  await ctx.close(); }
// guest (not unlocked, 10-20 bug): 收起 parks the card in the shelf too (local only, no API call), survives a reload; swipe works for guests as well
for (const w of [1440, 390]) { const ctx = await b.newContext({ viewport: { width: w, height: 900 }, ...(w < 640 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) }); const p = await ctx.newPage(); let api = 0;
  await p.addInitScript(() => { if (!sessionStorage.getItem('t')) { localStorage.clear(); sessionStorage.setItem('t', 1); } });
  await p.route(/\/api\//, r => { api++; r.fulfill({ status: 401, body: '' }); });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(300); const bad = [], o0 = await order(p);
  if (await p.evaluate(() => document.body.classList.contains('owner'))) bad.push('not-guest');
  const id = await p.evaluate(() => document.querySelector('.ed-lead .card').dataset.id);
  await p.$eval(`.card[data-id="${id}"] .rd`, e => e.click()); await p.waitForTimeout(600);
  const parked = () => p.$eval(`[data-id="${id}"]`, c => !!c.closest('.seen .park'));
  if (!await parked()) bad.push('guest-not-parked');
  bad.push(...await p.evaluate(h => eval(h)(), holes.toString()));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(300);
  if (!await parked()) bad.push('guest-not-parked-after-reload');
  await p.$eval(`.slist li[data-sid="${id}"] .su`, e => e.click()); await p.waitForTimeout(500);
  if (await parked() || await order(p) !== o0) bad.push('guest-putback');
  if (w < 640) { const id2 = await p.evaluate(() => document.querySelector('.ed-side .card, .ed-more .card').dataset.id);
    await p.evaluate(id => { const h = document.querySelector(`[data-id="${id}"] h3`), y = h.getBoundingClientRect().top + 5, t = x => new Touch({ identifier: 1, target: h, clientX: x, clientY: y });
      h.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(300)] })); for (const x of [280, 240, 200, 180]) h.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(x)] }));
      h.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })); }, id2); await p.waitForTimeout(600);
    if (!await p.$eval(`[data-id="${id2}"]`, c => !!c.closest('.seen .park'))) bad.push('guest-swipe-not-parked'); }
  if (api) bad.push(`guest-api-calls ${api}`);
  if (bad.length) { fails++; console.log(`✗ guest shelf ${w}: ${bad.join(' | ')}`); } else console.log(`✓ guest 收起 → shelf (local, survives reload) → 放回 ${w}`);
  await ctx.close(); }
// 已收起 is deliberate: 点赞 / 少推 / 收藏 never tuck or move a card; favouriting a tucked card takes it back out of the shelf (v3.6)
for (const w of [1440, 390]) { const [ctx, p] = await ownerPage(w); const o0 = await order(p), bad = [];
  const ids = await p.evaluate(() => [...document.querySelectorAll('.module')].flatMap(m => [...m.querySelectorAll('.card[data-id]')].slice(0, 2)).slice(0, 5).map(c => c.dataset.id));
  const parked = id => p.$eval(`[data-id="${id}"]`, c => !!c.closest('.seen .park'));
  const pressed = id => p.$eval(`.card[data-id="${id}"] .rd`, e => e.getAttribute('aria-pressed'));
  await p.$eval(`.card[data-id="${ids[0]}"] .fav`, e => e.click());
  await p.$eval(`.card[data-id="${ids[1]}"] .like`, e => e.click());
  await p.$eval(`.card[data-id="${ids[2]}"] .adds`, e => e.click()); await p.waitForTimeout(150); await p.click('.acti [data-a="down"]'); await p.waitForTimeout(600);
  for (const id of ids.slice(0, 3)) { if (await parked(id)) bad.push('act-parked'); if (await pressed(id) !== 'false') bad.push('act-tucked'); }
  if (await order(p) !== o0) bad.push('act-moved');
  await p.$eval(`.card[data-id="${ids[3]}"] .rd`, e => e.click()); await p.waitForTimeout(500);
  if (!await parked(ids[3])) bad.push('tuck-not-parked');
  if (shot && w === 390) await p.screenshot({ path: `${shot}-tucked-390.png` });
  await p.$eval(`.card[data-id="${ids[3]}"] .fav`, e => e.click()); await p.waitForTimeout(600);
  if (await parked(ids[3]) || await pressed(ids[3]) !== 'false') bad.push('fav-did-not-untuck');
  if (await order(p) !== o0) bad.push('order-not-restored');
  bad.push(...await p.evaluate(h => eval(h)(), holes.toString()));
  if (bad.length) { fails++; console.log(`✗ tuck-vs-acts ${w}: ${[...new Set(bad)].join(' | ')}`); } else console.log(`✓ 点赞/少推/收藏 never tuck; 收藏 on a tucked card brings it back ${w}`);
  await ctx.close(); }
// v3.6 actions: face order ♥ · 收藏 · ＋; menu 少推 · 源 · 深挖 · 指令 | 不感兴趣; like ⟂ 少推 (one vote), like ⟂̸ 收藏; 少推 toast + undo, card stays
for (const w of [1440, 390]) { const [ctx, p] = await ownerPage(w); const bad = [], o0 = await order(p);
  const id = await p.evaluate(() => document.querySelector('main .ed-side .card, main .ed-more .card').dataset.id), q = `.card[data-id="${id}"]`;
  const face = await p.$eval(`${q} .acts`, a => [...a.children].filter(x => x.offsetParent).map(x => x.className.split(' ')[0]).join(','));
  if (face !== 'like,fav,adds') bad.push('face ' + face);
  const st = () => p.evaluate(id => { const s = JSON.parse(localStorage.getItem('news-state-v1') || '{}')[id] || {}; return [s.vote || 0, !!s.fav]; }, id);
  await p.$eval(`${q} .like`, e => e.click()); await p.$eval(`${q} .fav`, e => e.click()); await p.waitForTimeout(200);
  if (String(await st()) !== '1,true') bad.push('like+fav ' + await st());
  await p.$eval(`${q} .adds`, e => e.click()); await p.waitForTimeout(200);
  const menu = await p.$eval('.acti', m => [...m.children].map(x => x.dataset.a || x.className).join(','));
  if (menu !== 'down,src,dig,cmd,asep,del') bad.push('menu ' + menu);
  if (shot) await p.$eval(q, c => c.scrollIntoView({ block: 'center' })), await p.screenshot({ path: `${shot}-menu-${w}.png` });
  await p.click('.acti [data-a="down"]'); await p.waitForTimeout(300);
  if (String(await st()) !== '-1,true') bad.push('down ' + await st());
  if (await p.$eval(`${q} .like`, e => e.getAttribute('aria-pressed')) !== 'false') bad.push('like-still-on');
  const tt = await p.$eval('.ntoast', e => e.textContent.replace(/\s+/g, '')).catch(() => ''); if (!/^已记下：少推这类·撤销/.test(tt)) bad.push('toast ' + tt);
  if (w < 641) { await p.waitForTimeout(300); if (await p.evaluate(() => { const a = document.querySelector('.ntoast')?.getBoundingClientRect(), c = document.querySelector('.tabbar').getBoundingClientRect(); return a && !document.body.classList.contains('tb-hide') && a.bottom > c.top; })) bad.push('ntoast×tabbar'); }
  if (await order(p) !== o0 || await p.$eval(q, c => !!c.closest('.seen') || c.hidden)) bad.push('down-moved-card');
  if (shot) await p.screenshot({ path: `${shot}-down-toast-${w}.png` });
  await p.click('.ntoast .undo-src'); await p.waitForTimeout(300);
  if (String(await st()) !== '1,true') bad.push('undo ' + await st());
  await p.$eval(`${q} .adds`, e => e.click()); await p.waitForTimeout(150); await p.click('.acti [data-a="down"]'); await p.waitForTimeout(200);
  await p.$eval(`${q} .like`, e => e.click()); await p.waitForTimeout(200);
  if (String(await st()) !== '1,true') bad.push('like-after-down ' + await st());
  if (bad.length) { fails++; console.log(`✗ actions ${w}: ${bad.join(' | ')}`); } else console.log(`✓ actions: face ♥/收藏/＋, menu order, vote exclusive, 少推 toast+undo, card stays ${w}`);
  await ctx.close(); }
// taste chip (DESIGN-RULES §4): owner-only, small; visitors never see it
for (const w of [390, 1440]) { const bad = [];
  const pv = await b.newPage({ viewport: { width: w, height: 900 } }); await pv.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
  await pv.goto(base, { waitUntil: 'load' }); const n = await pv.$$eval('.card .meta .taste', e => e.length);
  if (await pv.$$eval('.card .meta .taste', e => e.filter(x => x.offsetParent).length)) bad.push('visitor-sees-chip'); await pv.close();
  const [ctx, p] = await ownerPage(w); const vis = await p.$$eval('.card .meta .taste', e => e.filter(x => x.offsetParent).map(x => [x.getBoundingClientRect().height, x.title]));
  if (n && !vis.length) bad.push('owner-no-chip'); for (const [h, t] of vis) { if (h > 22) bad.push(`chip-tall ${Math.round(h)}`); if (!t.startsWith('按你的喜好排前了')) bad.push('chip-title'); }
  if (bad.length) { fails++; console.log(`✗ taste ${w}: ${[...new Set(bad)].join(' | ')}`); } else console.log(`✓ taste chip owner-only ${w} (${vis.length}/${n})`);
  await ctx.close(); }
// calendar: favorites (owner, mocked cloud favs) renders dots + filters by date; both pages: no hscroll at 360/390/412 incl. month open
{ const meta = JSON.parse(await (await fetch(base + 'items.json')).text()), favs = {}; const dates = [...new Set(meta.map(m => m.date))];
  for (const d of dates) meta.filter(m => m.date === d).slice(0, 2).forEach(m => favs[m.id] = { fav: true, vote: 1, updatedAt: 1 });
  for (const w of [360, 390, 412]) for (const t of themes) for (const pg of ['', 'favorites.html']) {
    const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 });
    await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: r.request().url().includes('ratings') ? favs : {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + pg + '?theme=' + t, { waitUntil: 'load' }); await p.waitForSelector('.calbox .cal .cd', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(pg ? 900 : 100);
    const chk = () => p.evaluate(() => { const vw = document.documentElement.clientWidth, out = [], box = document.querySelector('.calbox');
      if (!box || !box.querySelector('.cal .cd') || !box.querySelector('.roll .rs')) out.push('cal-missing');
      if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`);
      if (box && box.querySelector('.cal').getBoundingClientRect().right > vw + 1) out.push('cal-offscreen'); return out; });
    const bad = await chk();
    if (pg) { const n0 = await p.$$eval('#favs .card', c => c.length), d = await p.$eval('.pcal .cd.has', e => e.dataset.d).catch(() => null);
      // the collapsed strip shows only the current week; a fav dot from an earlier week (e.g. on Mondays) needs the month view open first
      const hit = () => p.$eval(`.pcal .cd[data-d="${d}"]`, c => { const r = c.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === c || c.contains(t)); }).catch(() => false);
      let opened = false; if (d && !(await hit())) { await p.click('.pcal .ct').catch(() => {}); await p.waitForTimeout(550); opened = true; }
      if (!d) bad.push('no-fav-dots'); else { await p.click(`.pcal .cd[data-d="${d}"]`); await p.waitForTimeout(500);
        const ds = await p.$$eval('#favs .card .src', s => s.map(x => x.textContent)); if (!ds.length || ds.some(x => x !== d) || ds.length >= n0) bad.push(`filter ${ds.length}/${n0}`); }
      if (opened) { await p.click('.pcal .ct').catch(() => {}); await p.waitForTimeout(550); } }
    await p.click('.calbox .ct').catch(() => {}); await p.waitForTimeout(550); bad.push(...(await chk()).map(x => 'month:' + x));
    if (bad.length) { fails++; console.log(`✗ cal ${pg || 'day'} ${w} ${t}: ${[...new Set(bad)].join(' | ')}`); }
    if (shot && w === 390 && t === themes[0]) await p.screenshot({ path: `${shot}-cal-${pg ? 'fav' : 'day'}-${w}.png` });
    await p.close(); } console.log('✓ calendar check done (day + favorites × 360/390/412)'); }
// 收藏 / 往期 hero (.phero): text in .hero-main (never squeezed into one grid column), calendar digits + caption inside .pcal and clear of the text;
// 往期 calendar public: latest edition selected, picking a day highlights its row; search on both pages (results, empty state, × clear).
{ const meta = JSON.parse(await (await fetch(base + 'items.json')).text()), favs = {}; meta.slice(0, 12).forEach(m => favs[m.id] = { fav: true, vote: 1, updatedAt: 1 });
  const open = async (pg, w, t, owner) => { const p = await b.newPage({ viewport: { width: w, height: 900 } });
    if (owner) await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: r.request().url().includes('ratings') ? favs : {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + pg + '?theme=' + t, { waitUntil: 'load' }); await p.waitForSelector('.pcal .cal .cd, .am-d.has', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(900); return p; };
  for (const pg of ['favorites.html']) for (const w of [390, 1024, 1440]) for (const t of themes) {
    const p = await open(pg, w, t, pg === 'favorites.html'), bad = await p.evaluate(() => { const vw = document.documentElement.clientWidth, out = [], R = e => e.getBoundingClientRect();
      const main = document.querySelector('.phero .hero-main'), h1 = main?.querySelector('h1'), pc = document.querySelector('.pcal');
      if (!main || !pc || !pc.querySelector('.roll .rs')) return ['pcal-missing'];
      if (R(main).width < Math.min(320, vw - 40)) out.push(`hero-main-narrow ${Math.round(R(main).width)}`);
      if (R(h1).height > parseFloat(getComputedStyle(h1).fontSize) * 1.6) out.push('h1-wrapped');
      const kick = main.querySelector('.kicker'); if (R(kick).height > 40) out.push('kicker-wrapped');
      const P = R(pc); for (const e of pc.querySelectorAll('.roll .rl.f .rc, .roll .rm')) { const q = R(e); if (!q.width) continue;
        if (q.left < P.left - 1 || q.right > P.right + 1 || q.top < P.top - 1) { out.push('digits-outside-pcal'); break; }
        const M = R(main); if (q.left < M.right && q.right > M.left && q.top < M.bottom && q.bottom > M.top) { out.push('digits×hero-text'); break; } }
      if (R(pc.querySelector('.cal')).right > vw + 1) out.push('cal-offscreen');
      if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`); return out; });
    if (bad.length) { fails++; console.log(`✗ phero ${pg} ${w} ${t}: ${bad.join(' | ')}`); }
    await p.close(); }
  console.log('✓ 收藏 hero calendar layout (all themes × 390/1024/1440)');
  // 往期 big month calendar (DESIGN-RULES §5): the only calendar on the page; inside the viewport, numbers not clipped, panel beside (≥861) or under;
  // owner sees that day's 收藏 + bookmark marks, guests never do; all themes × 390/1024/1440, both roles at 1440.
  for (const w of [390, 1024, 1440]) for (const t of themes) for (const own of w === 1440 ? [false, true] : [false]) {
    const p = await open('archive.html', w, t, own); await p.waitForSelector('.am-d.has', { timeout: 5000 }).catch(() => {});
    const bad = await p.evaluate(([own, w]) => { const vw = document.documentElement.clientWidth, out = [], R = e => e.getBoundingClientRect();
      if (document.querySelector('.pcal,.calbox')) out.push('second-calendar'); const sec = document.querySelector('.amonth');
      if (!sec || sec.hidden || !sec.offsetParent) return ['amonth-hidden'];
      const cells = [...document.querySelectorAll('.am-d')]; if (!cells.length || !document.querySelector('.am-d.sel')) out.push('no-cells/sel');
      for (const c of cells) { const r = R(c); if (r.left < -1 || r.right > vw + 1) { out.push('cell-offscreen'); break; }
        const b = c.querySelector('b'), q = R(b); if (q.right > r.right + 1 || q.bottom > r.bottom + 1) { out.push(`daynum-clipped ${b.textContent}`); break; }
        const e = c.querySelector('em'); if (e) { const z = R(e); if (z.right > r.right + 1 || z.bottom > r.bottom + 1 || z.top < q.bottom - 2) { out.push(`count-clipped/overlap ${b.textContent}`); break; } } }
      const pn = document.querySelector('.apanel'), g = document.querySelector('.am-grid'), P = R(pn), G = R(g);
      if (!pn.querySelector('.ap-open[href$=".html"]') || !pn.querySelectorAll('.ap-sec li a[href^="http"]').length) out.push('panel-content');
      if (P.right > vw + 1) out.push('panel-offscreen'); if (w > 860 ? !(P.left >= G.right - 1) : !(P.top >= G.bottom - 1)) out.push('panel-position');
      const fav = !!pn.querySelector('.ap-fav'), own2 = !!pn.querySelector('.ap-own'), mk = document.querySelectorAll('.am-d .fv').length;
      if (own ? !(fav && own2 && mk) : (fav || own2 || mk)) out.push(`owner-only ${own} fav=${fav} counts=${own2} marks=${mk}`);
      if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`); return out; }, [own, w]);
    if (bad.length) { fails++; console.log(`✗ 往期 month ${w} ${t}${own ? ' owner' : ''}: ${bad.join(' | ')}`); }
    if (shot && t === themes[0]) await p.screenshot({ path: `${shot}-archive-${w}${own ? '-owner' : ''}.png` });
    await p.close(); }
  console.log('✓ 往期 big month calendar (all themes × 390/1024/1440, owner/guest)');
  // 往期 month arrows: hidden when editions sit in one month; with two months ‹ › switch months, the ends are disabled, and they sit next to the big month title
  for (const w of [390, 1440]) for (const two of [false, true]) { const bad = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.route(/\/archive(\.html)?(\?|$)/, async r => { const res = await r.fetch(), html = await res.text();
      const body = html.replace(/(<script type="application\/json" id="arch-data">)([\s\S]*?)(<\/script>)/, (_, o, j, c) => { const A = JSON.parse(j), ks = Object.keys(A.days).sort(), last = ks[ks.length - 1], ym = last.slice(0, 7);
        for (const k of ks) if (!k.startsWith(ym)) delete A.days[k];   // fixture 1: one month only
        if (two) { const [y, m] = ym.split('-').map(Number), pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; A.days[pm + '-28'] = { ...A.days[last], n: 7 }; }
        return o + JSON.stringify(A).replace(/</g, '\\u003c') + c; });
      return r.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/html' } }); });
    await p.goto(base + 'archive.html?theme=' + themes[0], { waitUntil: 'load' }); await p.waitForSelector('.am-d.has', { timeout: 5000 }).catch(() => {});
    const st = () => p.evaluate(() => { const nv = document.querySelector('.am-navs'), R = e => e.getBoundingClientRect(), t = R(document.querySelector('.am-title'));
      return { vis: !!nv && !nv.hidden && R(nv).width > 0, m: document.querySelector('.am-m').textContent, prev: nv.querySelector('[data-step="-1"]').disabled, next: nv.querySelector('[data-step="1"]').disabled,
        gap: R(nv).left - t.right, sel: document.querySelector('.am-d.sel')?.dataset.d || '' }; });
    let s1 = await st();
    if (!two) { if (s1.vis) bad.push('arrows shown for one month'); }
    else { const m0 = s1.m; if (!s1.vis || s1.prev || !s1.next) bad.push('start ' + JSON.stringify(s1)); if (!(s1.gap >= 0 && s1.gap < 80)) bad.push('detached gap ' + Math.round(s1.gap));
      await p.click('.am-navs [data-step="-1"]'); await p.waitForTimeout(200); s1 = await st();
      if (s1.m === m0 || !s1.prev || s1.next || !s1.sel.endsWith('-28')) bad.push('prev ' + JSON.stringify(s1));
      await p.click('.am-navs [data-step="1"]'); await p.waitForTimeout(200); s1 = await st(); if (s1.m !== m0 || !s1.next || s1.prev) bad.push('next ' + JSON.stringify(s1)); }
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push('hscroll');
    if (shot) await p.screenshot({ path: `${shot}-archive-arrows-${two ? 2 : 1}m-${w}.png` });
    await p.close(); if (bad.length) { fails++; console.log(`✗ 往期 month arrows ${two ? '2 months' : '1 month'} ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 往期 month arrows (1 month → hidden; 2 months → ‹ › switch, ends disabled, next to the title; 390/1440)');
  for (const w of [390, 1440]) { const bad = [];
    // 往期: guest sees the month calendar, latest edition selected + its row marked; another day → panel + row follow; again → opens it; 列表 view
    let p = await open('archive.html', w, themes[0], false); await p.evaluate(() => localStorage.removeItem('news-archive-view')); await p.reload(); await p.waitForTimeout(500);
    const st = await p.evaluate(() => { const A = JSON.parse(document.getElementById('arch-data').textContent); return { sel: document.querySelector('.am-d.sel')?.dataset.d, cur: A.cur, on: document.querySelector('.days .day.on')?.dataset.d, list: !!document.querySelector('.days').offsetParent }; });
    if (st.sel !== st.cur || st.on !== st.cur) bad.push(`default ${st.sel}/${st.on}≠${st.cur}`); if (st.list) bad.push('list-visible-in-month-view');
    const other = await p.$$eval('.am-d.has:not(.sel)', e => e.map(x => x.dataset.d)); if (other.length) { const d = other[0];
      await p.click(`.am-d[data-d="${d}"]`); await p.waitForTimeout(400);
      const r = await p.evaluate(() => ({ sel: document.querySelector('.am-d.sel')?.dataset.d, on: document.querySelector('.days .day.on')?.dataset.d, open: document.querySelector('.ap-open').getAttribute('href'), d: document.querySelector('.ap-d').textContent }));
      if (r.sel !== d || r.on !== d || !r.open.endsWith(d + '.html') || +r.d !== +d.slice(8)) bad.push(`pick ${d}→${JSON.stringify(r)}`);
      await p.focus(`.am-d[data-d="${d}"]`); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
      const k = await p.evaluate(() => document.querySelector('.am-d.sel')?.dataset.d); if (k === d) bad.push('keyboard-arrow');
      await Promise.all([p.waitForURL(/\d{4}-\d{2}-\d{2}\.html/, { timeout: 4000 }).catch(() => bad.push('second-click-open')), p.click(`.am-d[data-d="${k}"]`)]);
      await p.goBack(); await p.waitForTimeout(600); }
    await p.click('.aview [data-v="l"]'); await p.waitForTimeout(200);
    if (!await p.$eval('.days', e => !!e.offsetParent) || await p.$eval('.amonth', e => !!e.offsetParent)) bad.push('list-view');
    await p.click('.aview [data-v="m"]'); await p.waitForTimeout(200);
    // 往期 search: results across editions, empty state, × back to the list
    const word = (meta.find(m => /[A-Za-z]{5,}/.test(m.title)) || meta[0]).title.match(/[A-Za-z]{5,}/)?.[0] || meta[0].title.slice(0, 2);
    await p.fill('#aq', word.toUpperCase()); await p.waitForTimeout(600);
    const r = await p.evaluate(w => ({ n: document.querySelectorAll('#sres .sr').length, days: !!document.querySelector('.days').offsetParent, cal: !!document.querySelector('.amonth').offsetParent, ok: [...document.querySelectorAll('#sres .sr')].every(a => a.querySelector('.sd').getAttribute('href').match(/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.html$/) && a.querySelector('.st').href.startsWith('http')), hs: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      marks: [...document.querySelectorAll('#sres mark')].filter(m => m.textContent.toLowerCase() === w.toLowerCase()).length, chips: !document.querySelector('.amods').hidden }), word);
    const hits = meta.filter(m => [m.title, m.title_orig, m.excerpt, m.source, (m.tags || []).join(' '), m.prompt?.text].join('\n').toLowerCase().includes(word.toLowerCase())), want = hits.length;
    if (!r.n || r.n !== Math.min(want, 80) || r.days || r.cal || !r.ok || r.hs) bad.push(`archive-search ${word} ${r.n}/${want} days=${r.days} cal=${r.cal} links=${r.ok} hscroll=${r.hs}`);
    if (!r.marks || !r.chips) bad.push(`archive-search-marks/chips ${r.marks} ${r.chips}`);
    // module chip narrows to that module; counts on chips add up
    const mods = await p.$$eval('.amods [data-m]', b => b.map(x => ({ m: x.dataset.m, n: +(x.querySelector('.n')?.textContent || 0), dis: x.disabled })));
    const pickM = mods.find(x => x.m && x.n && !x.dis); if (pickM) { await p.click(`.amods [data-m="${pickM.m}"]`); await p.waitForTimeout(300);
      const n = await p.$$eval('#sres .sr', e => e.length); if (n !== Math.min(pickM.n, 80)) bad.push(`archive-mod ${pickM.m} ${n}/${pickM.n}`);
      if (mods[0].n !== mods.slice(1).reduce((a, x) => a + x.n, 0)) bad.push('archive-mod-counts');
      await p.click('.amods [data-m=""]'); await p.waitForTimeout(300); }
    if (shot) await p.screenshot({ path: `${shot}-archive-search-${w}.png` });
    await p.fill('#aq', 'zzqx不存在的词'); await p.waitForTimeout(600); if (!await p.$eval('#sres .empty', e => !!e.offsetParent).catch(() => false)) bad.push('archive-search-empty');
    await p.click('.asearch .sx'); await p.waitForTimeout(300); if (!await p.$eval('.amonth', e => !!e.offsetParent) || await p.$eval('#sres', e => !e.hidden) || !await p.$eval('.amods', e => e.hidden)) bad.push('archive-search-clear');
    await p.close();
    // 收藏 search: narrows cards (combined with 只看收藏), empty state, ×
    p = await open('favorites.html', w, themes[0], true);
    const n0 = await p.$$eval('#favs .card', c => c.length), first = await p.$eval('#favs .card h3', e => e.textContent);
    const q = (first.match(/[A-Za-z]{4,}/) || [first.slice(0, 3)])[0];
    await p.fill('#fq', q); await p.waitForTimeout(600);
    const hs = await p.$$eval('#favs .card', (c, q) => c.map(x => x.textContent.toLowerCase().includes(q.toLowerCase())), q);
    if (!hs.length || hs.length > n0) bad.push(`fav-search ${hs.length}/${n0}`);
    if (!await p.$$eval('#favs .card h3 mark, #favs .card .ex mark', m => m.length)) bad.push('fav-search-marks');
    await p.fill('#fq', 'zzqx不存在的词'); await p.waitForTimeout(600);
    if (await p.$$eval('#favs .card', c => c.length) || !await p.$eval('.empty', e => !e.hidden && e.textContent.includes('没有匹配'))) bad.push('fav-search-empty');
    await p.click('.filters .sx'); await p.waitForTimeout(400); if (await p.$$eval('#favs .card', c => c.length) !== n0) bad.push('fav-search-clear');
    if (shot) await p.screenshot({ path: `${shot}-fav-search-${w}.png` });
    await p.close();
    if (bad.length) { fails++; console.log(`✗ archive/fav interaction ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 往期 month calendar + search (marks, module chips), 收藏 search (390/1440)'); }
// 收藏 timeline (fav_at, migration 0010): 收藏时间 groups by the save day, 发布日期 by edition date; headers count their cards; calendar follows; choice remembered
{ const meta = JSON.parse(await (await fetch(base + 'items.json')).text()), ds = [...new Set(meta.map(m => m.date))].sort(), favs = {};
  const old = meta.filter(m => m.date === ds[0]).slice(0, 2), late = Date.parse(ds[ds.length - 1] + 'T10:00:00') + 0;
  for (const [i, m] of old.entries()) favs[m.id] = { fav: true, vote: 0, updatedAt: late + i, favAt: late + i };
  for (const m of meta.filter(m => m.date === ds[ds.length - 1]).slice(0, 1)) favs[m.id] = { fav: true, vote: 1, updatedAt: late - 5e3, favAt: late - 5e3 };
  for (const w of [390, 1440]) { const bad = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.addInitScript(() => { localStorage.setItem('news-owner', 'test'); if (!sessionStorage.getItem('t0')) { localStorage.removeItem('news-fav-sort'); sessionStorage.setItem('t0', '1'); } });
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: r.request().url().includes('ratings') ? favs : {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'favorites.html?theme=' + themes[0], { waitUntil: 'load' }); await p.waitForTimeout(1200);
    const groups = () => p.evaluate(() => [...document.querySelectorAll('#favs>.fgroup')].map(g => { const cards = []; let n = g.nextElementSibling; while (n && !n.matches('.fgroup')) { cards.push(n.querySelector('.src')?.textContent); n = n.nextElementSibling; }
      return { day: g.dataset.day, n: +g.querySelector('em').textContent.replace(/\D/g, ''), cards }; }));
    let G = await groups(); const last = ds[ds.length - 1];
    if (G.length !== 1 || G[0].day !== last || G[0].n !== 3 || G[0].cards.length !== 3 || !G[0].cards.includes(ds[0])) bad.push('fav-time groups ' + JSON.stringify(G));
    if (await p.$eval('.fsort [data-s="fav"]', e => e.getAttribute('aria-pressed')) !== 'true') bad.push('default-sort');
    await p.click('.fsort [data-s="pub"]'); await p.waitForTimeout(700); G = await groups();
    if (G.length !== 2 || G.some(g => g.cards.some(c => c !== g.day) || g.n !== g.cards.length) || G[0].day !== last) bad.push('pub groups ' + JSON.stringify(G));
    const dots = await p.$$eval('.pcal .cd.has', e => e.map(x => x.dataset.d)); if (!dots.includes(ds[0])) bad.push('pub-cal-dots ' + dots);
    await p.reload(); await p.waitForTimeout(1200); if (await p.$eval('.fsort [data-s="pub"]', e => e.getAttribute('aria-pressed')) !== 'true') bad.push('sort-not-remembered');
    await p.goto('about:blank'); await p.goto(base + 'favorites.html?theme=' + themes[0] + '#pub=' + ds[0], { waitUntil: 'load' }); await p.waitForTimeout(1200); G = await groups();
    if (G.length !== 1 || G[0].day !== ds[0]) bad.push('#pub= ' + JSON.stringify(G));
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push('hscroll');
    if (shot) await p.screenshot({ path: `${shot}-fav-timeline-${w}.png` });
    await p.close(); if (bad.length) { fails++; console.log(`✗ 收藏 timeline ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 收藏 timeline: 收藏时间/发布日期 groups, calendar, remembered, #pub= (390/1440)'); }
// 收藏 · 同时列出 ♥ 点赞的 (elastic switch, default on): liked-only items listed with favs; off → favs only; choice remembered
{ const meta = JSON.parse(await (await fetch(base + 'items.json')).text()), favs = {}; const [f1, l1] = meta.slice(0, 2);
  favs[f1.id] = { fav: true, vote: 0, updatedAt: 2, favAt: 2 }; favs[l1.id] = { fav: false, vote: 1, updatedAt: 1 };
  for (const w of [390, 1440]) { const bad = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.addInitScript(() => { localStorage.setItem('news-owner', 'test'); if (!sessionStorage.getItem('t0')) { localStorage.removeItem('news-fav-liked'); sessionStorage.setItem('t0', '1'); } });
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: r.request().url().includes('ratings') ? favs : {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'favorites.html?theme=' + themes[0], { waitUntil: 'load' }); await p.waitForTimeout(1200);
    const n = () => p.$$eval('#favs .card', e => e.length), sw = () => p.$eval('#withliked', e => e.getAttribute('aria-checked'));
    const R0 = await p.$eval('#withliked', e => { const r = e.getBoundingClientRect(); return { w: r.width, vis: !!e.offsetParent, label: document.getElementById('wlk').textContent }; });
    if (!R0.vis || R0.w < 40 || R0.label !== '同时列出 ♥ 点赞的') bad.push('switch ' + JSON.stringify(R0));
    if (await sw() !== 'true' || await n() !== 2) bad.push(`default ${await sw()} ${await n()}`);
    await p.click('#withliked'); await p.waitForTimeout(700); if (await sw() !== 'false' || await n() !== 1) bad.push(`off ${await sw()} ${await n()}`);
    await p.reload(); await p.waitForTimeout(1200); if (await sw() !== 'false' || await n() !== 1) bad.push('not-remembered');
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push('hscroll');
    await p.close(); if (bad.length) { fails++; console.log(`✗ 收藏 同时列出点赞 ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 收藏 · 同时列出 ♥ 点赞的 switch (default on, off → favs only, remembered; 390/1440)'); }
// desktop avatar menu (DESIGN-RULES §11): top bar shows 最新/往期/收藏 only; menu = 设置 (订阅源/模型/偏好与主题/学到的偏好) + 工具 (垃圾箱/MCP) + 退出 for the owner,
// 偏好与主题 only for guests; opens on click, closes on Esc / outside click, stays inside the viewport
{ for (const w of [1024, 1440]) for (const t of themes) for (const owner of (t === themes[0] ? [true, false] : [true])) { const bad = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    if (owner) await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'index.html?theme=' + t, { waitUntil: 'load' }); await p.waitForTimeout(400);
    const top = await p.evaluate(() => [...document.querySelectorAll('.top .nav > a')].filter(a => a.offsetParent).map(a => a.firstChild.textContent.trim()).join('/'));
    if (top !== (owner ? '最新/往期/收藏' : '最新/往期')) bad.push('top ' + top);
    await p.click('.umenu .avatar'); await p.waitForTimeout(350);
    const m = await p.evaluate(() => { const pop = document.querySelector('.umenu-pop'), r = pop.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      return { open: !pop.hidden, exp: document.querySelector('.umenu .avatar').getAttribute('aria-expanded'), out: r.right > vw + 1 || r.left < 0 || r.bottom > innerHeight,
        items: [...pop.querySelectorAll('a,button')].filter(e => e.offsetParent).map(e => e.childNodes[0].textContent.trim()).join('/') }; });
    const want = owner ? '订阅源/模型/偏好与主题/学到的偏好/垃圾箱/MCP/退出' : '偏好与主题';
    if (!m.open || m.exp !== 'true' || m.out || m.items !== want) bad.push('menu ' + JSON.stringify(m));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); if (!await p.$eval('.umenu-pop', e => e.hidden)) bad.push('esc');
    await p.click('.umenu .avatar'); await p.waitForTimeout(250); await p.mouse.click(40, 600); await p.waitForTimeout(300); if (!await p.$eval('.umenu-pop', e => e.hidden)) bad.push('outside');
    await p.close(); if (bad.length) { fails++; console.log(`✗ avatar menu ${w} ${t} ${owner ? 'owner' : 'guest'}: ${bad.join(' | ')}`); } }
  console.log('✓ avatar menu (top bar 最新/往期/收藏, owner/guest items, Esc/outside close; all themes × 1024/1440)'); }
// 偏好与主题 · 学到的偏好 (owner only, settings.html#learn): rows from /api/learned, 少推/多推 tabs, 撤销 posts {clear, kind, key} and re-renders; guests see the lock note only
{ const T = Date.now(), L = { now: T, boost: [{ key: 'x:@karpathy', s: 1.9, n: 2, c: { fav: 1, like: 1 }, ex: ['nanochat'], effect: 0.152 }, { key: 'kw:very_long_keyword_name_that_should_ellipsis_nicely_in_the_row', s: 0.4, n: 1, c: { like: 1 }, ex: ['x'], effect: 0.032 }],
    penalty: [{ key: 'repo:marclou/mailcheap', s: 1, n: 1, c: { del: 1 }, ex: ['mailcheap'], effect: -0.25 }], cleared: [] };
  for (const w of [390, 1024, 1440]) for (const t of (w === 1024 ? themes : [themes[0]])) for (const owner of w === 1440 ? [true, false] : [true]) {
    const bad = [], posts = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    if (owner) await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => { const u = r.request().url(); if (u.includes('learned')) { if (r.request().method() === 'POST') { const body = JSON.parse(r.request().postData()); posts.push(body);
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...L, boost: L.boost.filter(x => x.key !== body.key), cleared: [{ key: body.key, kind: body.kind, at: T }] }) }); }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(L) }); } return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: T, overrides: {} }) }); });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'settings.html?theme=' + t + '#learn', { waitUntil: 'load' }); await p.waitForTimeout(700);
    const st = await p.evaluate(() => { const vw = document.documentElement.clientWidth, R = e => e.getBoundingClientRect(), out = [];
      const vis = !!document.getElementById('learn').offsetParent, np = document.querySelectorAll('#llist .lp').length;
      document.querySelector('#ldir [data-d="boost"]')?.click(); const nb = document.querySelectorAll('#llist .lp').length;
      for (const li of document.querySelectorAll('#llist .lp')) { const r = R(li); if (r.right > vw + 1) out.push('row-offscreen'); for (const c of li.children) if (R(c).right > R(li).right + 1) out.push('cell-overflow ' + c.className); }
      if (document.documentElement.scrollWidth > vw + 1) out.push('hscroll'); return { vis, nb, np, out }; });
    if (owner ? !(st.vis && st.nb === 2 && st.np === 1) : st.vis) bad.push(`render ${JSON.stringify(st)}`); bad.push(...st.out);
    if (owner) { await p.click('#llist .lundo[data-key="x:@karpathy"]'); await p.waitForTimeout(400);
      if (posts.length !== 1 || posts[0].action !== 'clear' || posts[0].kind !== 'boost' || posts[0].key !== 'x:@karpathy') bad.push('post ' + JSON.stringify(posts));
      if (await p.$$eval('#llist .lundo', e => e.length) !== 1 || await p.$eval('.lcleared', e => e.hidden)) bad.push('after-undo'); }
    if (shot && t === themes[0]) await p.screenshot({ path: `${shot}-prefs-${w}${owner ? '' : '-guest'}.png` });
    await p.close(); if (bad.length) { fails++; console.log(`✗ 偏好 ${w} ${t} ${owner ? 'owner' : 'guest'}: ${[...new Set(bad)].join(' | ')}`); } }
  console.log('✓ 偏好与主题 · 学到的偏好 (owner rows 少推/多推 + 撤销, guest hidden; all themes × 1024)'); }
// 主题 page: one card per dock theme, nothing overflows (every theme × 390/1024/1440); a card switches the theme like the dock;
// 减少动效 switch → html.dd-rm + matchMedia(reduce) true, survives reload, owner POSTs reduce_motion; 偏好 · 模型 card rows fit
{ for (const w of [390, 1024, 1440]) for (const t of themes) { const bad = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'settings.html?theme=' + t + '#theme', { waitUntil: 'load' }); await p.waitForTimeout(400);
    bad.push(...await p.evaluate(() => { const out = [], vw = document.documentElement.clientWidth, R = e => e.getBoundingClientRect();
      const n = document.querySelectorAll('.tgrid .tcard').length, d = document.querySelectorAll('.dock .orb').length; if (!n || n !== d) out.push(`cards ${n}≠${d}`);
      if (!document.querySelector('.tcard.on')) out.push('no-current');
      for (const c of document.querySelectorAll('.tcard')) { const r = R(c); if (r.right > vw + 1 || r.left < -1) out.push('card-offscreen'); for (const e of c.querySelectorAll('.tc-n,.tc-m,.tc-tags')) if (R(e).right > r.right + 1) out.push('text-overflow'); }
      const sw = R(document.querySelector('#rmsw')); if (sw.right > vw || sw.width < 44) out.push('switch');
      if (document.documentElement.scrollWidth > vw + 1) out.push('hscroll'); return out; }));
    await p.close(); if (bad.length) { fails++; console.log(`✗ 主题页 ${w} ${t}: ${[...new Set(bad)].join(' | ')}`); } }
  { const bad = [], posts = [], p = await b.newPage({ viewport: { width: 1024, height: 900 } });
    await p.addInitScript(() => { localStorage.setItem('news-owner', 'test'); if (!sessionStorage.getItem('rm-init')) { localStorage.removeItem('news-rm'); sessionStorage.setItem('rm-init', '1'); } });
    await p.route(/\/api\//, r => { if (r.request().url().includes('prefs') && r.request().method() === 'POST') posts.push(JSON.parse(r.request().postData()));
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {}, theme_favs: [], theme_default: null, hero: null, reduce_motion: null }) }); });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'settings.html?theme=' + themes[0] + '#theme', { waitUntil: 'load' }); await p.waitForTimeout(400);
    const other = themes.find(x => x !== themes[0]); await p.click(`.tcard [data-pick="${other}"]`); await p.waitForTimeout(900);
    if (await p.evaluate(() => document.body.dataset.theme) !== other || !await p.$(`.tcard.on [data-pick="${other}"]`)) bad.push('pick');
    await p.click('#rmsw'); await p.waitForTimeout(300);
    const st = () => p.evaluate(() => ({ cls: document.documentElement.classList.contains('dd-rm'), mm: matchMedia('(prefers-reduced-motion: reduce)').matches, sw: document.querySelector('#rmsw')?.getAttribute('aria-checked'),
      tr: getComputedStyle(document.body).transitionDuration }));
    let s1 = await st(); if (!s1.cls || !s1.mm || s1.sw !== 'true') bad.push('rm-on ' + JSON.stringify(s1));
    if (!posts.some(x => x.reduce_motion === true)) bad.push('rm-post ' + JSON.stringify(posts));
    await p.goto(base + 'index.html', { waitUntil: 'load' }); await p.waitForTimeout(300); s1 = await st(); if (!s1.cls || !s1.mm) bad.push('rm-persist');
    await p.goto(base + 'settings.html#theme', { waitUntil: 'load' }); await p.waitForTimeout(300); await p.click('#rmsw'); await p.waitForTimeout(300); s1 = await st(); if (s1.cls || s1.sw !== 'false') bad.push('rm-off');
    if (shot) await p.screenshot({ path: `${shot}-themes-1024.png` });
    for (const w of [390, 1440]) { await p.setViewportSize({ width: w, height: 900 }); await p.goto(base + 'models.html', { waitUntil: 'load' }); await p.waitForTimeout(300);
      bad.push(...await p.evaluate(() => { const out = [], vw = document.documentElement.clientWidth, sec = document.querySelector('.cmain'); if (!sec || !document.querySelector('.prov-list')?.offsetParent || !document.querySelector('.failover')?.offsetParent) return ['no-model-page'];
        for (const li of sec.querySelectorAll('.prov-list li, .lmodel li')) for (const c of li.children) if (c.getBoundingClientRect().right > li.getBoundingClientRect().right + 1) out.push('model-overflow ' + c.className);
        if (document.documentElement.scrollWidth > vw + 1) out.push('hscroll'); return out; })); }
    await p.close(); if (bad.length) { fails++; console.log(`✗ 主题页 交互: ${[...new Set(bad)].join(' | ')}`); } }
  console.log('✓ 主题页 (cards × all themes × 3 widths, pick, 减少动效 on/persist/off/owner sync) + 模型 page'); }
// 信息源 · per-source weight: config default shown (StableDiffusion +1), change → saved as config.weights override; back to default → override dropped
{ const defaults = JSON.parse(await readFile(new URL('../config/collect-sources.json', import.meta.url), 'utf8'));
  for (const w of [390, 1440]) { const bad = [], posts = [], p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    const cfg = { disabled: [], removed: [], rsshub: [], x_keywords: [], x_accounts: [{ handle: 'karpathy', enabled: true, from: 'manual', group: '英文区' }], feeds: [], subreddits: [], hf_orgs: [], weights: { 'xa:karpathy': 1 } };
    await p.route(/\/api\//, r => { if (r.request().url().includes('sources')) { if (r.request().method() === 'POST') { const b2 = JSON.parse(r.request().postData()); posts.push(b2); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, config: b2.config }) }); }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ defaults, config: cfg, status: null }) }); } return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {} }) }); });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'sources.html?theme=' + themes[0], { waitUntil: 'load' }); await p.waitForTimeout(800);
    const sd = (defaults.reddit?.feeds || []).find(f => f.weight), other = (defaults.reddit?.feeds || []).find(f => !f.weight);
    const v = sel => p.$eval(sel, e => e.value).catch(() => null);
    if (await v('select[data-w="xa:karpathy"]') !== '1') bad.push('x-weight');
    await p.selectOption('select[data-w="xa:karpathy"]', '0'); await p.click('.sx-cats [data-c="reddit"]'); await p.waitForTimeout(200);
    if (sd && await v(`select[data-w="reddit:${sd.subreddit.toLowerCase()}"]`) !== String(sd.weight)) bad.push('default-weight-not-shown');
    if (other) { await p.selectOption(`select[data-w="reddit:${other.subreddit.toLowerCase()}"]`, '2'); }
    if (sd) await p.selectOption(`select[data-w="reddit:${sd.subreddit.toLowerCase()}"]`, String(sd.weight));   // same as default → no override
    await p.click('#save'); await p.waitForTimeout(400);
    const W = posts[0]?.config?.weights || null, want = { ...(other ? { [`reddit:${other.subreddit.toLowerCase()}`]: 2 } : {}) };
    if (!W || JSON.stringify(W) !== JSON.stringify(want)) bad.push('saved ' + JSON.stringify(W) + ' want ' + JSON.stringify(want));
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push('hscroll');
    if (shot) await p.screenshot({ path: `${shot}-sources-weight-${w}.png`, fullPage: true });
    await p.close(); if (bad.length) { fails++; console.log(`✗ 信息源 weight ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 信息源 per-source weight (default shown, override saved, default → no override)'); }
// 垃圾箱 · 永久删除 / 清空: inline two-step confirm (no native dialog); purged rows leave 已删除 + the count but keep teaching 少推
{ for (const w of [390, 1440]) { const bad = [], posts = [], p = await b.newPage({ viewport: { width: w, height: 900 } }), T = Date.now(), H = n => 'sha256:' + String(n).repeat(64);
    p.on('dialog', d => { bad.push('native-dialog ' + d.type()); d.dismiss(); });
    await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    const D = { [H(1)]: { status: 'trashed', trashed_at: T - 9e5, deleted_at: T - 2e6, expires_at: T - 9e5, clicks: 5, snapshot: { title: '一号垃圾', keys: ['x:@spam'] }, updated_at: T },
      [H(2)]: { status: 'trashed', trashed_at: T - 8e5, deleted_at: T - 2e6, expires_at: T - 8e5, clicks: 5, snapshot: { title: '二号垃圾', keys: ['repo:a/b'] }, updated_at: T },
      [H(3)]: { status: 'trashed', trashed_at: T - 7e5, deleted_at: T - 2e6, expires_at: T - 7e5, clicks: 5, purged_at: T - 1e5, snapshot: { title: '早就永久删除', keys: ['x:@oldspam'] }, updated_at: T },
      [H(4)]: { status: 'pending', deleted_at: T, expires_at: T + 36e5, clicks: 1, snapshot: { title: '倒计时' }, updated_at: T } };
    await p.route(/\/api\//, r => { const u = r.request().url(); if (u.includes('deletions')) { if (r.request().method() === 'POST') { const q = JSON.parse(r.request().postData()); posts.push(q);
        if (q.action === 'purge') { D[q.id] = { ...D[q.id], purged_at: Date.now() }; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: Date.now(), item: D[q.id] }) }); }
        if (q.action === 'purge_all') { const items = {}; for (const [k, v] of Object.entries(D)) if (v.status === 'trashed' && !v.purged_at) items[k] = D[k] = { ...v, purged_at: Date.now() }; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: Date.now(), items, purged: Object.keys(items).length }) }); } }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: Date.now(), items: D, overrides: {} }) }); }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: 0, overrides: {} }) }); });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + 'trash.html?theme=' + themes[0], { waitUntil: 'load' }); await p.waitForTimeout(900);
    const st = () => p.evaluate(() => ({ n: document.querySelectorAll('#trashed [data-del-id]').length, titles: [...document.querySelectorAll('#trashed h3')].map(h => h.textContent).join('/'),
      clr: document.getElementById('tclear').hidden ? null : document.getElementById('tclear').textContent.trim(), pen: [...document.querySelectorAll('#penalties code')].map(c => c.title).sort().join(','),
      cnt: document.querySelector('.trashcount')?.dataset.n, pend: document.querySelectorAll('#pending [data-del-id]').length }));
    let s1 = await st();
    if (s1.n !== 2 || /早就/.test(s1.titles) || s1.pend !== 1 || s1.clr !== '清空 2 条' || s1.cnt !== '2' || !s1.pen.includes('x:@oldspam')) bad.push('initial ' + JSON.stringify(s1));
    const one = `#trashed [data-del-id="${H(1)}"] .purge`;
    await p.click(one); await p.waitForTimeout(150);
    if (posts.length || !await p.$eval(one, e => e.classList.contains('ask') && /确认/.test(e.textContent))) bad.push('arm ' + JSON.stringify(posts));
    await p.click(`#trashed [data-del-id="${H(1)}"] .tno`); await p.waitForTimeout(100); if (await p.$eval(one, e => e.classList.contains('ask'))) bad.push('cancel');
    await p.click(one); await p.click(one); await p.waitForTimeout(400); s1 = await st();
    if (posts.length !== 1 || posts[0].action !== 'purge' || posts[0].id !== H(1) || s1.n !== 1 || s1.cnt !== '1' || s1.clr !== '清空 1 条') bad.push('purge ' + JSON.stringify({ posts, s1 }));
    if (!s1.pen.includes('x:@spam')) bad.push('purged item stopped teaching 少推 ' + s1.pen);
    await p.click('#tclear'); await p.waitForTimeout(150); if (posts.length !== 1 || !/确认清空 1 条/.test(await p.$eval('#tclear', e => e.textContent))) bad.push('clear-arm');
    await p.click('#tclear'); await p.waitForTimeout(400); s1 = await st();
    if (posts.at(-1)?.action !== 'purge_all' || s1.n !== 0 || s1.clr !== null || s1.pend !== 1 || s1.cnt !== '0' || !/永久删除/.test(await p.$eval('#tmsg', e => e.textContent))) bad.push('clear ' + JSON.stringify({ posts, s1 }));
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push('hscroll');
    if (shot) await p.screenshot({ path: `${shot}-trash-purged-${w}.png`, fullPage: true });
    await p.close(); if (bad.length) { fails++; console.log(`✗ 垃圾箱 永久删除 ${w}: ${bad.join(' | ')}`); } }
  console.log('✓ 垃圾箱 永久删除 / 清空 (inline confirm, no native dialog, purged leave list + count, 少推 kept; 390/1440)'); }
// hero (DESIGN-RULES §5/§8): calendar digits stay inside .ical and never touch .proof / .hero-art; hero-art as tall as hero-main on desktop;
// latest-run stat only when non-zero (no 待抓取 copy); mini-card ✓ clear of its thumbnail; every registered hero widget mounts inside its slot.
{ const heroChk = (want) => { const vw = document.documentElement.clientWidth, out = [], R = e => e && e.getBoundingClientRect();
    const ov = (a, c) => a && c && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
    let g = null; for (const e of document.querySelectorAll('.ical .roll .rl.f .rc')) { const q = e.getBoundingClientRect(); if (!q.width) continue;
      g = g ? { left: Math.min(g.left, q.left), top: Math.min(g.top, q.top), right: Math.max(g.right, q.right), bottom: Math.max(g.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom }; }
    const ical = R(document.querySelector('.ical')), proof = R(document.querySelector('.hero .proof')), art = R(document.querySelector('.hero-art')), main = R(document.querySelector('.hero-main'));
    if (!g) out.push('no-digits'); else {
      if (g.left < ical.left - 1 || g.right > ical.right + 1 || g.top < ical.top - 1) out.push(`digits-outside-ical ${Math.round(g.left - ical.left)},${Math.round(ical.right - g.right)},${Math.round(g.top - ical.top)}`);
      if (ov(g, proof)) out.push('digits×proof'); if (ov(g, art)) out.push('digits×hero-art'); }
    if (art && ov(ical, art)) out.push('ical×hero-art');
    if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`);
    if (art && vw > 860 && Math.abs(art.height - main.height) > 2) out.push(`art-height ${Math.round(art.height)}≠${Math.round(main.height)}`);
    if (/待抓取/.test(document.querySelector('.hero').textContent)) out.push('robotic-copy');
    const pmc = document.querySelector('.proof .pmstat b'); if (pmc && pmc.textContent.trim() === '0') out.push('zero-run-stat');
    if (document.querySelector('.seenwk,#seenweek')) out.push('本周看过-still-present');
    const el = document.querySelector('[data-slot="hero"]');
    if (el) { if (want && el.dataset.hero !== want) out.push(`hero=${el.dataset.hero}≠${want}`);
      for (const c of el.querySelectorAll('.st,.fc')) { const q = c.getBoundingClientRect(); if (q.left < art.left - 4 || q.right > art.right + 4 || q.right > vw + 1) out.push(`widget-outside-slot ${c.className}`); } }
    for (const c of document.querySelectorAll('main .card.mini')) { const rd = c.querySelector(':scope > .rd'), pic = c.querySelector('.pic'); if (rd && pic && rd.offsetParent && pic.offsetParent && ov(R(rd), R(pic))) out.push('mini ✓×thumb'); }
    return [...new Set(out)].slice(0, 5); };
  const run = async (w, t, hero) => { const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + (base.includes('?') ? '&' : '?') + 'theme=' + t + (hero ? '&hero=' + hero : ''), { waitUntil: 'load' });
    await p.waitForFunction(() => !document.querySelector('[data-slot="hero"]') || document.querySelector('[data-slot="hero"]').dataset.hero, null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(900); const bad = await p.evaluate(heroChk, hero || 'story');
    if (bad.length) { fails++; console.log(`✗ hero ${hero || 'default'} ${w} ${t}: ${bad.join(' | ')}`); }
    await p.close(); };
  for (const w of [360, 390, 1024, 1440]) for (const t of themes) await run(w, t);
  const H = await (async () => { const p = await b.newPage(); await p.goto(base, { waitUntil: 'load' }); const j = await p.evaluate(() => JSON.parse(document.getElementById('hero-data')?.textContent || '{}')); await p.close(); return j; })();
  const widgets = Object.keys(H.widgets || {}).filter(n => n !== 'slot');
  if (!widgets.includes('story') || !widgets.includes('fan')) { fails++; console.log(`✗ hero registry: ${widgets.join(',')}`); }
  for (const name of widgets) for (const w of [390, 1440]) for (const t of themes) await run(w, t, name);
  console.log(`✓ hero check done (${themes.length} themes × 360/390/1024/1440; widgets ${widgets.join('/')} × 390/1440)`); }

// v3.5.7: media never in mini (video/gallery); delete under + island
{ const mediaMini = async (w, t) => {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + (base.includes('?') ? '&' : '?') + 'theme=' + t, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    // force owner so shelf/reflow runs
    await p.evaluate(() => document.body.classList.add('owner'));
    await p.waitForTimeout(500);
    const bad = await p.evaluate(() => {
      const out = [];
      for (const c of document.querySelectorAll('main .card.mini')) {
        if (c.querySelector(':scope > .pic.vid')) out.push('video-in-mini:' + (c.dataset.id || '').slice(0, 12));
        if (c.querySelector(':scope > .gal')) out.push('gal-in-mini:' + (c.dataset.id || '').slice(0, 12));
      }
      for (const c of document.querySelectorAll('main .ed-lead .card.feature.noimg')) {
        if (c.querySelector(':scope > .pic:not(.logo), :scope > .gal')) out.push('lead-noimg-but-has-media');
      }
      // face must not show a visible ✕ delete; it lives under +
      for (const d of document.querySelectorAll('main .card .acts > .del')) {
        const st = getComputedStyle(d); if (st.display !== 'none' && st.visibility !== 'hidden' && d.offsetParent) out.push('del-visible-on-face');
      }
      return [...new Set(out)].slice(0, 6);
    });
    // tuck a lead with media and ensure a video still doesn't become mini
    const tuckBad = await p.evaluate(() => {
      const out = [];
      const lead = document.querySelector('main .ed-lead .card');
      if (lead) lead.classList.add('read');
      return out;
    });
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => {
      const out = [];
      for (const c of document.querySelectorAll('main .card.mini')) {
        if (c.querySelector(':scope > .pic.vid')) out.push('video-in-mini-after-tuck');
        if (c.querySelector(':scope > .gal')) out.push('gal-in-mini-after-tuck');
      }
      return out;
    });
    const all = [...bad, ...after];
    if (all.length) { fails++; console.log(`✗ media-slot ${w} ${t}: ${all.join(' | ')}`); }
    await p.close();
  };
  for (const w of [1440, 390]) for (const t of themes) await mediaMini(w, t);
  console.log('✓ media-aware slots (no video/gallery in mini; lead noimg fix; del off face)'); }

// card meta row (10-21 fix): 新增 badge · source · time · ♥ · rank never squeeze each other on any card size (lead/side/grid/mini/peek):
// no item overlaps another, nothing but the source wraps or shrinks (time single-line), the source is never cut below min(its width, 8em, row width)
{ const metaChk = () => { const R = e => e.getBoundingClientRect(), out = [];
    for (const m of document.querySelectorAll('main .card .meta')) { if (!m.offsetParent || !R(m).width) continue; const c = m.closest('.card'), id = (c.className.match(/\b(lead|mini|feature|peek|wide)\b/g) || ['grid']).join('+');
      const src = m.querySelector(':scope > .src'), kids = [...m.children].filter(e => R(e).width > 0 && getComputedStyle(e).display !== 'none'), em = parseFloat(getComputedStyle(m).fontSize);
      if (src) { const sw = R(src).width, need = Math.min(src.scrollWidth, 8 * em, R(m).width); if (sw + 1 < need) out.push(`${id} src ${Math.round(sw)}<${Math.round(need)} "${src.textContent.trim().slice(0, 18)}"`); }
      for (const k of kids) { if (k === src) continue; const r = R(k); if (r.height > em * 2.4) out.push(`${id} wrap "${k.textContent.trim().slice(0, 12)}" h${Math.round(r.height)}`); if (k.scrollWidth > k.clientWidth + 1 && getComputedStyle(k).overflow !== 'visible') out.push(`${id} clipped "${k.textContent.trim().slice(0, 12)}"`); }
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = R(kids[i]), z = R(kids[j]); if (Math.min(a.right, z.right) - Math.max(a.left, z.left) > 1 && Math.min(a.bottom, z.bottom) - Math.max(a.top, z.top) > 1) out.push(`${id} overlap "${kids[i].textContent.trim().slice(0, 8)}"×"${kids[j].textContent.trim().slice(0, 8)}"`); }
      for (const k of kids) if (R(k).right > R(c).right + 1) out.push(`${id} out-of-card "${k.textContent.trim().slice(0, 10)}"`); }
    return out; };
  for (const w of [320, 390, 1024, 1440]) for (const t of themes) { const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: Date.now(), overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + '?theme=' + t, { waitUntil: 'load' }); await p.waitForTimeout(300);
    // worst case on any edition: every card carries the 20:00 新增 badge (incremental days like 2026-10-21 do)
    await p.evaluate(() => { for (const m of document.querySelectorAll('main .card .meta')) if (!m.querySelector('.new')) m.insertAdjacentHTML('afterbegin', '<span class="new">20:00 新增</span>'); });
    let bad = await p.evaluate(metaChk);
    if (w >= 1024) for (const id of await p.$$eval('.ed-side .card.mini > .pic .pk', e => e.slice(0, 2).map(x => x.closest('.card').dataset.id))) { await p.$eval(`.card[data-id="${id}"] .pk`, e => e.click()); await p.waitForTimeout(450); bad.push(...(await p.evaluate(metaChk)).map(x => 'peek ' + x)); }
    bad = [...new Set(bad)]; if (bad.length) { fails++; console.log(`✗ card meta ${w} ${t}: ${bad.slice(0, 5).join(' | ')}`); }
    await p.close(); }
  console.log(`✓ card meta row (${themes.length} themes × 320/390/1024/1440, lead/side/grid/mini/peek, 新增 badge): no overlap, time one line, source readable`); }
// v3.6 desktop peek (no fullscreen): a side row's picture opens in place at column width; one per section; the side column never
// outgrows the lead (capped, or promoted to a wide grid card); auto-open ≤1 per section. Every theme × 1024/1440.
{ const peekChk = () => { const out = [], R = e => e.getBoundingClientRect();
    for (const ed of document.querySelectorAll('.ed')) { if (ed.hidden) continue; const L = ed.querySelector('.ed-lead'), S = ed.querySelector('.ed-side'), m = ed.closest('.module');
      if (m.querySelectorAll('.card.peek').length > 1) out.push('two-peeks');
      if (!S.hidden && !L.hidden && !ed.classList.contains('nolead')) { const lc = L.querySelector('.card'); const la = L.style.alignSelf, lh = lc.style.height; L.style.alignSelf = 'start'; lc.style.height = 'auto'; const nat = R(L).height; L.style.alignSelf = la; lc.style.height = lh;
        if (S.querySelector('.card.peek') && R(S).height > nat + 2) out.push(`side>lead ${Math.round(R(S).height)}>${Math.round(nat)}`); }
      for (const c of m.querySelectorAll('.card.peek')) { const pic = c.querySelector(':scope > .pic'), cr = R(c), pr = R(pic); if (pr.width < cr.width * .6 && c.classList.contains('mini')) out.push(`peek-narrow ${Math.round(pr.width)}/${Math.round(cr.width)}`); if (pr.height < 150) out.push('peek-short'); }
    }
    if (document.querySelector('.dd-backdrop,.dd-focused,main .card .focus')) out.push('fullscreen-left');
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('hscroll');
    return out; };
  let tried = 0, promoted = 0, autos = 0;
  const PNG = await readFile(new URL('../site/brand/og.png', import.meta.url));  // stand-in for remote pictures (offline test)
  for (const w of [1024, 1440]) for (const t of themes) { const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (!base.startsWith('http://127') ? r.continue() : r.request().resourceType() === 'image' ? r.fulfill({ contentType: 'image/png', body: PNG }) : r.abort()));
    await p.goto(base + '?theme=' + t, { waitUntil: 'load' }); await p.waitForTimeout(300);
    autos += await p.$$eval('.card.peek', e => e.length);
    let bad = await p.evaluate(peekChk);
    const pks = await p.$$eval('.ed-side .card.mini > .pic .pk', e => e.map(x => x.closest('.card').dataset.id));
    for (const id of pks.slice(0, 3)) { tried++;
      const was = await p.$eval(`.card[data-id="${id}"]`, c => c.classList.contains('peek'));
      await p.$eval(`.card[data-id="${id}"] .pk`, e => e.click()); await p.waitForTimeout(450);
      const now = await p.$eval(`.card[data-id="${id}"]`, c => [c.classList.contains('peek'), c.classList.contains('promoted')]);
      if (now[0] === was) bad.push('toggle-failed'); if (now[1]) promoted++;
      bad.push(...await p.evaluate(peekChk));
      if (shot && t === themes[0] && w === 1440 && !was && id === pks[0]) await p.$eval(`.card[data-id="${id}"]`, c => c.closest('.module').scrollIntoView()), await p.screenshot({ path: `${shot}-peek-${w}.png` });
      if (now[0]) { await p.$eval(`.card[data-id="${id}"] .pk`, e => e.click()); await p.waitForTimeout(400); if (await p.$eval(`.card[data-id="${id}"]`, c => c.classList.contains('peek'))) bad.push('close-failed'); }
    }
    if (bad.length) { fails++; console.log(`✗ peek ${w} ${t}: ${[...new Set(bad)].join(' | ')}`); }
    await p.close(); }
  console.log(`✓ peek check done (${themes.length} themes × 1024/1440; ${tried} toggles, ${promoted} promoted to wide, ${autos} auto-opened)`); }

// v3.6.1 phone nav (DESIGN-RULES §11): top bar = logo + wordmark + theme orb; bottom floating tab bar. 15 themes × 320/360/390/430 × owner/guest:
// nothing overflows, labels not clipped, guest sees 最新/往期 only, owner reaches 收藏 + 更多 (垃圾箱/订阅源/模型/偏好与主题/MCP/同步/退出), toasts clear the bar, page end clear.
{ const navChk = ({ owner, page }) => { const vw = document.documentElement.clientWidth, out = [], R = e => e.getBoundingClientRect(), vis = e => !!e && getComputedStyle(e).display !== 'none' && R(e).width > 0;
    const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}>${vw}`);
    const top = document.querySelector('.top .wrap'); for (const e of top.querySelectorAll('.logo, .word, .tsw > .orb.cur')) { const r = R(e); if (!r.width) out.push('top-missing ' + e.className); else if (r.right > vw + 0.5 || r.left < -0.5) out.push('top-overflow ' + e.className); }
    if (vis(document.querySelector('.top .nav'))) out.push('top-nav-visible'); if (R(top).height > 64) out.push('top-tall ' + Math.round(R(top).height));
    const lg = R(document.querySelector('.top .logo')), orb = R(document.querySelector('.tsw > .orb.cur')); if (ov(lg, orb)) out.push('logo×orb');
    const tb = document.querySelector('.tabbar'); if (!vis(tb)) return ['no-tabbar']; const B = R(tb);
    if (B.left < 4 || B.right > vw - 4 || B.bottom > innerHeight) out.push(`tabbar-overflow ${Math.round(B.left)}..${Math.round(B.right)}/${vw}`);
    const tabs = [...tb.querySelectorAll('.tab')].filter(vis), names = tabs.map(t => t.querySelector('span').textContent).join('/');
    if (names !== (owner ? '最新/往期/收藏/更多' : '最新/往期')) out.push('tabs ' + names);
    for (const t of tabs) { const r = R(t), sp = t.querySelector('span'); if (r.height < 44 || r.width < 44) out.push('tab-small ' + sp.textContent); if (sp.scrollWidth > sp.clientWidth + 1 || R(sp).right > r.right + 1 || R(sp).left < r.left - 1) out.push('label-clipped ' + sp.textContent); if (r.right > B.right + 1) out.push('tab-out ' + sp.textContent);
      const cs = getComputedStyle(t); if (cs.color === getComputedStyle(tb).backgroundColor) out.push('tab-invisible'); }
    const want = { latest: '最新', day: '往期', archive: '往期', favorites: '收藏' }[page], cur = tabs.filter(t => t.matches('[aria-current],.on')).map(t => t.querySelector('span').textContent);
    if (want && (owner || !['收藏', '垃圾箱'].includes(want)) && cur.join() !== want) out.push(`active ${cur.join()}≠${want}`);
    if (['sources', 'mcp', 'settings', 'models', 'trash'].includes(page) && owner && cur.join() !== '更多') out.push('active-more ' + cur.join());
    for (const b of tb.querySelectorAll('.bdg')) if (vis(b) && (R(b).right > vw || R(b).top < B.top - 12)) out.push('badge-out');
    // a toast (已收起 · 撤销 / 已记下：少推这类 · 撤销 / countdown copy) never sits on the bar
    for (const cls of ['rtoast', 'ntoast in']) { const t = document.createElement('div'); t.className = cls; t.innerHTML = '<span>已记下：少推这类</span><button type="button">撤销</button>'; document.body.append(t); if (ov(R(t), B)) out.push('toast×bar ' + cls); t.remove(); }
    return out; };
  const run = async (w, t, owner, page = '', extra) => { const ctx = await b.newContext({ viewport: { width: w, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); const p = await ctx.newPage();
    if (owner) await p.addInitScript(() => localStorage.setItem('news-owner', 'test'));
    await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: {}, now: Date.now(), overrides: {} }) }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (base.startsWith('http://127') ? r.abort() : r.continue()));
    await p.goto(base + page + '?theme=' + t, { waitUntil: 'load' }); await p.waitForTimeout(250);
    const kind = { '': 'latest', 'archive.html': 'archive', 'favorites.html': 'favorites', 'trash.html': 'trash', 'sources.html': 'sources', 'mcp-admin.html': 'mcp', 'settings.html': 'settings', 'models.html': 'models' }[page] ?? 'day';
    const bad = await p.evaluate(navChk, { owner, page: kind });
    if (owner && !bad.includes('no-tabbar')) { // 更多 sheet: every owner entry reachable, inside the viewport, sync status in words
      await p.click('.tabbar .more'); await p.waitForTimeout(320);
      bad.push(...await p.evaluate(() => { const out = [], sh = document.querySelector('.msheet'), vw = document.documentElement.clientWidth; if (!sh || sh.hidden || getComputedStyle(sh).display === 'none') return ['sheet-closed'];
        const rows = [...sh.querySelectorAll('.mrow')].map(r => [r.textContent.trim(), r.getBoundingClientRect()]); const names = rows.map(r => r[0]).join('/');
        if (!/^垃圾箱\d*\/订阅源\/模型\/偏好与主题\/MCP\/(已同步 · 刚刚|离线，仅存本机|未同步)\/退出$/.test(names)) out.push('sheet ' + names);
        for (const [n, r] of rows) if (r.left < 0 || r.right > vw || r.top < 0 || r.bottom > innerHeight || r.height < 44) out.push('row-out ' + n);
        const s = sh.getBoundingClientRect(), tb = document.querySelector('.tabbar').getBoundingClientRect(); if (s.bottom > tb.top + 1) out.push('sheet×bar');
        const hit = (n, sel) => { const e = sh.querySelector(sel), r = e.getBoundingClientRect(), x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!e.contains(x)) out.push('row-covered ' + n); };
        hit('垃圾箱', 'a[href$="trash.html"]'); hit('订阅源', 'a[href$="sources.html"]'); hit('模型', 'a[href$="models.html"]'); hit('偏好与主题', 'a[href$="settings.html"]'); hit('MCP', 'a[href$="mcp-admin.html"]'); hit('退出', '.exit'); return out; }));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150); if (await p.$eval('.msheet', e => !e.hidden)) bad.push('esc-no-close'); }
    if (extra) bad.push(...await extra(p));
    if (bad.length) { fails++; console.log(`✗ nav ${page || 'index'} ${w} ${t} ${owner ? 'owner' : 'guest'}: ${[...new Set(bad)].slice(0, 5).join(' | ')}`); }
    await ctx.close(); };
  for (const w of [320, 360, 390, 430]) for (const t of themes) for (const owner of [true, false]) await run(w, t, owner);
  const day = await (async () => { const p = await b.newPage(); await p.goto(base + 'archive.html'); const h = await p.$eval('.days .day', a => a.getAttribute('href')).catch(() => ''); await p.close(); return h; })();
  for (const pg of ['archive.html', 'favorites.html', 'trash.html', 'sources.html', 'models.html', 'settings.html', 'mcp-admin.html', day].filter(Boolean)) for (const w of [320, 390]) for (const owner of [true, false]) await run(w, themes[0], owner, pg);
  // scroll: hides going down, back going up and at the end; page end (footer) never under the bar
  await run(390, themes[0], true, '', async p => { const out = [], hid = () => p.evaluate(() => document.body.classList.contains('tb-hide'));
    await p.evaluate(() => scrollTo(0, 400)); await p.waitForTimeout(80); await p.mouse.wheel(0, 300); await p.waitForTimeout(200); if (!await hid()) out.push('no-hide-on-down');
    await p.mouse.wheel(0, -120); await p.waitForTimeout(200); if (await hid()) out.push('no-show-on-up');
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(350); if (await hid()) out.push('hidden-at-end');
    const gap = await p.evaluate(() => { const f = [...document.querySelectorAll('footer .wrap > *')].pop().getBoundingClientRect(); return document.querySelector('.tabbar').getBoundingClientRect().top - f.bottom; }); if (gap < 4) out.push('footer-under-bar ' + Math.round(gap));
    return out; });
  // desktop untouched: no tab bar, top nav visible
  { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(base, { waitUntil: 'load' });
    if (await p.$eval('.tabbar', e => getComputedStyle(e).display !== 'none') || !await p.$eval('.top .nav', e => e.offsetParent !== null)) { fails++; console.log('✗ nav desktop: tab bar shown or top nav hidden'); } await p.close(); }
  console.log(`✓ nav check done (${themes.length} themes × 320/360/390/430 × owner/guest; pages × 320/390)`); }

await b.close(); srv?.close();
console.log(fails ? `mobile-layout: ${fails} 组失败` : `mobile-layout: ${themes.length} 主题 × 4 宽度全部通过`);
process.exit(fails ? 1 : 0);
