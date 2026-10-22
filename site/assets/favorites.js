// Favourites across all days (owner only; state from D1). v3.6: ★ ratings retired — 「只看收藏」 off also lists 点赞 cards.
// Timeline (2026-10-21): 收藏时间 (default) groups by the day you favourited it (favAt, D1 ratings.fav_at; 点赞-only cards by their last update),
// 发布日期 groups by edition date. The calendar's dots follow the chosen order. #d=YYYY-MM-DD picks a day in the current order, #pub=… in 发布日期.
(async () => {
  const grid = document.getElementById('favs'), empty = document.querySelector('.empty'); let q = '', C = null, favDays = {};
  const SK = 'news-fav-sort', hm = location.hash.match(/^#(d|pub)=(\d{4}-\d{2}-\d{2})$/);
  let sort = hm?.[1] === 'pub' ? 'pub' : (localStorage.getItem(SK) === 'pub' ? 'pub' : 'fav'), sel = hm?.[2] || null;
  const meta = await (await fetch('items.json')).json();
  const MOD = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻', prompts: '今日提示词' };
  const modOf = m => m.prompt_pick ? 'prompts' : m.module;  // prompt picks render in their own 今日提示词 section, not under 社区新闻
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // when it was favourited (or, for 点赞-only cards, last touched); rows without a plausible time fall back to the edition date
  const favT = m => { const s = NEWS.state[m.id] || {}, t = (s.fav && s.favAt) || s.updatedAt || 0; return t > 1e12 ? t : Date.parse(m.date + 'T12:00:00'); };
  const keyDay = m => (sort === 'fav' ? ymd(favT(m)) : m.date);
  const WD = '日一二三四五六', head = (d, n, only) => { const x = new Date(d + 'T00:00:00');
    return `<div class="fgroup" role="heading" aria-level="2" data-day="${d}"><b>${+d.slice(5, 7)}.${String(+d.slice(8)).padStart(2, '0')}</b><span>周${WD[x.getDay()]} · ${sort === 'fav' ? (only ? '收藏于' : '收藏 / 点赞于') : '发布于'}${d.slice(0, 4) !== String(new Date().getFullYear()) ? ' ' + d.slice(0, 4) : ''}</span><em>${n} 条</em></div>`; };
  function render() {
    const own = NEWS.owner(), S = NEWS.state;
    if (!own) { grid.innerHTML = ''; empty.hidden = false; empty.innerHTML = '这是主人页面。<a href="index.html">← 回到最新一期</a>'; document.querySelector('.filters').hidden = true; document.querySelector('.favnote').textContent = ''; return; }
    document.querySelector('.filters').hidden = false;
    document.querySelector('.favmode').textContent = own ? '云端收藏 · 已同步（D1）' : '本地收藏 · 仅此浏览器，未同步';
    document.querySelector('.favnote').textContent = own ? '你收藏和点赞的新闻。' : '';
    const only = !own || document.getElementById('withliked').getAttribute('aria-checked') !== 'true', fm = document.getElementById('fmod').value, ft = document.getElementById('ftag').value;
    const qt = window.NDSearch ? NDSearch.terms(q) : [];
    const mine = meta.filter(m => (only ? (S[m.id] || {}).fav : ((S[m.id] || {}).fav || (S[m.id] || {}).vote > 0)) && (!fm || modOf(m) === fm) && (!ft || (m.tags || []).includes(ft)));
    const list = qt.length ? mine.filter(m => NDSearch.match(m, qt)) : mine, H = x => (qt.length ? NDSearch.hl(x, qt) : esc(x));  // search hits marked in title / excerpt
    if (sort === 'fav') list.sort((a, b) => favT(b) - favT(a) || b.date.localeCompare(a.date));
    else list.sort((a, b) => b.date.localeCompare(a.date) || ((S[b.id] || {}).updatedAt || 0) - ((S[a.id] || {}).updatedAt || 0));
    favDays = {}; for (const m of list) { const k = keyDay(m); favDays[k] = (favDays[k] || 0) + 1; }
    if (sel && !favDays[sel]) sel = null;
    const shown = sel ? list.filter(m => keyDay(m) === sel) : list;
    const before = new Map([...grid.children].map(c => [c.dataset.id, c.getBoundingClientRect()]));
    empty.hidden = !!list.length;
    empty.innerHTML = mine.length ? `没有匹配「${esc(q.trim())}」的收藏。<button type="button" class="linkish" data-clear>清除搜索</button>` : '还没有收藏，去 <a href="index.html">最新一期</a> 点卡片上的收藏图标吧。';
    const qn = document.querySelector('.filters .qn'); if (qn) qn.textContent = qt.length ? `${list.length} 条` : '';
    let lastDay = '';
    grid.innerHTML = shown.map((m, i) => { const k = keyDay(m), g = k !== lastDay ? head(k, favDays[k], only) : ''; lastDay = k; return g + `<article class="card" data-id="${esc(m.id)}" style="--i:${i}"><div class="meta"><span class="src">${esc(m.date)}</span><span>${esc(MOD[modOf(m)] || m.module)}</span><span>${esc(m.source)}</span></div><h3><a href="${esc(m.url)}" target="_blank" rel="noopener">${H(m.title)}</a></h3>${m.title_orig ? `<p class="orig"><span>原标题</span> ${esc(m.title_orig)}</p>` : ''}<p class="ex">${H(m.excerpt)}</p>${m.prompt?.text ? `<div class="prompt"><div class="ph"><span>提示词${m.prompt.from === 'thread' ? ' · 来自楼主回复' : m.prompt.from === 'alt' ? ' · 来自图片说明' : ''}</span><button type="button" class="cp" aria-label="复制提示词">复制</button></div><pre>${esc(m.prompt.text)}</pre></div>` : ''}<div class="tags">${(m.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="foot"><span class="links"><a href="${esc(m.date.slice(0, 4))}/${esc(m.date.slice(5, 7))}/${esc(m.date)}.html#${encodeURIComponent(m.id)}">在当期查看</a></span>${window.NEWS_ACTS || ''}</div></article>`; }).join('');
    NEWS.paint();
    // FLIP: kept cards glide from old spot, new ones slide in from the direction of travel
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, dir = render.dir || 0; render.dir = 0;
    if (before.size && !RM) [...grid.children].forEach((c, k) => { if (!c.dataset.id) return; const o = before.get(c.dataset.id); c.style.animation = 'none';
      if (o) { const n = c.getBoundingClientRect(); c.animate([{ transform: `translate(${o.left - n.left}px,${o.top - n.top}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }); }
      else c.animate([{ opacity: 0, transform: `translateX(${dir * 48}px) scale(.96)` }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(k, 8) * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }); });
    const box = document.querySelector('.pcal .calbox'), dk = JSON.stringify(favDays);
    if (box && window.DDCal) { if (!C) C = DDCal({ calbox: box, days: () => favDays, sel, disableEmpty: true, unit: '有收藏的日子', dotLabel: '收藏', allSub: 'ALL · 收藏', countLabel: c => `，${c} 个收藏`,
      onSelect: (s, prev) => { sel = s; render.dir = !s || !prev ? 0 : (s > prev ? 1 : -1); history.replaceState(null, '', s ? (sort === 'pub' ? '#pub=' : '#d=') + s : location.pathname); render(); } }); else if (C.sel !== sel) C.choose(sel, { silent: true });
      // redraw only when the dots changed: picking a day already drew the calendar (a second draw restarted its month slide / cell spring)
      else { if (C._dk !== dk) C.redraw(); if (!sel && C._n !== list.length) C.roll(); } C._n = list.length; C._dk = dk; }
  }
  ['fmod', 'ftag'].forEach(id => document.getElementById(id).addEventListener('change', render));
  // 同时列出 ♥ 点赞的 (zip favorites): elastic switch (assets/switch.js), on by default, remembered on this device
  { const w = document.getElementById('withliked'), K = 'news-fav-liked'; w.setAttribute('aria-checked', String(localStorage.getItem(K) !== '0'));
    w.addEventListener('click', () => { const v = w.getAttribute('aria-checked') !== 'true'; w.setAttribute('aria-checked', String(v)); localStorage.setItem(K, v ? '1' : '0'); render(); }); }
  const seg = document.querySelector('.fsort'), paintSeg = () => seg && seg.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === sort)));
  seg?.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === sort) return; sort = b.dataset.s; try { localStorage.setItem(SK, sort); } catch {}
    sel = null; history.replaceState(null, '', location.pathname); paintSeg(); render(); });  // render() resets the calendar (choose / redraw) itself
  paintSeg();
  const fq = document.getElementById('fq');
  if (fq && window.NDSearch) NDSearch.wire(fq, v => { if (v === q) return; q = v; render(); });
  empty.addEventListener('click', e => { if (e.target.closest('[data-clear]') && fq) { fq.value = ''; fq.dispatchEvent(new Event('input')); q = ''; render(); } });
  let t; addEventListener('news-state', () => { clearTimeout(t); t = setTimeout(render, 500); });
  render();
})();
