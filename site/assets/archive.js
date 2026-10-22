// 往期 page (assets/archive.js; DESIGN-RULES §5). One calendar: the big month grid (public). A cell = bold day number + item count, tinted by count;
// owner-only bookmark mark on days with 收藏. Picking a day fills the panel: owner → that day's 收藏 first; everyone → top headlines (→ originals);
// then 打开当日日报. Picking the selected day again opens it. 月历 ⇄ 列表 (remembered); the date list is also the no-JS fallback.
(() => {
  const dj = document.getElementById('arch-data'), sec = document.querySelector('.amonth'); if (!dj || !sec) return;
  const A = JSON.parse(dj.textContent || '{}'), DAYS = A.days || {}, dates = Object.keys(DAYS).sort(); if (!dates.length) return;
  const ROOT = document.body.dataset.root || '', path = d => `${ROOT}${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.html`;
  const MOD = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻', prompts: '今日提示词' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const grid = sec.querySelector('.am-grid'), panel = sec.querySelector('.apanel'), list = document.querySelector('.days'), seg = document.querySelector('.aview');
  const owner = () => !!(window.NEWS && NEWS.owner && NEWS.owner()), S = () => (window.NEWS && NEWS.state) || {};
  const hash = (location.hash.match(/^#d=(\d{4}-\d{2}-\d{2})$/) || [])[1];
  let sel = DAYS[hash] ? hash : (DAYS[A.cur] ? A.cur : dates[dates.length - 1]), ym = sel.slice(0, 7), items = null, VK = 'news-archive-view';
  const max = Math.max(...dates.map(d => DAYS[d].n || 0), 1), months = [...new Set(dates.map(d => d.slice(0, 7)))];
  // owner: items.json gives each 收藏's title / url / date (guests never load it here)
  const loadItems = () => items || (items = fetch(ROOT + 'items.json').then(r => r.json()).catch(() => { items = null; return []; }));
  let favBy = {}; const favIndex = async () => { if (!owner()) { favBy = {}; return; } const all = await loadItems(), st = S(); favBy = {};
    for (const m of all) { const s = st[m.id]; if (s && (s.fav || s.vote > 0)) (favBy[m.date] ||= []).push({ ...m, fav: !!s.fav, like: s.vote > 0 }); } };
  const WD = '一二三四五六日', FAVMAX = 5;
  function drawGrid() {
    const [y, m] = ym.split('-').map(Number), first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
    sec.querySelector('.am-m').textContent = String(m); sec.querySelector('.am-y').innerHTML = `月<br>${y}`;
    // ‹ › only when editions span more than one month; the ends are disabled (first / last month with editions)
    const i = months.indexOf(ym), nv = sec.querySelector('.am-navs'); nv.hidden = months.length < 2;
    for (const [st, off] of [['-1', i <= 0], ['1', i < 0 || i >= months.length - 1]]) { const b = nv.querySelector(`[data-step="${st}"]`); b.disabled = off; b.title = off ? (st < 0 ? '没有更早的月份' : '没有更晚的月份') : (st < 0 ? '上个月' : '下个月'); }
    let h = WD.split('').map(w => `<span class="am-wd" role="columnheader">${w}</span>`).join('') + '<span class="am-pad"></span>'.repeat(off);
    for (let d = 1; d <= n; d++) { const k = `${ym}-${String(d).padStart(2, '0')}`, x = DAYS[k];
      if (!x) { h += `<span class="am-d off" aria-hidden="true"><b>${d}</b></span>`; continue; }
      const fv = (favBy[k] || []).filter(f => f.fav).length, on = k === sel;
      h += `<button type="button" class="am-d has${on ? ' sel' : ''}" data-d="${k}" style="--h:${(0.25 + 0.75 * (x.n / max)).toFixed(2)}" tabindex="${on ? 0 : -1}" aria-pressed="${on}" aria-label="${m} 月 ${d} 日，${x.n} 条${fv ? `，${fv} 个收藏` : ''}${on ? '（再点一次打开）' : ''}"><b>${d}</b><em>${x.n}<small>条</small></em>${fv ? '<i class="fv" aria-hidden="true"></i>' : ''}</button>`; }
    grid.innerHTML = h; if (!grid.querySelector('[tabindex="0"]')) grid.querySelector('.am-d.has')?.setAttribute('tabindex', '0');
  }
  const li = (m, extra = '') => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a><small>${extra}${esc(MOD[m.prompt_pick ? 'prompts' : m.module] || m.module || '')}${m.source ? ' · ' + esc(m.source) : ''}</small></li>`;
  function drawPanel() {
    const x = DAYS[sel]; if (!x) { panel.innerHTML = ''; return; }
    const dt = new Date(sel + 'T00:00:00'), own = owner(), mine = own ? (favBy[sel] || []) : [], favs = mine.filter(f => f.fav), likes = mine.filter(f => f.like).length;
    const favIds = new Set(favs.map(f => f.id)), top = x.top.filter(t => !favIds.has(t[0])).slice(0, 6).map(([id, title, url, module, source]) => ({ id, title, url, module, source }));
    panel.innerHTML = `<header class="ap-h"><b class="ap-d">${dt.getDate()}</b><div class="ap-meta"><span>${dt.getMonth() + 1} 月 · 周${'日一二三四五六'[dt.getDay()]}</span><strong>${x.n} 条</strong>${own ? `<span class="ap-own">收藏 ${favs.length} · ♥ ${likes}</span>` : ''}</div></header>
${own ? `<section class="ap-sec ap-fav"><h3>这天的收藏</h3>${favs.length ? `<ol>${favs.slice(0, FAVMAX).map(f => li(f)).join('')}</ol>${favs.length > FAVMAX ? `<a class="ap-more" href="${ROOT}favorites.html#pub=${sel}">还有 ${favs.length - FAVMAX} 条收藏 →</a>` : ''}` : '<p class="ap-none">这天没有收藏</p>'}</section>` : ''}
<section class="ap-sec"><h3>头条</h3><ol>${top.map(t => li(t)).join('')}</ol></section>
<a class="ap-open" href="${esc(path(sel))}">打开当日日报<span aria-hidden="true">→</span></a>`;
  }
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const markRow = scroll => { for (const a of list.querySelectorAll('.day')) { const on = a.dataset.d === sel; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'date') : a.removeAttribute('aria-current'); if (on && scroll && !list.hidden) a.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }); } };
  // 切换动效: the day panel slides in from the side of travel (later day → from the right); a month change slides the grid the same way
  const slide = (el, dir) => { if (!dir || RM() || !el.animate) return; el.animate([{ opacity: 0, transform: `translateX(${dir * 22}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }); };
  function pick(d, focus) { if (!DAYS[d]) return; if (d === sel) { location.href = path(d); return; } const dir = d > sel ? 1 : -1, mo = d.slice(0, 7) !== ym; sel = d; ym = d.slice(0, 7); history.replaceState(null, '', '#d=' + d); drawGrid(); drawPanel(); markRow(false); slide(panel, dir); if (mo) slide(grid, dir);
    if (focus) grid.querySelector(`[data-d="${d}"]`)?.focus();
    // stacked layout (panel under the grid): bring the panel's head into view if it sits below the fold
    else if (getComputedStyle(panel).position !== 'sticky' && panel.getBoundingClientRect().top > innerHeight - 160) panel.scrollIntoView({ block: 'start', behavior: RM() ? 'auto' : 'smooth' }); }
  grid.addEventListener('click', e => { const b = e.target.closest('.am-d.has'); if (b) pick(b.dataset.d); });
  // keyboard: ←/→ previous/next edition, ↑/↓ a week back/forward (or the nearest edition that way); Enter/Space = click
  grid.addEventListener('keydown', e => { const b = e.target.closest('.am-d.has'); if (!b) return; const d = b.dataset.d, i = dates.indexOf(d); let t = null;
    if (e.key === 'ArrowLeft') t = dates[i - 1]; else if (e.key === 'ArrowRight') t = dates[i + 1];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const s = e.key === 'ArrowUp' ? -1 : 1, x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 7 * s);
      const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; t = s < 0 ? [...dates].reverse().find(z => z <= k) : dates.find(z => z >= k); }
    if (!t || t === d) return; e.preventDefault(); sel === t || pick(t, true); });
  sec.querySelector('.am-navs').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b || b.disabled) return; const i = months.indexOf(ym) + +b.dataset.step; if (!months[i]) return;
    ym = months[i]; const inM = dates.filter(d => d.startsWith(ym)); if (!sel.startsWith(ym)) { sel = b.dataset.step > 0 ? inM[0] : inM[inM.length - 1]; history.replaceState(null, '', '#d=' + sel); drawPanel(); markRow(false); slide(panel, +b.dataset.step); } drawGrid(); slide(grid, +b.dataset.step); });
  // 月历 ⇄ 列表
  const setView = v => { const m = v !== 'l'; sec.hidden = !m; list.hidden = m; for (const b of seg.querySelectorAll('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === (m ? 'm' : 'l'))); try { localStorage.setItem(VK, m ? 'm' : 'l'); } catch {} if (!m) markRow(true); };
  seg.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); });
  window.NDArchive = { view: () => (sec.hidden ? 'l' : 'm'), restore: () => setView(localStorage.getItem(VK) || 'm') };
  seg.hidden = false; drawGrid(); drawPanel(); markRow(false); setView(localStorage.getItem(VK) || 'm');
  const refresh = async () => { await favIndex(); drawGrid(); drawPanel(); };
  if (owner()) refresh(); let t; addEventListener('news-state', () => { clearTimeout(t); t = setTimeout(refresh, 300); });
})();
// Search across every edition (items.json, loaded on first use; assets/search.js). Hits marked with <mark>; module chips narrow the hits.
// Empty query → back to the month calendar / list.
(() => { const box = document.getElementById('aq'), res = document.getElementById('sres'), days = document.querySelector('.days'), qn = document.querySelector('.asearch .qn');
  const mods = document.querySelector('.amods'), sec = document.querySelector('.amonth'), seg = document.querySelector('.aview');
  if (!box || !res || !window.NDSearch) return;
  const ROOT = document.body.dataset.root || '', day = d => `${ROOT}${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.html`, MAX = 80;
  const MOD = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻', prompts: '今日提示词' }, modOf = m => (m.prompt_pick ? 'prompts' : m.module);
  const esc = NDSearch.esc;
  let items = null, seq = 0, mod = '', last = '';
  const load = () => items || (items = fetch(ROOT + 'items.json').then(r => r.json()).catch(() => { items = null; return []; }));
  box.addEventListener('focus', load, { once: true });
  const idle = () => { res.hidden = true; res.innerHTML = ''; qn.textContent = ''; if (mods) mods.hidden = true; if (seg && window.NDArchive) seg.hidden = false;
    if (window.NDArchive) NDArchive.restore(); else days.hidden = false; };
  async function run(q) { last = q; const my = ++seq, t = NDSearch.terms(q);
    if (!t.length) return idle();
    const all = await load(); if (my !== seq) return;
    const hit0 = all.filter(m => NDSearch.match(m, t)), hit = hit0.filter(m => !mod || modOf(m) === mod).sort((a, b) => b.date.localeCompare(a.date));
    days.hidden = true; if (sec) sec.hidden = true; if (seg) seg.hidden = true; res.hidden = false; qn.textContent = `${hit.length} 条`;
    if (mods) { mods.hidden = false; const c = {}; for (const m of hit0) c[modOf(m)] = (c[modOf(m)] || 0) + 1;
      for (const b of mods.querySelectorAll('[data-m]')) { const k = b.dataset.m, n = k ? c[k] || 0 : hit0.length; b.setAttribute('aria-pressed', String(k === mod)); b.innerHTML = `${esc(k ? MOD[k] : '全部')}<span class="n">${n}</span>`; b.disabled = !n && k !== mod; } }
    res.innerHTML = hit.length ? hit.slice(0, MAX).map(m => `<article class="sr"><a class="sd" href="${esc(day(m.date))}">${esc(m.date)}</a><div class="sm"><a class="st" href="${esc(m.url)}" target="_blank" rel="noopener">${NDSearch.hl(m.title, t)}</a><small>${esc(MOD[modOf(m)] || m.module)} · ${NDSearch.hl(m.source, t)}</small></div><a class="sv" href="${esc(day(m.date))}#${encodeURIComponent(m.id)}">在当期查看</a></article>`).join('')
        + (hit.length > MAX ? `<p class="smore">只显示最近 ${MAX} 条，换个更具体的词试试。</p>` : '')
      : `<p class="empty">没有匹配「${esc(q.trim())}」的新闻${mod ? `（${esc(MOD[mod])}）` : ''}。<button type="button" class="linkish" data-clear>清除搜索</button></p>`; }
  NDSearch.wire(box, run);
  mods?.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || b.disabled) return; mod = b.dataset.m; run(last); });
  res.addEventListener('click', e => { if (e.target.closest('[data-clear]')) { box.value = ''; box.dispatchEvent(new Event('input')); mod = ''; run(''); box.focus(); } });
})();
