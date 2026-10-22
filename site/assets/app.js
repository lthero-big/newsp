// v3.6 card actions: ♥ 点赞 (vote 1 = 多推这类) · 收藏 (bookmark) · ＋更多 (少推这类 = vote -1, …). Like and 少推 are one field (vote 1/0/-1),
// mutually exclusive; like and 收藏 are independent. ★ ratings and the ≥4★ auto-favourite are retired (DESIGN-RULES §4).
// localStorage first, synced to /api/ratings (newest-wins). Locked visitors are read-only: none of these buttons, no API calls.
(() => {
  const KEY = 'news-state-v1', LKEY = 'news-local-fav-v1', PK = 'news-owner', API = (document.body.dataset.root || '') + 'api/ratings';
  let pass = localStorage.getItem(PK) || ''; const owner = () => !!pass;
  const hdr = (h = {}) => ({ ...h, authorization: 'Bearer ' + pass });
  document.body.classList.toggle('owner', owner());
  localStorage.removeItem(LKEY); // v2.2 local-only favourites are retired
  const key = () => KEY;
  // pre-v3.6 local rows carry { rating, favAuto }: map like migration 0009 (≥4★ → 1, 1–2★ → -1, 3★ → 0)
  const up = r => { if (!r || r.vote !== undefined) return r; const { rating = 0, favAuto, ...x } = r; return { ...x, vote: rating >= 4 ? 1 : rating >= 1 && rating <= 2 ? -1 : 0 }; };
  const load = () => { try { return Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(key())) || {}).map(([k, v]) => [k, up(v)])); } catch { return {}; } };
  let S = load(); const pending = new Set();
  const save = () => localStorage.setItem(key(), JSON.stringify(S));
  const merge = remote => { let changed = false; for (const [id, r0] of Object.entries(remote || {})) { const r = up(r0), l = S[id]; if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { S[id] = { ...r, ...(r.fav && !r.favAt && l?.favAt ? { favAt: l.favAt } : {}) }; changed = true; } else if ((l.updatedAt || 0) > (r.updatedAt || 0)) pending.add(id); } save(); return changed; };
  const setSync = (cls, t) => { document.querySelectorAll('.sync').forEach(e => { e.classList.remove('ok', 'off'); e.classList.add(cls); e.title = t; }); window.NEWS_SYNC = { cls, at: Date.now() }; window.dispatchEvent(new CustomEvent('news-sync')); };
  async function push() { if (!owner() || !pending.size) return; const items = {}; for (const id of pending) items[id] = S[id];
    try { const r = await fetch(API, { method: 'POST', headers: hdr({ 'content-type': 'application/json' }), body: JSON.stringify({ items }) }); if (!r.ok) throw 0; const j = await r.json(); pending.clear(); merge(j.items); paint(); setSync('ok', '已同步'); } catch { setSync('off', '离线：仅保存在本地'); } }
  async function pull() { if (!owner()) return; try { const r = await fetch(API, { cache: 'no-store', headers: hdr() }); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw 0; const j = await r.json(); for (const id of Object.keys(S)) if (!(j.items || {})[id]) pending.add(id); if (merge(j.items)) { paint(); window.dispatchEvent(new CustomEvent('news-state')); } setSync('ok', '已同步'); push(); } catch { setSync('off', '离线：仅保存在本地'); } }
  function set(id, patch) { if (!owner()) return; S[id] = { fav: false, vote: 0, ...S[id], ...patch, updatedAt: Date.now() }; if (patch.fav) S[id].favAt = S[id].updatedAt; else if (patch.fav === false) delete S[id].favAt; save(); paint(); if (owner()) { pending.add(id); clearTimeout(set.t); set.t = setTimeout(push, 400); } window.dispatchEvent(new CustomEvent('news-state')); }
  const vote = (id, v) => set(id, { vote: v });
  function paint() {
    document.querySelectorAll('[data-id]').forEach(el => { const s = S[el.dataset.id] || {};
      const f = el.querySelector('.fav'); if (f) { f.classList.toggle('on', !!s.fav); f.setAttribute('aria-pressed', String(!!s.fav)); f.title = s.fav ? '已收藏（点击取消）' : '收藏'; f.setAttribute('aria-label', f.title); }
      const l = el.querySelector('.like'); if (l) { const on = s.vote === 1; l.classList.toggle('on', on); l.setAttribute('aria-pressed', String(on)); l.title = on ? '已点赞（点击取消）' : '点赞：多推这类'; l.setAttribute('aria-label', l.title); }
      el.classList.toggle('down', s.vote === -1); });
    const n = Object.values(S).filter(x => x.fav).length; document.querySelectorAll('.favcount').forEach(c => { c.dataset.n = n; if (c.textContent != n) { c.textContent = n; c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 300); } });
  }
  const pop = b => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); };
  document.addEventListener('click', e => { const host = e.target.closest('[data-id]'); if (!host || !owner()) return; const id = host.dataset.id;
    const f = e.target.closest('.fav'); if (f) { e.preventDefault(); e.stopPropagation(); set(id, { fav: !(S[id] || {}).fav }); window.dispatchEvent(new CustomEvent('news-fav', { detail: { id, fav: !!S[id].fav } })); pop(f); }
    const l = e.target.closest('.like'); if (l) { e.preventDefault(); e.stopPropagation(); vote(id, (S[id] || {}).vote === 1 ? 0 : 1); pop(l); } });
  // ---- easter egg: click the logo glyph 5× within 2s, or type the Konami code ----
  function prompt() { if (document.querySelector('.egg')) return; const m = document.createElement('form'); m.className = 'egg';
    m.innerHTML = '<input type="password" placeholder="口令" autocomplete="current-password" aria-label="口令"><button>↵</button>';
    document.body.appendChild(m); const inp = m.querySelector('input'); inp.focus();
    m.onsubmit = async e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return;
      try { const r = await fetch(API, { cache: 'no-store', headers: { authorization: 'Bearer ' + t } }); if (!r.ok) throw 0;
        pass = t; localStorage.setItem(PK, t); document.body.classList.add('owner'); S = load(); m.remove(); pull(); paint(); window.dispatchEvent(new CustomEvent('news-state')); }
      catch { m.classList.remove('no'); void m.offsetWidth; m.classList.add('no'); inp.select(); } };
    inp.onkeydown = e => { if (e.key === 'Escape') m.remove(); }; }
  let clicks = []; const g = document.querySelector('.logo .glyph');
  if (g) g.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const now = Date.now(); clicks = clicks.filter(t => now - t < 2000); clicks.push(now); clearTimeout(g.t);
    if (clicks.length >= 5) { clicks = []; if (!owner()) prompt(); return; }
    const href = g.closest('a')?.href; if (href) g.t = setTimeout(() => { if (!document.querySelector('.egg')) location.href = href; }, owner() ? 0 : 450); }); // tap = 最新; 5 quick taps = owner unlock
  const K = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']; let ki = 0;
  addEventListener('keydown', e => { if (e.target.closest && e.target.closest('input,textarea,select')) return; ki = (e.key === K[ki] || e.key.toLowerCase() === K[ki]) ? ki + 1 : (e.key === K[0] ? 1 : 0); if (ki === K.length) { ki = 0; if (!owner()) prompt(); } });
  document.addEventListener('click', e => { if (e.target.closest('.exit')) { e.preventDefault(); localStorage.removeItem(PK); pass = ''; document.body.classList.remove('owner'); S = load(); paint(); window.dispatchEvent(new CustomEvent('news-state')); } });
  window.NEWS = { get state() { return S; }, set, vote, paint, owner, auth: hdr };
  // the same face actions for cards rendered client-side (favorites page); keep in sync with ACTS_HTML in scripts/build.mjs
  window.NEWS_ACTS = '<span class="acts"><button class="like" type="button" aria-pressed="false" aria-label="点赞：多推这类" title="点赞：多推这类"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6z"/></svg></button><button class="fav" type="button" aria-pressed="false" aria-label="收藏" title="收藏"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.4h7.6v11.2L8 10.9l-3.8 2.7z"/></svg></button></span>';
  paint(); pull();
})();

// Tag + "仅看新增" filters, read ticks, scroll progress, theme preview (no network).
(() => {
  const chips = document.querySelectorAll('.chip[data-tag]'), newChip = document.querySelector('.chip[data-batch]');
  let tag = '*', onlyNew = false;
  const apply = () => {
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.tag === tag && !(onlyNew && tag === '*'))));
    if (newChip) newChip.setAttribute('aria-pressed', String(onlyNew));
    document.querySelectorAll('.card[data-tags]').forEach(card => { card.hidden = (tag !== '*' && !card.dataset.tags.split(',').includes(tag)) || (onlyNew && card.dataset.batch !== 'pm'); });
    const filtering = tag !== '*' || onlyNew; document.body.classList.toggle('filtering', filtering);
    document.querySelectorAll('.ed-lead,.ed-side,.ed-more,.ed').forEach(box => { box.hidden = !box.querySelector('.card:not([hidden])'); });
    document.querySelectorAll('.ed').forEach(ed => ed.classList.toggle('nolead', !!ed.querySelector('.ed-lead[hidden]') || !!ed.querySelector('.ed-side[hidden]')));
    document.querySelectorAll('.module').forEach(m => { const n = m.querySelectorAll('.card:not([hidden])').length; const c = m.querySelector('.count'); if (c) c.textContent = String(n).padStart(2, '0'); m.classList.toggle('none', n === 0); });
    const vis = id => document.querySelectorAll(`#m-${id} .card:not([hidden])`).length; const rows = [...document.querySelectorAll('.meter .row[data-m]')]; const mx = Math.max(1, ...rows.map(r => vis(r.dataset.m)));
    rows.forEach(r => { const n = vis(r.dataset.m); r.querySelector('b').textContent = n; r.querySelector('.bar i').style.width = Math.round(100 * n / mx) + '%'; r.classList.toggle('zero', n === 0); });
  };
  chips.forEach(c => c.addEventListener('click', () => { tag = c.dataset.tag; apply(); }));
  const showNew = on => { onlyNew = on; apply(); if (on) { const f = document.querySelector('.card[data-batch="pm"]'); const r = document.querySelector('.rail'); if (r) scrollTo({ top: r.getBoundingClientRect().top + scrollY - 56, behavior: 'smooth' }); else if (f) f.scrollIntoView({ behavior: 'smooth' }); } };
  if (newChip) newChip.addEventListener('click', () => showNew(!onlyNew));
  document.querySelectorAll('.onlynew').forEach(a => a.addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#new'); showNew(true); }));
  if (location.hash === '#new' && newChip) setTimeout(() => showNew(true), 50);
  // read ticks: local per device; when the owner is unlocked they sync to D1 (/api/reads, newest-wins, tombstones, debounced)
  const RK = 'news-read-v2', RAPI = (document.body.dataset.root || '') + 'api/reads', tok = () => localStorage.getItem('news-owner') || '';
  let R = {}; try { R = JSON.parse(localStorage.getItem(RK)) || {}; } catch {}
  try { const old = JSON.parse(localStorage.getItem('news-read-v1') || 'null'); if (old) { for (const [id, t] of Object.entries(old)) if (!R[id]) R[id] = { on: true, t: +t || Date.now() }; localStorage.removeItem('news-read-v1'); localStorage.setItem(RK, JSON.stringify(R)); } } catch {}
  const rpend = new Set(); const rsave = () => localStorage.setItem(RK, JSON.stringify(R));
  const paintRead = () => { let n = 0; document.querySelectorAll('.card[data-id]').forEach(c => { const on = !!R[c.dataset.id]?.on; n += on; c.classList.toggle('read', on); const b = c.querySelector('.rd'); if (b) { b.setAttribute('aria-pressed', String(on)); b.querySelector('path')?.setAttribute('d', on ? 'M4.6 6 8 2.6 11.4 6M4.6 10 8 13.4l3.4-3.4' : 'm4.6 2.6 3.4 3.4 3.4-3.4M4.6 13.4 8 10l3.4 3.4'); b.title = on ? '已收起（点击放回）' : '看过，收起'; b.setAttribute('aria-label', b.title); } }); const el = document.querySelector('.readn'); if (el) el.textContent = n; };
  const rmerge = remote => { for (const [id, r] of Object.entries(remote || {})) { const l = R[id]; if (!l || r.t > l.t) R[id] = r; else if (l.t > r.t) rpend.add(id); } for (const id of Object.keys(R)) if (!(remote || {})[id]) rpend.add(id); rsave(); paintRead(); };
  const rhdr = x => ({ authorization: 'Bearer ' + tok(), ...x });
  async function rpush() { if (!tok() || !rpend.size) return; const items = {}; for (const id of rpend) items[id] = R[id]; rpend.clear();
    try { const r = await fetch(RAPI, { method: 'POST', headers: rhdr({ 'content-type': 'application/json' }), body: JSON.stringify({ items }) }); if (!r.ok) throw 0; } catch { for (const id of Object.keys(items)) rpend.add(id); } }
  async function rpull() { if (!tok()) return; try { const r = await fetch(RAPI, { cache: 'no-store', headers: rhdr() }); if (!r.ok) throw 0; rmerge((await r.json()).items); rpush(); } catch {} }
  document.addEventListener('click', e => { const b = e.target.closest('.rd'); if (!b) return; e.preventDefault(); e.stopPropagation(); const id = b.closest('[data-id]').dataset.id; R[id] = { on: !R[id]?.on, t: Date.now() }; rsave(); paintRead(); if (tok()) { rpend.add(id); clearTimeout(rpush.t); rpush.t = setTimeout(rpush, 800); } });
  addEventListener('pagehide', () => { if (tok() && rpend.size) rpush(); });
  let rwas = !!tok(); window.addEventListener('news-state', () => { if (tok() && !rwas) rpull(); rwas = !!tok(); });
  addEventListener('focus', () => { if (tok()) rpull(); });
  paintRead(); rpull();
  // 已收起 = "read it, not worth digging into or favouriting — tuck it away" (DESIGN-RULES §3). UI only: never a recommendation signal.
  // 点赞 / 少推 / 收藏 never tuck a card. A card favourited after it was tucked (here or synced from another device) comes back out of the shelf.
  const unTuckFavs = () => { let S2 = {}; try { S2 = JSON.parse(localStorage.getItem('news-state-v1')) || {}; } catch {}
    const back = Object.keys(R).filter(id => R[id]?.on && S2[id]?.fav && (S2[id].favAt || S2[id].updatedAt || 0) > (R[id].t || 0));
    if (back.length) { for (const id of back) { R[id] = { on: false, t: Date.now() }; if (tok()) rpend.add(id); } rsave(); paintRead(); if (tok()) { clearTimeout(rpush.t); rpush.t = setTimeout(rpush, 800); } } };
  window.addEventListener('news-state', unTuckFavs);
  // owner and guest alike (guest: local only, DESIGN-RULES §3): a tucked card parks in its section's 已收起 shelf (see the shelf block below); put it back from the shelf list
  const setRead = (id, on) => { R[id] = { on, t: Date.now() }; rsave(); paintRead(); if (tok()) { rpend.add(id); clearTimeout(rpush.t); rpush.t = setTimeout(rpush, 800); } window.dispatchEvent(new CustomEvent('news-state')); };
  // mobile: swipe left on a card = tuck it away (goes to the 已收起 shelf), with 撤销 toast
  window.addEventListener('news-unread', e => { const id = e.detail?.id; if (id && R[id]?.on) setRead(id, false); });
  let sx = 0, sy = 0, sc = null, dxl = 0;
  const toastR = (msg, undo) => { document.querySelector('.rtoast')?.remove(); const t = document.createElement('div'); t.className = 'rtoast'; t.dataset.ixh = 'toast'; t.setAttribute('role', 'status'); t.innerHTML = `<span>${msg}</span><button type="button">撤销</button>`; t.querySelector('button').onclick = () => { undo(); t.remove(); }; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
  document.addEventListener('touchstart', e => { const c = e.target.closest('main .card[data-id]'); sc = c && !e.target.closest('.acts,.pgrid,.gal,.pic,audio,video,.rd,.acti,.srcpop') && !R[c.dataset.id]?.on ? c : null; if (!sc) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dxl = 0; }, { passive: true });
  document.addEventListener('touchmove', e => { if (!sc) return; const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy; if (Math.abs(dy) > Math.abs(dx) && !dxl) { sc = null; return; } if (dx < 0) { dxl = dx; sc.classList.add('swiping'); sc.style.transform = `translateX(${Math.max(dx, -120)}px)`; } }, { passive: true });
  document.addEventListener('touchend', () => { if (!sc) return; const c = sc, id = c.dataset.id; sc = null; c.classList.remove('swiping'); c.classList.add('swipe-go'); c.style.transform = ''; setTimeout(() => c.classList.remove('swipe-go'), 220);
    if (dxl < -70) { setRead(id, true); toastR('已收起', () => setRead(id, false)); } });
  const prog = document.querySelector('.prog');
  if (prog) { const upd = () => { const h = document.documentElement.scrollHeight - innerHeight; prog.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h) : 0); }; addEventListener('scroll', upd, { passive: true }); upd(); }
  // theme orb dock: View Transitions circular reveal from the clicked orb
  const sw = document.querySelector('.tsw');
  if (sw) {
    const day = document.body.dataset.theme, KEY = 'news-theme-preview';
    const cur = sw.querySelector('.orb.cur'), dock = sw.querySelector('.dock'), orbs = [...dock.querySelectorAll('.orb')];
    const ids = orbs.map(o => o.dataset.t);
    orbs.forEach((o, i) => o.style.setProperty('--d', Math.abs(i - (orbs.length - 1) / 2)));
    const paint = () => { const t = document.body.dataset.theme, o = orbs.find(x => x.dataset.t === t);
      orbs.forEach(x => x.setAttribute('aria-checked', String(x === o)));
      if (o) { cur.setAttribute('style', o.getAttribute('style')); cur.title = o.dataset.name; } };
    const set = (id, from) => {
      if (!ids.includes(id) || id === document.body.dataset.theme) return;
      const go = () => { document.body.dataset.theme = id; document.body.dataset.arch = orbs[ids.indexOf(id)].dataset.a; id === day ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, id); paint(); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
      const r = (from || cur).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (!document.startViewTransition) { document.body.classList.add('tfade'); go(); setTimeout(() => document.body.classList.remove('tfade'), 450); return; }
      const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.startViewTransition(go).ready.then(() => document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    };
    window.NDTheme = { set: (id, from) => set(id, from), ids, day };  // themes.html picks through the same transition + session memory
    const open = v => { sw.classList.toggle('open', v); cur.setAttribute('aria-expanded', String(v)); if (v) { dock.hidden = false; (orbs.find(o => o.getAttribute('aria-checked') === 'true') || orbs[0]).focus({ preventScroll: true }); } else setTimeout(() => { if (!sw.classList.contains('open')) dock.hidden = true; }, 260); };
    cur.addEventListener('click', e => { e.stopPropagation(); open(!sw.classList.contains('open')); });
    orbs.forEach(o => o.addEventListener('click', e => { e.stopPropagation(); set(o.dataset.t, o); }));
    // owner: ♥ favourite themes + "my default" (D1 /api/prefs, cached locally for an instant first paint). Visitors: nothing.
    const PAPI = (document.body.dataset.root || '') + 'api/prefs', PKEY = 'news-theme-prefs', otok = () => localStorage.getItem('news-owner') || '';
    let P = { theme_favs: [], theme_default: null }; try { P = { ...P, ...JSON.parse(localStorage.getItem(PKEY) || '{}') }; } catch {}
    const fav = sw.querySelector('.tfav'), def = sw.querySelector('.tdef');
    const paintP = () => { const t = document.body.dataset.theme;
      orbs.forEach(o => { o.classList.toggle('fav', P.theme_favs.includes(o.dataset.t)); o.classList.toggle('mine', P.theme_default === o.dataset.t); });
      if (fav) { const on = P.theme_favs.includes(t); fav.setAttribute('aria-pressed', String(on)); fav.title = on ? '取消收藏当前主题' : '收藏当前主题'; }
      if (def) { const on = P.theme_default === t; def.setAttribute('aria-pressed', String(on)); def.title = on ? '已是我的默认（点击改回跟随每周）' : '设为我的默认主题'; } };
    const applyDefault = () => { if (!otok() || sessionStorage.getItem(KEY)) return; const d = P.theme_default;
      if (d && ids.includes(d) && d !== document.body.dataset.theme) { document.body.dataset.theme = d; document.body.dataset.arch = orbs[ids.indexOf(d)].dataset.a; paint(); } };
    const savePrefs = async patch => { P = { ...P, ...patch }; localStorage.setItem(PKEY, JSON.stringify(P)); paintP();
      try { const r = await fetch(PAPI, { method: 'POST', headers: { authorization: 'Bearer ' + otok(), 'content-type': 'application/json' }, body: JSON.stringify(patch) }); if (r.ok) { const j = await r.json(); P = { ...P, theme_favs: j.theme_favs, theme_default: j.theme_default, hero: j.hero ?? P.hero ?? null }; localStorage.setItem(PKEY, JSON.stringify(P)); paintP(); } } catch {} };
    const pullPrefs = async () => { if (!otok()) return; try { const r = await fetch(PAPI, { cache: 'no-store', headers: { authorization: 'Bearer ' + otok() } }); if (!r.ok) return; const j = await r.json(); P = { ...P, theme_favs: j.theme_favs || [], theme_default: j.theme_default ?? null, hero: j.hero ?? null }; localStorage.setItem(PKEY, JSON.stringify(P)); if (typeof j.reduce_motion === 'boolean' && window.NDMotion) NDMotion.set(j.reduce_motion); applyDefault(); paintP(); } catch {} };
    if (fav) fav.addEventListener('click', e => { e.stopPropagation(); const t = document.body.dataset.theme; savePrefs({ theme_favs: P.theme_favs.includes(t) ? P.theme_favs.filter(x => x !== t) : [...P.theme_favs, t] }); });
    if (def) def.addEventListener('click', e => { e.stopPropagation(); const t = document.body.dataset.theme; savePrefs({ theme_default: P.theme_default === t ? null : t }); });
    const mo = new MutationObserver(paintP); mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    if (otok()) { applyDefault(); paintP(); pullPrefs(); } else localStorage.removeItem(PKEY);
    window.addEventListener('news-state', () => { if (otok()) pullPrefs(); });
    document.addEventListener('click', e => { if (!e.target.closest('.tsw')) open(false); });
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable],.egg')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && sw.classList.contains('open')) { open(false); cur.focus(); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault();
        if (e.shiftKey) set(day); else set(ids[(ids.indexOf(document.body.dataset.theme) + 1) % ids.length]); }
      if (sw.classList.contains('open') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const i = orbs.indexOf(document.activeElement); if (i >= 0) { e.preventDefault(); orbs[(i + (e.key === 'ArrowRight' ? 1 : orbs.length - 1)) % orbs.length].focus(); } }
    });
    const saved = sessionStorage.getItem(KEY);
    const apply = id => { document.body.dataset.theme = id; document.body.dataset.arch = orbs[ids.indexOf(id)].dataset.a; };
    if (saved && ids.includes(saved)) apply(saved);
    const q = new URLSearchParams(location.search).get('theme');
    if (q && ids.includes(q)) apply(q);
    paint();
  }
})();

// 不感兴趣 (owner only): server-timed 12h countdown, card fades with remaining time; trashed → hidden at once.
(() => {
  const API = (document.body.dataset.root || '') + 'api/deletions', H = 12 * 3600e3;
  let D = {}, skew = 0;
  const owner = () => window.NEWS && NEWS.owner();
  const now = () => Date.now() + skew;
  const fmt = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };
  function paint() {
    let trashN = 0;
    document.querySelectorAll('.card[data-id]').forEach(card => {
      if (card.closest('#pending,#trashed')) return;
      const r = D[card.dataset.id]; const st = r && (r.status === 'pending' && r.expires_at <= now() ? 'trashed' : r.status);
      card.classList.toggle('del-pending', owner() && st === 'pending');
      if (owner() && st === 'trashed') { card.hidden = true; card.dataset.trashed = '1'; return; }
      if (card.dataset.trashed) { delete card.dataset.trashed; card.hidden = false; }
      card.querySelector('.delstate')?.remove();
      const btn = card.querySelector('.del'); if (!btn) return;
      let und = card.querySelector('.undo');
      if (owner() && st === 'pending') {
        const left = r.expires_at - now(), p = Math.max(0, Math.min(1, left / H));
        card.style.setProperty('--fade', String(Math.max(0.25, p)));
        btn.style.setProperty('--p', p.toFixed(4));
        if (!btn.querySelector('.ring')) btn.insertAdjacentHTML('afterbegin', '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="trk" cx="18" cy="18" r="16"/><circle class="arc" cx="18" cy="18" r="16" pathLength="100"/></svg>');
        const t = `剩 ${fmt(left)} 进垃圾箱 · 再点加速（${r.clicks}/5）`;
        btn.title = t; btn.setAttribute('aria-label', '不感兴趣，' + t);
        if (!und) { und = document.createElement('button'); und.type = 'button'; und.className = 'undo'; und.title = '撤销'; und.setAttribute('aria-label', '撤销'); und.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'; btn.before(und); }
      } else {
        card.style.removeProperty('--fade'); btn.style.removeProperty('--p'); btn.querySelector('.ring')?.remove();
        btn.title = '不感兴趣：12 小时后进垃圾箱，连点加速'; btn.setAttribute('aria-label', '不感兴趣'); und?.remove();
      }
    });
    for (const r of Object.values(D)) if (r.status === 'trashed' && !r.purged_at) trashN++;  // 永久删除 rows stay hidden but leave the 垃圾箱 count
    document.querySelectorAll('.trashcount').forEach(c => { c.textContent = trashN ? String(trashN) : ''; c.dataset.n = trashN; });
    window.dispatchEvent(new CustomEvent('news-del', { detail: { D, now: now() } }));
  }
  async function call(body) {
    const r = await fetch(API, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: NEWS.auth({ 'content-type': 'application/json' }), body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status); const j = await r.json(); skew = j.now - Date.now(); return j;
  }
  async function pull() { if (!owner()) return; try { const j = await call(); D = j.items || {}; window.NEWS_DEL = { D, overrides: j.overrides || {}, call, pull, now, paint }; paint(); } catch { /* offline: keep */ } }
  function snapshot(card) { const d = card.dataset; return { title: d.title, module: d.module, source: d.src, date: d.date, url: d.url, tags: (d.tags || '').split(',').filter(Boolean), keys: (d.keys || '').split(' ').filter(Boolean) }; }
  document.addEventListener('click', async e => {
    const del = e.target.closest('.del'), und = e.target.closest('.undo');
    if (!(del || und) || !owner()) return;
    e.preventDefault(); e.stopPropagation();
    const card = e.target.closest('[data-id]'), id = card.dataset.id;
    try {
      const j = await call(del ? { action: 'click', id, snapshot: snapshot(card) } : { action: 'undo', id });
      D[id] = j.item;
      if (del && j.item?.status === 'trashed') { card.classList.add('collapsing'); await new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320)); card.classList.remove('collapsing'); }
      else if (del) { const b = card.querySelector('.del'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
      if (del && (NEWS.state[id] || {}).fav) NEWS.set(id, { fav: false }); // delete and favourite are mutually exclusive
      paint();
    } catch { alert('操作失败，请稍后再试'); }
  });
  addEventListener('news-fav', async e => { const { id, fav } = e.detail; if (fav && D[id]?.status === 'pending') { try { D[id] = (await call({ action: 'undo', id })).item; paint(); } catch {} } });
  addEventListener('news-state', () => { if (owner() && !Object.keys(D).length) pull(); else paint(); });
  setInterval(() => { if (owner() && Object.values(D).some(r => r.status === 'pending')) paint(); }, 30000);
  pull();
})();

// v3.1: muted looping videos play only while visible (and never with prefers-reduced-motion)
(() => {
  const vids = document.querySelectorAll('video[data-auto]'); if (!vids.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { vids.forEach(v => v.controls = true); return; }
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? e.target.play().catch(() => { e.target.controls = true; }) : e.target.pause()), { threshold: .35 });
  vids.forEach(v => io.observe(v));
})();

// v3.2 Arena strip: hidden scrollbar + snap; arrows page by one board, edge fades follow scroll position
document.querySelectorAll('.arena').forEach(a => {
  const t = a.querySelector('.boards'), [pv, nx] = a.querySelectorAll('.anav');
  const upd = () => { const s = t.scrollLeft < 4, e = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4; a.classList.toggle('at-start', s); a.classList.toggle('at-end', e); pv.disabled = s; nx.disabled = e; };
  const step = d => { const b = t.querySelector('.board'); t.scrollBy({ left: d * (b ? b.offsetWidth + 14 : t.clientWidth), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  pv.addEventListener('click', () => step(-1)); nx.addEventListener('click', () => step(1));
  t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } });
  t.addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
});

// v3.3 加信息源 (owner only): map a card to a collector source (X account / subreddit / feed / GH releases / HF org),
// show whether it already exists, and write the full config back to /api/sources (same auth + server validation). Toast with undo.
(() => {
  const owner = () => window.NEWS && NEWS.owner();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const API = (document.body.dataset.root || '') + 'api/sources';
  const api = async body => { const r = await fetch(API, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { ...NEWS.auth(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; };
  const norm = c => ({ disabled: [], removed: [], rsshub: [], x_keywords: [], x_accounts: [], feeds: [], subreddits: [], hf_orgs: [], x_groups: {}, ...c });
  const feedId = url => { const g = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\.atom$/i);
    return (g ? `gh-${g[1]}-${g[2]}` : 'u-' + url.replace(/^https:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')).toLowerCase().slice(0, 60); };
  // Candidates for a card: [{kind, key, label, sub, toggle, present, add(C, opts)}]
  async function candidates(card, D, C) {
    const src = card.dataset.source, label = card.dataset.src || '', url = card.dataset.url || '';
    const off = id => C.disabled.includes(id), out = [];
    const xm = label.match(/@(\w{1,15})$/);
    if (src === 'x' && xm) { const h = xm[1], a = C.x_accounts.find(a => (a.handle || a).toLowerCase?.() === h.toLowerCase() || String(a.handle || '').toLowerCase() === h.toLowerCase());
      out.push({ kind: 'x', label: '@' + h, sub: 'X 账号', present: !!a, enabled: a ? a.enabled : false, groups: [...new Set(['关注', ...C.x_accounts.map(a => a.group).filter(Boolean)])],
        add: (C, o) => { const e = C.x_accounts.find(a => a.handle.toLowerCase() === h.toLowerCase()); if (e) { e.enabled = true; } else C.x_accounts.unshift({ handle: h, name: '', enabled: true, from: 'manual', group: o.group || '关注' }); } }); }
    const rm = label.match(/^r\/(\w+)/);
    if (src === 'reddit' && rm) { const n = rm[1], inDef = (D.reddit?.feeds || []).some(f => f.subreddit.toLowerCase() === n.toLowerCase()), inC = C.subreddits.some(s => s.toLowerCase() === n.toLowerCase());
      const id = 'reddit:' + ((D.reddit?.feeds || []).find(f => f.subreddit.toLowerCase() === n.toLowerCase())?.subreddit || n);
      out.push({ kind: 'reddit', label: 'r/' + n, sub: 'Reddit 版块（new）', present: inDef || inC, enabled: !off(id), add: C => { C.disabled = C.disabled.filter(x => x !== id); if (!inDef && !C.subreddits.includes(n)) C.subreddits.push(n); } }); }
    const gh = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/?#]|$)/i);
    if (gh && !/^(orgs|topics|features|sponsors)$/i.test(gh[1])) { const f = `https://github.com/${gh[1]}/${gh[2]}/releases.atom`; out.push(feedCand(D, C, f, `${gh[1]}/${gh[2]}`, 'GitHub Releases（releases.atom）')); }
    const hf = url.match(/^https:\/\/huggingface\.co\/(?!datasets\/|spaces\/|blog\/|papers\/)([\w.-]+)\/[\w.-]+/i);
    if (src === 'hf' && hf) { const o = hf[1], id = 'hforg:' + o, inC = C.hf_orgs.some(x => x.toLowerCase() === o.toLowerCase());
      out.push({ kind: 'hf', label: o, sub: 'Hugging Face 组织（新模型）', present: inC, enabled: !off(id), add: C => { C.disabled = C.disabled.filter(x => x !== id); if (!inC) C.hf_orgs.push(o); } }); }
    if (src === 'rss' || src === 'rsshub') { const f = (D.rss || []).find(f => f.id === label) || C.feeds.find(f => f.id === label || f.label === label);
      const r = [...(D.rsshub?.routes || []), ...C.rsshub].find(r => r.id === label || r.label === label);
      const id = f ? 'rss:' + f.id : r ? 'rsshub:' + r.id : null;
      if (id) out.push({ kind: 'feed', label: label, sub: f ? 'RSS 订阅' : 'RSSHub 路由', present: true, enabled: !off(id), add: C => { C.disabled = C.disabled.filter(x => x !== id); } }); }
    if (!out.length && /^https:\/\//.test(url) && !gh && !hf) {
      const j = await api({ action: 'discover', url });
      for (const f of j.feeds || []) out.push(feedCand(D, C, f.url, f.label || j.host, 'RSS/Atom（页面自动发现）'));
      if (j.rsshub) { const r = j.rsshub, ex = [...(D.rsshub?.routes || []), ...C.rsshub].find(x => x.route === r.route);
        out.push({ kind: 'rsshub', label: r.label, sub: 'RSSHub ' + r.route, present: !!ex && !C.removed.includes(ex.id), enabled: ex ? !off('rsshub:' + ex.id) : false,
          add: C => { if (ex) { C.disabled = C.disabled.filter(x => x !== 'rsshub:' + ex.id); C.removed = C.removed.filter(x => x !== ex.id); } else C.rsshub.push({ id: 'rsshub-u-' + r.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40), route: r.route, label: r.label }); } }); }
      if (!out.length) out.push({ kind: 'none', label: j.host || '', sub: j.error ? '无法读取该页面' : '没找到 RSS/Atom，也没有已知的 RSSHub 路由', present: false, none: true });
    }
    return out;
  }
  function feedCand(D, C, furl, label, sub) {
    const id = feedId(furl), def = (D.rss || []).find(f => f.url === furl), mine = C.feeds.find(f => f.url === furl || f.id === id), tid = 'rss:' + (def?.id || mine?.id || id);
    return { kind: 'feed', label, sub, url: furl, present: !!(def || mine), enabled: !C.disabled.includes(tid),
      add: C => { C.disabled = C.disabled.filter(x => x !== tid); if (!def && !C.feeds.some(f => f.url === furl)) C.feeds.push({ id, url: furl, label: String(label).slice(0, 40) }); } };
  }
  let pop = null, toastT;
  const close = () => { if (pop) { pop.btn.setAttribute('aria-expanded', 'false'); pop.el.remove(); pop = null; } };
  function toast(msg, undo) {
    document.querySelector('.ntoast')?.remove(); clearTimeout(toastT);
    const t = document.createElement('div'); t.className = 'ntoast'; t.dataset.ixh = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<i class="tdot" aria-hidden="true">·</i><button type="button" class="undo-src" aria-label="撤销"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.8 6.5h6.7a4 4 0 0 1 0 8H7"/></svg>撤销</button>' : ''}`;
    document.body.append(t); requestAnimationFrame(() => t.classList.add('in'));
    if (undo) t.querySelector('button').onclick = async () => { t.querySelector('button').disabled = true; try { await undo(); toast('已撤销'); } catch (e) { toast('撤销失败：' + e.message); } };
    toastT = setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 6000);
  }
  // One owner ＋ button morphs into an icon island: 少推这类 · 加信息源 · 深挖这条 · 自由指令 (input morph) | 不感兴趣. Icon-first, keyboard + touch.
  const IC = { down: '<svg viewBox="0 0 16 16"><path d="M5.2 2.6h5.9c.7 0 1.3.5 1.4 1.2l.8 4.4c.2.8-.5 1.6-1.3 1.6H9l.5 2.4c.2.9-.5 1.6-1.3 1.6L5.2 9.4z"/><path d="M5.2 2.6H2.6v6.8h2.6"/></svg>',
    src: '<svg viewBox="0 0 16 16"><path d="M3 3.5a9.5 9.5 0 0 1 9.5 9.5M3 7.5A5.5 5.5 0 0 1 8.5 13"/><circle cx="3.6" cy="12.4" r="1.2"/><path d="M12 1.5v5M9.5 4h5"/></svg>',
    dig: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14M7 5v4M5 7h4"/></svg>',
    cmd: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.3 3.6 3.6 1.3-3.6 1.3L8 11.6 6.7 8 3.1 6.7l3.6-1.3z"/><path d="M12.5 11v3.5M10.8 12.8h3.4"/></svg>',
    send: '<svg viewBox="0 0 16 16"><path d="M2.5 8h10M8.5 4l4 4-4 4"/></svg>' };
  const AGENT = (document.body.dataset.root || '') + 'api/agent-task';
  let agentOn = null;   // GET /api/agent-task → configured; 深挖 / 自由指令 are hidden when no webhook is set
  const agentCfg = () => agentOn ??= fetch(AGENT, { headers: NEWS.auth() }).then(r => r.json()).then(j => !!j.configured).catch(() => false);
  async function agent(card, action, text = '') {
    const d = card.dataset, body = { action, id: d.id, title_zh: d.title, title: card.querySelector('.orig')?.textContent.replace(/^\s*原标题\s*/, '') || d.title, url: d.url, source: d.src, date: d.date, text };
    const r = await fetch(AGENT, { method: 'POST', headers: { ...NEWS.auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.configured === false ? '未配置 webhook（AGENT_WEBHOOK_URL）' : j.error || r.status); return j;
  }
  function open(btn) {
    close(); const card = btn.closest('.card');
    const el = document.createElement('div'); el.className = 'acti'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', '更多操作');
    const down = (NEWS.state[card.dataset.id] || {}).vote === -1, dl = down ? '已少推这类（点击取消）' : '少推这类';
    el.innerHTML = `<button type="button" role="menuitemcheckbox" aria-checked="${down}" data-a="down" class="adown${down ? ' on' : ''}" title="${dl}" aria-label="${dl}">${IC.down}</button><button type="button" role="menuitem" data-a="src" title="加信息源" aria-label="加信息源">${IC.src}</button><button type="button" role="menuitem" data-a="dig" title="深挖这条" aria-label="深挖这条">${IC.dig}</button><button type="button" role="menuitem" data-a="cmd" title="自由指令" aria-label="自由指令">${IC.cmd}</button><span class="asep" role="separator" aria-orientation="vertical"></span><button type="button" role="menuitem" data-a="del" class="adel" title="不感兴趣" aria-label="不感兴趣">✕</button>`;
    agentCfg().then(on => { if (!on) el.querySelectorAll('[data-a=dig],[data-a=cmd]').forEach(b => b.remove()); });
    btn.closest('.acts').append(el); pop = { el, btn }; btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => el.classList.add('in')); el.querySelector('button').focus();
    el.addEventListener('keydown', e => { const bs = [...el.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]?.focus(); } });
    el.onclick = async e => { const b = e.target.closest('button[data-a]'); if (!b) return; e.stopPropagation();
      if (b.dataset.a === 'src') return openSources(btn);
      // 少推这类: vote -1 (replaces a ♥). The card stays where it is — no hiding, no tucking; undo restores the previous vote.
      if (b.dataset.a === 'down') { const id = card.dataset.id, was = (NEWS.state[id] || {}).vote || 0; close();
        if (was === -1) { NEWS.vote(id, 0); toast('已取消少推', () => NEWS.vote(id, -1)); } else { NEWS.vote(id, -1); toast('已记下：少推这类', () => NEWS.vote(id, was)); } return; }
      if (b.dataset.a === 'del') { close(); card.querySelector('.del')?.click(); return; }
      if (b.dataset.a === 'dig') { b.disabled = true; b.classList.add('busy'); try { await agent(card, 'deep_dive'); close(); toast('已发送到 webhook'); } catch (er) { close(); toast(er.message); } return; }
      if (b.dataset.a === 'cmd') { el.classList.add('wide'); el.setAttribute('role', 'dialog');
        el.innerHTML = `<form class="acmd"><input name="t" maxlength="1000" required placeholder="对这条说点什么…" aria-label="自由指令" autocomplete="off"><button class="go" aria-label="发送" title="发送">${IC.send}</button></form>`;
        const f = el.querySelector('form'), inp = f.t; inp.focus();
        f.onsubmit = async ev => { ev.preventDefault(); const t = inp.value.trim(); if (!t) return; f.querySelector('.go').disabled = true; try { await agent(card, 'command', t); close(); toast('已发送到 webhook'); } catch (er) { f.querySelector('.go').disabled = false; toast(er.message); } }; } };
  }
  async function openSources(btn) {
    close(); const card = btn.closest('.card');
    const el = document.createElement('div'); el.className = 'srcpop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '加信息源');
    el.innerHTML = '<p class="sp-h">加信息源</p><p class="sp-l">查找中…</p>'; card.append(el); pop = { el, btn }; btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect(), cr = card.getBoundingClientRect();
    el.style.right = Math.max(8, cr.right - r.right - 6) + 'px'; el.style.bottom = (cr.bottom - r.top + 8) + 'px';
    let j, cs;
    try { j = await api(); const C = norm(j.config); cs = await candidates(card, j.defaults, C); pop && (pop.C = C, pop.D = j.defaults); }
    catch (e) { el.innerHTML = `<p class="sp-h">加信息源</p><p class="sp-l bad">读取失败：${esc(e.message)}</p>`; return; }
    if (!pop || pop.el !== el) return;
    el.innerHTML = `<p class="sp-h">加信息源</p><ul class="sp-list">${cs.map((c, i) => `<li><div class="sp-t"><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></div>${c.none ? '' : c.present && c.enabled ? '<span class="sp-ok">已在信息源</span>'
      : `${c.groups ? `<select class="sp-g" aria-label="分组">${c.groups.map(g => `<option>${esc(g)}</option>`).join('')}</select>` : ''}<button type="button" class="sp-add" data-i="${i}">${c.present ? '已在 · 启用' : '添加'}</button>`}</li>`).join('')}</ul><a class="sp-more" href="${esc((document.body.dataset.root || '') + 'sources.html')}">管理信息源 →</a>`;
    el.querySelector('.sp-add')?.focus();
    el.onclick = async e => { const b = e.target.closest('.sp-add'); if (!b) return; e.stopPropagation(); b.disabled = true; const c = cs[+b.dataset.i];
      const before = JSON.parse(JSON.stringify(pop.C)), next = JSON.parse(JSON.stringify(pop.C));
      c.add(next, { group: b.parentElement.querySelector('.sp-g')?.value });
      try { await api({ action: 'config', config: next }); close(); toast(`${c.present ? '已启用' : '已添加'} ${c.label}，下次采集生效`, () => api({ action: 'config', config: before })); }
      catch (er) { b.disabled = false; toast('保存失败：' + er.message); } };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.card .adds');
    if (b && owner()) { e.preventDefault(); e.stopPropagation(); return pop?.btn === b ? close() : open(b); }
    if (pop && !e.target.closest('.srcpop,.acti')) close();
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { const b = pop.btn; close(); b.focus(); } });
})();

// 今日提示词: one-click copy (everyone, no network)
document.addEventListener('click', async e => {
  const b = e.target.closest('.prompt .cp'); if (!b) return; e.preventDefault(); e.stopPropagation();
  const text = b.closest('.prompt').querySelector('pre').textContent;
  try { await navigator.clipboard.writeText(text); } catch { const r = document.createRange(); r.selectNodeContents(b.closest('.prompt').querySelector('pre')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges(); }
  b.textContent = '已复制'; setTimeout(() => { b.textContent = '复制'; }, 1600);
  document.querySelector('.ntoast')?.remove(); const t = document.createElement('div'); t.className = 'ntoast'; t.dataset.ixh = 'toast'; t.setAttribute('role', 'status'); t.textContent = '已复制'; document.body.append(t);
  requestAnimationFrame(() => t.classList.add('in')); setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 1800);
});
// v3.5.2 shelf (owner + guest since 10-20; v3.5.5 wording "已收起"): a card tucked away with the tray button (or a mobile left swipe) leaves the
// layout and parks in a "已收起 N 条" bar at the bottom of its section; the other cards move up so lead/side/grid never have holes.
// The bar expands into a compact list; tapping a row (or its 放回 button) puts the card back home. FLIP-animated.
(() => {
  const mods = [...document.querySelectorAll('main .module')].filter(m => m.querySelector('.card[data-id]')); if (!mods.length) return;
  const VAR = ['lead', 'feature', 'noimg', 'mini', 'wide', 'std', 'peek', 'promoted'], OK = 'news-seen-open';
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let open = {}; try { open = JSON.parse(localStorage.getItem(OK)) || {}; } catch {}
  const esc = t => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const srcName = c => { const e = c.querySelector('.meta .src'); if (!e) return ''; const x = e.cloneNode(true); x.querySelectorAll('.yb,.av,i,svg').forEach(n => n.remove()); return x.textContent.trim(); };
  const ck = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.6 2.6 3.4 3.4 3.4-3.4M4.6 13.4 8 10l3.4 3.4"/></svg>', up = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.6 6 3.4-3.4L11.4 6M4.6 10 8 13.4l3.4-3.4"/></svg>';
  const S = mods.map(m => {
    const ed = m.querySelector('.ed'), L = ed?.querySelector('.ed-lead'), Sd = ed?.querySelector('.ed-side');
    let M = m.querySelector('.ed-more');
    if (ed && !M) { M = document.createElement('div'); M.className = 'ed-more'; M.hidden = true; ed.after(M); }
    const flat = !ed && m.querySelector('.card[data-id]').parentElement;
    const cards = [...m.querySelectorAll('.card[data-id]')]; cards.forEach(c => { c.dataset.v0 = VAR.filter(k => c.classList.contains(k)).join(' '); });
    const box = document.createElement('div'); box.className = 'seen'; box.hidden = true;
    box.innerHTML = `<button class="shbar" type="button" aria-expanded="false"><span class="sck">${ck}</span><span class="stx">已收起 <b>0</b> 条</span><span class="sop">展开</span></button><ol class="slist" hidden></ol><div class="park" hidden></div>`;
    (M || flat).after(box);
    return { m, id: m.id, ed, L, Sd, M, flat, cards, nSide: Sd ? Sd.querySelectorAll('.card').length : 0, box, bar: box.querySelector('.shbar'), list: box.querySelector('.slist'), park: box.querySelector('.park') };
  });
  const mScore = c => c.querySelector(':scope > .pic.vid') ? 3 : c.querySelector(':scope > .gal') ? 2 : c.querySelector(':scope > .pic:not(.logo)') ? 1 : 0;
  const isBig = c => mScore(c) >= 2;
  // v3.6 phones (X-like): a card with a picture/video/gallery is always a big card, a text-only card is always a small row.
  const MQ = matchMedia('(max-width:640px)'), phone = () => MQ.matches;
  const setVar = (c, slot) => {
    if (slot === 'lead') { const has = mScore(c) > 0; c.classList.remove(...VAR); c.classList.add('lead', 'feature', ...(has ? [] : ['noimg'])); return; }
    if (slot === 'side') { c.classList.remove(...VAR); c.classList.add('mini'); return; }
    if (phone()) { c.classList.remove(...VAR); c.classList.add(mScore(c) > 0 ? (isBig(c) ? 'wide' : 'std') : 'mini'); return; }
    const v0 = (c.dataset.v0 || '').split(' ').filter(Boolean);
    const wide = isBig(c) || v0.includes('wide');
    c.classList.remove(...VAR); c.classList.add(wide ? 'wide' : 'std');
  };
  // v3.6 desktop "peek" (attention): a side-list card with a still image can open its picture at full column width in place.
  // At most one per section (opening another closes the previous). The side column may never grow taller than the lead: the
  // picture is height-capped to fit, and if even a 160px picture would not fit the card moves to the top of the grid as a wide
  // card instead (manual only). With no manual choice, the section's first (highest-ranked) image row auto-opens when the side
  // column has ≥140px of spare height next to the lead. Sequence numbers play no part.
  const PEEK = {}, PMIN = 160, PAUTO = 140;
  const peekable = c => !!c.querySelector(':scope > .pic:not(.logo):not(.vid):not(.broken)');
  const natH = el => { const c = el.querySelector(':scope > .card'); if (!c) return 0; const a = el.style.alignSelf, h = c.style.height; el.style.alignSelf = 'start'; c.style.height = 'auto'; const r = el.getBoundingClientRect().height; el.style.alignSelf = a; c.style.height = h; return r; };
  const peekBtn = c => { const pic = c.querySelector(':scope > .pic'); if (!pic || pic.querySelector('.pk')) return; pic.style.setProperty('--ar', pic.style.aspectRatio || '16 / 9');
    pic.insertAdjacentHTML('beforeend', '<button class="pk" type="button" aria-expanded="false" aria-label="看大图" title="看大图"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg></button>'); };
  const paintPk = c => { const b = c.querySelector(':scope > .pic .pk'); if (!b) return; const on = c.classList.contains('peek'); b.setAttribute('aria-expanded', String(on)); b.title = on ? '收起大图' : '看大图'; b.setAttribute('aria-label', b.title);
    b.innerHTML = on ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 6.5h-4v-4M9.5 6.5 14 2M2.5 9.5h4v4M6.5 9.5 2 14"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>'; };
  function applyPeek(s, side, more) {
    for (const c of s.cards) { if (c.classList.contains('peek') && !side.includes(c) && !more.includes(c)) c.classList.remove('peek', 'promoted'); c.style.removeProperty('--peek-h'); }
    if (phone() || !s.ed || !s.Sd || s.Sd.hidden || s.L.hidden) { side.forEach(c => c.classList.remove('peek')); return; }
    side.forEach(c => { if (peekable(c)) peekBtn(c); else c.querySelector(':scope > .pic .pk')?.remove(); c.classList.remove('peek'); });
    const st = PEEK[s.id] || {}, want = st.id ? s.cards.find(c => c.dataset.id === st.id && !c.hidden && (side.includes(c) || more.includes(c))) : null;
    const leadH = natH(s.L), sideH0 = s.Sd.getBoundingClientRect().height;
    let c = want && peekable(want) ? want : null, auto = false;
    if (!c && !st.user && leadH - sideH0 >= PAUTO) { c = side.find(peekable) || null; auto = true; }
    if (!c) return;
    if (more.includes(c)) return;  // already a grid card: its picture is shown in full anyway
    c.classList.add('peek'); const pic = c.querySelector(':scope > .pic'), sideH = s.Sd.getBoundingClientRect().height, ph = pic.getBoundingClientRect().height;
    if (sideH <= leadH + 1) return;
    const cap = Math.floor(ph - (sideH - leadH)) - 1;
    if (cap >= PMIN) { c.style.setProperty('--peek-h', cap + 'px'); return; }
    c.classList.remove('peek');
    if (auto) return;
    // not enough room beside the lead: promote it to the top of the grid as a wide card (side rows move up, no holes)
    side.splice(side.indexOf(c), 1); more.unshift(c); setVar(c, 'more'); c.classList.add('peek', 'promoted', 'wide'); c.classList.remove('std');
    place(s.Sd, side); place(s.M, [...more, ...[...s.M.children].filter(x => !more.includes(x))]); s.M.hidden = false; s.Sd.hidden = !side.length; s.ed.classList.toggle('nolead', !side.length);
  }
  const place = (box, arr) => arr.forEach((c, i) => { if (box.children[i] !== c) { c.style.animation = 'none'; box.insertBefore(c, box.children[i] || null); } });
  const paintBar = s => { const n = s.park.querySelectorAll('.card:not([hidden])').length, o = !!open[s.id] && n > 0;
    s.box.hidden = !n; s.box.classList.toggle('open', o); s.box.dataset.n = Math.min(n, 3); s.bar.setAttribute('aria-expanded', String(o));
    s.bar.querySelector('b').textContent = n; s.bar.querySelector('.sop').textContent = o ? '收起' : '展开'; s.list.hidden = !o; };
  let busy = false, ready = false;
  const reflow = () => { busy = true; mo.disconnect();
    const anim = ready && !still(), first = new Map(), ghosts = [];
    if (anim) for (const s of S) for (const c of s.cards) if (c.offsetParent) first.set(c, c.getBoundingClientRect());
    for (const s of S) {
      const parked = c => c.classList.contains('read'), live = s.cards.filter(c => !parked(c) && !c.hidden), hid = s.cards.filter(c => !parked(c) && c.hidden), pk = s.cards.filter(parked);
      const barR = anim && s.box.hidden === false ? s.bar.getBoundingClientRect() : null;
      for (const c of pk) { if (c.parentElement !== s.park) { if (anim && first.has(c)) ghosts.push([c, first.get(c), s]); c.classList.remove('fill', 'half'); s.park.appendChild(c); } }
      if (s.ed) {
        // media-aware: best media → lead; video/gallery never mini; fix noimg on imaged leads
        let bi = 0, br = -1; live.forEach((c, i) => { const r = mScore(c); if (r > br) { br = r; bi = i; } });
        const lead = live.length ? [live[bi]] : [], rest = live.filter((_, i) => i !== bi);
        const side = [], more = [];
        for (const c of rest) { if (!phone() && side.length < s.nSide && !isBig(c)) side.push(c); else more.push(c); }
        lead.forEach(c => setVar(c, 'lead')); side.forEach(c => setVar(c, 'side')); more.forEach(c => setVar(c, 'more')); hid.forEach(c => { if (!s.L.contains(c) && !s.Sd.contains(c)) setVar(c, 'more'); });
        place(s.L, lead); place(s.Sd, side); place(s.M, [...more, ...hid.filter(c => !s.L.contains(c) && !s.Sd.contains(c))]);
        s.L.hidden = !lead.length; s.Sd.hidden = !side.length; s.ed.hidden = !live.length; s.ed.classList.toggle('nolead', !lead.length || !side.length);
        s.M.hidden = !more.length; applyPeek(s, side, more); s.cards.forEach(paintPk);
        // no half-empty grid rows: std cards left over before a wide card (or at the end) stretch to fill the row. Cards per row come from the
        // layout (--ix-per: 2 editorial, 3 bento, 1 timeline); 1 left → .fill (whole row), 2 left of 3 → .half each.
        const per = Math.max(1, parseInt(getComputedStyle(s.M).getPropertyValue('--ix-per'), 10) || 2); let row = [];
        const close = () => { if (row.length && row.length < per) { if (row.length === 1) row[0].classList.add('fill'); else row.forEach(x => x.classList.add('half')); } row = []; };
        for (const c of s.M.querySelectorAll(':scope>.card')) { c.classList.remove('fill', 'half'); if (c.hidden) continue; if (c.classList.contains('wide')) close(); else { row.push(c); if (row.length === per) row = []; } }
        close();
      } else place(s.flat, [...live, ...hid]);
      s.list.innerHTML = pk.filter(c => !c.hidden).map(c => `<li data-sid="${esc(c.dataset.id)}"><button class="su" type="button" aria-label="放回" title="放回">${up}</button><a href="#${esc(c.dataset.id)}">${esc(c.querySelector('h3')?.textContent.trim() || '')}</a><small>${esc(srcName(c))}</small></li>`).join('');
      paintBar(s); s.barR = barR || (anim && !s.box.hidden ? s.bar.getBoundingClientRect() : null);
    }
    if (anim) {
      for (const s of S) for (const c of s.cards) { if (!c.offsetParent) continue; const r = c.getBoundingClientRect(), f = first.get(c);
        if (f) { const dx = f.left - r.left, dy = f.top - r.top; if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' }); }
        else { const b = s.barR || s.bar.getBoundingClientRect(); c.animate([{ transform: `translateY(${Math.max(-240, Math.min(240, b.top - r.top))}px) scale(.94)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }); } }
      for (const [c, f, s] of ghosts) { const g = c.cloneNode(true); g.removeAttribute('id'); g.querySelectorAll('[id],iframe,video,audio').forEach(e => e.matches('iframe,video,audio') ? e.remove() : e.removeAttribute('id'));
        Object.assign(g.style, { position: 'fixed', left: f.left + 'px', top: f.top + 'px', width: f.width + 'px', height: f.height + 'px', margin: 0, zIndex: 60, pointerEvents: 'none', animation: 'none', overflow: 'hidden', transform: '' });
        g.classList.add('sghost'); document.body.appendChild(g); const b = s.bar.getBoundingClientRect(), dy = b.top - f.top;
        g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.left - f.left}px,${Math.max(-400, Math.min(400, dy))}px) scale(${Math.max(.3, b.width / f.width)},${Math.max(.08, b.height / f.height)})`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => g.remove(); }
    }
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] }); busy = false; };
  let raf = 0; const mo = new MutationObserver(recs => { if (busy || raf) return; if (recs.every(r => { const cl = r.target.classList; return cl?.contains('sghost') || cl?.contains('pk'); })) return; raf = requestAnimationFrame(() => { raf = 0; reflow(); }); });
  for (const s of S) {
    s.bar.addEventListener('click', () => { open[s.id] = !open[s.id]; if (!open[s.id]) delete open[s.id]; localStorage.setItem(OK, JSON.stringify(open)); paintBar(s); });
    s.list.addEventListener('click', e => { const li = e.target.closest('li'); if (!li || !e.target.closest('a,.su')) return; e.preventDefault(); const id = li.dataset.sid, go = !!e.target.closest('a');
      window.dispatchEvent(new CustomEvent('news-unread', { detail: { id } }));
      if (go) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' }), 60); });
  }
  reflow(); ready = true; window.addEventListener('news-state', () => requestAnimationFrame(reflow));
  // late layout (pictures, web fonts) changes the lead/side heights the peek cap and auto-open were computed from: re-run once they settle
  let lz = 0; const late = () => { clearTimeout(lz); lz = setTimeout(() => requestAnimationFrame(reflow), 120); };
  if (document.readyState !== 'complete') addEventListener('load', late, { once: true });
  document.fonts?.ready?.then(late);
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG' && e.target.closest('.ed')) late(); }, true);
  // peek toggle: the ⤡ badge or the thumbnail itself (desktop); one per section; closing it also stops the auto-open there
  document.addEventListener('click', e => { if (phone()) return; const t = e.target.closest('.card.mini > .pic, .card.promoted > .pic'); if (!t || !t.querySelector('.pk')) return;
    const c = t.closest('.card'), s = S.find(x => x.cards.includes(c)); if (!s) return; e.preventDefault(); e.stopPropagation();
    const on = c.classList.contains('peek'); PEEK[s.id] = { id: on ? null : c.dataset.id, user: true }; reflow();
    if (!on && c.classList.contains('promoted')) c.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' }); });
  MQ.addEventListener?.('change', () => requestAnimationFrame(reflow));
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(reflow, 200); });
})();

// image load failure → .pic.broken (no grey broken-icon box)
(() => {
  const mark = img => { const p = img.closest('.pic, .gal'); if (p) p.classList.add('broken'); img.hidden = true; };
  const scan = root => { (root || document).querySelectorAll?.('.card .pic img, .card .gal img')?.forEach(img => {
    if (img.dataset.brk) return; img.dataset.brk = '1';
    img.addEventListener('error', () => mark(img));
    if (img.complete && !img.naturalWidth) mark(img);
  }); };
  scan(); addEventListener('DOMContentLoaded', () => scan());
  new MutationObserver(m => { for (const r of m) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n); }).observe(document.documentElement, { childList: true, subtree: true });
})();

// v3.6.1 phone tab bar (DESIGN-RULES §11): hide on scroll down, show on scroll up / near top / near the end; 更多 sheet with sync status.
(() => {
  const tb = document.querySelector('.tabbar'); if (!tb) return;
  const body = document.body, more = tb.querySelector('.more'), sh = document.querySelector('.msheet'), scrim = document.querySelector('.mscrim');
  const hide = h => body.classList.toggle('tb-hide', h);
  let y0 = scrollY, acc = 0;
  addEventListener('scroll', () => { const y = scrollY, d = y - y0; y0 = y; const end = document.documentElement.scrollHeight - innerHeight;
    if (y < 80 || y > end - 140 || (sh && !sh.hidden)) { acc = 0; return hide(false); }
    acc = acc * d > 0 ? acc + d : d; if (acc > 28) hide(true); else if (acc < -14) hide(false); }, { passive: true });
  if (!more || !sh) return;
  const rel = t => { const s = (Date.now() - t) / 1000; return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const paintSync = () => { const st = window.NEWS_SYNC, el = sh.querySelector('.synctxt');
    el.textContent = !st ? '未同步' : st.cls === 'ok' ? `已同步 · ${rel(st.at)}` : '离线，仅存本机';
    more.setAttribute('aria-label', '更多（' + el.textContent + '）'); };
  const open = v => { sh.hidden = !v; scrim.hidden = !v; more.setAttribute('aria-expanded', String(v)); body.classList.toggle('msheet-open', v); if (v) { paintSync(); hide(false); sh.querySelector('a,button')?.focus({ preventScroll: true }); } };
  more.addEventListener('click', e => { e.stopPropagation(); open(sh.hidden); });
  scrim.addEventListener('click', () => open(false));
  sh.addEventListener('click', e => { if (e.target.closest('.exit')) setTimeout(() => open(false), 0); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sh.hidden) { open(false); more.focus(); } });
  addEventListener('news-sync', paintSync); addEventListener('news-state', () => { if (!body.classList.contains('owner')) open(false); });
  paintSync();
})();

// 顶栏菜单 (DESIGN-RULES §11, zip avatar menu): 订阅源 · 模型 · 偏好与主题 · 学到的偏好 | 垃圾箱 · MCP | 退出, plus the sync line.
// Opens on click, closes on outside click / Esc / picking an item; fades + scales in (none under reduced motion).
(() => {
  const um = document.querySelector('.umenu'); if (!um) return;
  const b = um.querySelector('.avatar'), p = um.querySelector('.umenu-pop'), RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = () => [...p.querySelectorAll('a,button')].filter(e => e.offsetParent);
  const rel = t => { const s = (Date.now() - t) / 1000; return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const paintSync = () => { const st = window.NEWS_SYNC, el = p.querySelector('.synctxt'); if (el) el.textContent = !st ? '未同步' : st.cls === 'ok' ? `已同步 · ${rel(st.at)}` : '离线，仅存本机'; };
  const set = v => { if (v === !p.hidden && !p.classList.contains('out')) return; b.setAttribute('aria-expanded', String(v)); um.classList.toggle('open', v); clearTimeout(p._t);
    if (v) { p.classList.remove('out'); p.hidden = false; paintSync(); } else if (p.hidden) return; else if (RM()) p.hidden = true; else { p.classList.add('out'); p._t = setTimeout(() => { p.hidden = true; p.classList.remove('out'); }, 150); } };
  b.addEventListener('click', e => { e.stopPropagation(); set(p.hidden); if (!p.hidden && !e.detail) items()[0]?.focus({ preventScroll: true }); });  // keyboard open → first item; mouse open leaves focus on the avatar
  document.addEventListener('click', e => { if (!um.contains(e.target)) set(false); });
  p.addEventListener('click', e => { if (e.target.closest('a,button')) set(false); });
  um.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); b.focus(); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !p.hidden) { e.preventDefault(); const it = items(), i = it.indexOf(document.activeElement); it[(i + (e.key === 'ArrowDown' ? 1 : it.length - 1)) % it.length]?.focus(); } });
  addEventListener('news-sync', paintSync);
})();
