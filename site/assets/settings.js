// 偏好与主题 (settings.html, zip settings.html layout): 减少动效 switch (assets/motion.js; owner → /api/prefs reduce_motion), 默认主题,
// 学到的偏好 (#learn, owner: /api/learned — 少推 / 多推 × 来源 / 关键词, each 撤销, 已撤销 → 恢复, 全部撤销) and the theme cards (#theme).
(() => {
  const ROOT = document.body.dataset.root || '', tok = () => localStorage.getItem('news-owner') || '', owner = () => !!(window.NEWS && NEWS.owner());
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // side nav: 偏好与主题 vs 学到的偏好 follow the hash / scroll position
  const side = k => document.querySelectorAll('.cside a[data-k]').forEach(a => a.toggleAttribute('aria-current', a.dataset.k === k));
  const learnEl = document.getElementById('learn');
  const spy = () => { if (!learnEl || !owner()) return side('settings'); const r = learnEl.getBoundingClientRect(), t = document.getElementById('theme').getBoundingClientRect();
    side(r.top < innerHeight * 0.4 && t.top > innerHeight * 0.4 ? 'learn' : 'settings'); };
  addEventListener('hashchange', () => side(location.hash === '#learn' && owner() ? 'learn' : 'settings')); addEventListener('scroll', spy, { passive: true });
  if (location.hash === '#learn') side('learn');

  // ---- themes
  const grid = document.querySelector('.tgrid'), btns = grid ? [...grid.querySelectorAll('[data-pick]')] : [];
  const prefs = () => { try { return JSON.parse(localStorage.getItem('news-theme-prefs') || '{}'); } catch { return {}; } };
  const name = id => btns.find(b => b.dataset.pick === id)?.querySelector('.tc-n')?.textContent || id;
  const paint = () => { const t = document.body.dataset.theme, P = prefs();
    for (const b of btns) { const id = b.dataset.pick, li = b.parentElement; b.setAttribute('aria-pressed', String(id === t));
      li.classList.toggle('on', id === t); li.classList.toggle('isfav', (P.theme_favs || []).includes(id)); li.classList.toggle('isdef', P.theme_default === id); }
    const dn = document.querySelector('.defnote'), dc = document.getElementById('defclr');
    if (dn) { dn.textContent = P.theme_default ? `我的默认：${name(P.theme_default)}（在主题球里 ★ 设置）` : '跟随每周主题；在主题球里点 ★ 可以设成默认'; dc.hidden = !P.theme_default; } };
  grid?.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b && window.NDTheme) NDTheme.set(b.dataset.pick, b); });
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  addEventListener('storage', paint); paint(); setTimeout(paint, 1500);
  document.getElementById('defclr')?.addEventListener('click', async e => { const P = { ...prefs(), theme_default: null }; localStorage.setItem('news-theme-prefs', JSON.stringify(P)); paint();
    try { await fetch(ROOT + 'api/prefs', { method: 'POST', headers: { authorization: 'Bearer ' + tok(), 'content-type': 'application/json' }, body: JSON.stringify({ theme_default: null }) }); } catch {} });

  // ---- 减少动效
  const sw = document.getElementById('rmsw'), sys = document.querySelector('.rm-sys'), M = window.NDMotion;
  if (sw && M) { const show = () => { const f = M.forced(), s = M.system(); sw.setAttribute('aria-checked', String(f));
      sys.textContent = f ? '已开启：关掉卡片、日历和换主题的动画' : s ? '跟随系统：系统已开启减少动效' : '跟随系统：系统没有开启，动画照常'; };
    sw.addEventListener('click', async () => { const v = !M.forced(); M.set(v); show(); if (!tok()) return;
      try { await fetch(ROOT + 'api/prefs', { method: 'POST', headers: { authorization: 'Bearer ' + tok(), 'content-type': 'application/json' }, body: JSON.stringify({ reduce_motion: v }) }); } catch {} });
    addEventListener('news-motion', show); show(); }
  // ---- 页面切换动效 (motion.js NDTurn; local only, key news-pt as the old 翻书换页 switch). Greyed note when reduced motion already turns it off.
  const pw = document.getElementById('ptsw'), pn = document.querySelector('.pt-note'), T = window.NDTurn;
  if (pw && T && M) { const showT = () => { let on = true; try { on = localStorage.getItem('news-pt') !== '0'; } catch {} pw.setAttribute('aria-checked', String(on));
      pn.textContent = !on ? '已关闭：换页直接跳转' : M.forced() || M.system() ? '已打开，但「减少动效」生效中，换页直接跳转' : '换页、换日期时旧页滑走、新页滑入，日期和日历留在原位；只在本机记住'; };
    pw.addEventListener('click', () => { T.set(pw.getAttribute('aria-checked') !== 'true'); showT(); }); addEventListener('news-motion', showT); showT(); }

  // ---- 学到的偏好
  const L = document.querySelector('.learned'); if (!L) return;
  const API = ROOT + 'api/learned', KL = { x: 'X 账号', repo: '仓库', site: '网站', feed: '信息源', kw: '关键词', hf: 'HF', hffam: 'HF 系列', sub: 'Reddit' };
  const split = k => { const i = k.indexOf(':'), t = k.slice(0, i), v = k.slice(i + 1); return [KL[t] || t, t === 'kw' ? v.replace(/_/g, ' ') : v, t]; };
  const CN = { like: '点赞', fav: '收藏', dis: '少推', del: '删除' }, MAX = 12, msg = L.querySelector('.lmsg');
  let D = null, dir = 'penalty', kind = '', all = false;
  const pct = e => `${e > 0 ? '+' : '−'}${Math.round(Math.abs(e) * 100)}%`;
  const row = r => { const [t, v] = split(r.key), c = Object.entries(r.c || {}).map(([k, n]) => `${CN[k] || k} ${n} 次`).join(' · ');
    return `<li class="lp ${dir === 'boost' ? 'up' : 'down'}"><span class="k">${esc(t)}</span><div class="lpb"><b title="${esc(r.key)}">${esc(v)}</b><small>${esc(c)} · ${dir === 'boost' ? '多推' : '降权'} ${pct(r.effect)}${r.ex?.length ? ` · ${esc(r.ex[0])}` : ''}</small></div>
      <span class="meter" title="强度 ${r.s.toFixed(2)} / 2"><i style="--w:${Math.max(4, Math.round(r.s / 2 * 100))}%"></i></span><button type="button" class="btn sm ghost lundo" data-kind="${dir}" data-key="${esc(r.key)}" aria-label="撤销：${esc(t)} ${esc(v)}">撤销</button></li>`; };
  function render() { if (!D) return; const src = D[dir] || [], rows = src.filter(r => !kind || (kind === 'kw') === r.key.startsWith('kw:'));
    L.querySelector('[data-d="penalty"] span').textContent = (D.penalty || []).length; L.querySelector('[data-d="boost"] span').textContent = (D.boost || []).length;
    L.querySelectorAll('#ldir button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === dir))); L.querySelectorAll('#lkind button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
    const list = document.getElementById('llist'), shown = all ? rows : rows.slice(0, MAX);
    list.innerHTML = rows.length ? shown.map(row).join('') + (rows.length > MAX ? `<li class="lmore"><button type="button" class="btn sm" data-more>${all ? '收起' : `显示全部 ${rows.length} 项`}</button></li>` : '')
      : `<li class="lnone">${dir === 'boost' ? '还没有：给喜欢的新闻点 ♥ 或收藏' : '还没有：卡片「＋」里的少推或不感兴趣会记在这里'}</li>`;
    document.getElementById('lall').hidden = !src.length;
    const det = L.querySelector('.lcleared'), cl = D.cleared || []; det.hidden = !cl.length; det.querySelector('summary span').textContent = cl.length;
    document.getElementById('lclr').innerHTML = cl.map(x => { const [t, v] = split(x.key); return `<li class="lp off"><span class="k">${x.kind === 'boost' ? '多推' : '少推'} · ${esc(t)}</span><div class="lpb"><b>${esc(v)}</b><small>${new Date(x.at).toLocaleDateString('zh-CN')} 撤销</small></div><span></span><button type="button" class="btn sm ghost lredo" data-kind="${x.kind}" data-key="${esc(x.key)}">恢复</button></li>`; }).join(''); }
  async function call(body) { const r = await fetch(API, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: 'Bearer ' + tok(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status); return r.json(); }
  async function load() { if (!owner()) return; msg.textContent = '加载中…'; try { D = await call(); msg.textContent = ''; render(); if (location.hash === '#learn') learnEl.scrollIntoView(); } catch { msg.textContent = '暂时读不到（离线或未部署）'; } }
  L.addEventListener('click', async e => {
    const d = e.target.closest('#ldir [data-d]'); if (d) { dir = d.dataset.d; all = false; return render(); }
    const k = e.target.closest('#lkind [data-k]'); if (k) { kind = k.dataset.k; all = false; return render(); }
    if (e.target.closest('[data-more]')) { all = !all; return render(); }
    if (e.target.closest('#lall')) { const src = (D[dir] || []).filter(r => !kind || (kind === 'kw') === r.key.startsWith('kw:')); if (!src.length || !confirm(`撤销这 ${src.length} 项${dir === 'boost' ? '多推' : '少推'}？之后的新信号还会再算。`)) return;
      msg.textContent = '撤销中…'; try { for (const r of src) D = await call({ action: 'clear', kind: dir, key: r.key }); render(); msg.textContent = `已撤销 ${src.length} 项，下一期开始生效`; } catch { msg.textContent = '有的没撤销成功，稍后再试'; } return; }
    const b = e.target.closest('.lundo,.lredo'); if (!b) return; b.disabled = true;
    try { D = await call({ action: b.matches('.lundo') ? 'clear' : 'unclear', kind: b.dataset.kind, key: b.dataset.key }); render(); msg.textContent = b.matches('.lundo') ? '已撤销，下一期开始生效' : '已恢复'; }
    catch { b.disabled = false; msg.textContent = '操作失败，稍后再试'; } });
  addEventListener('news-state', load); load();
})();
