// 减少动效 (themes.html toggle): loaded synchronously in <head>. localStorage news-rm = '1' forces reduced motion on top of the system setting —
// html.dd-rm turns off CSS animation/transition (cal.css) and every matchMedia('(prefers-reduced-motion: reduce)') check in our scripts reads true.
(function () {
  var H = document.documentElement, K = 'news-rm', mm = window.matchMedia && window.matchMedia.bind(window);
  var on = function () { try { return localStorage.getItem(K) === '1'; } catch (e) { return false; } };
  if (on()) H.classList.add('dd-rm');
  var fake = function (q) { return { matches: true, media: q, onchange: null, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } }; };
  if (mm) window.matchMedia = function (q) { return /prefers-reduced-motion\s*:\s*reduce/.test(String(q)) && H.classList.contains('dd-rm') ? fake(q) : mm(q); };
  window.NDMotion = {
    forced: function () { return H.classList.contains('dd-rm'); },
    system: function () { return !!(mm && mm('(prefers-reduced-motion: reduce)').matches); },
    set: function (v) { try { v ? localStorage.setItem(K, '1') : localStorage.removeItem(K); } catch (e) {} H.classList.toggle('dd-rm', !!v); try { window.dispatchEvent(new Event('news-motion')); } catch (e) {} }
  };
})();

// 页面切换动效 (every page change; same as design.lthero.com's issue navigation): the old page drifts away against the direction of travel
// and the new one drifts in from the other side (slide + fade + blur, style.css); date digits / calendar / hero title glide in place as shared
// elements; header / phone tab bar / 设置 side nav stay put. Direction = date order between editions (later → from the right), else nav order
// (最新 → 往期 → 收藏 → 设置 …). Chrome / Edge / Safari 18.2+: cross-document View Transitions (old + new page animate together, no blank gap,
// nothing waits on the network). Others: the new page drifts in. Off with the system's reduced motion, 减少动效 (html.dd-rm) or
// 页面切换动效 off (localStorage news-pt = '0', the key the old 翻书换页 switch used).
(function () {
  var H = document.documentElement, PK = 'news-pt', ORDER = ['ed', 'archive', 'favorites', 'trash', 'sources', 'models', 'settings', 'themes', 'prefs', 'mcp-admin'];
  var off = function () { try { if (localStorage.getItem(PK) === '0') return true; } catch (e) {} return H.classList.contains('dd-rm') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  // page key: editions → { ed: date } (the newest edition / index = '9999'), others → their file name
  var key = function (u) { try { u = new URL(u, location.href); } catch (e) { return null; } if (u.origin !== location.origin) return null;
    var p = u.pathname.replace(/\.html$/, '').replace(/\/$/, '/index'), m = p.match(/(\d{4}-\d{2}-\d{2})$/), n = p.split('/').pop();
    if (m) return { k: 'ed', d: m[1], p: p }; if (n === 'index' || n === '') return { k: 'ed', d: '9999', p: p }; return { k: n, d: '', p: p }; };
  var dirOf = function (from, to) { var a = key(from), b = key(to); if (!a || !b || a.p === b.p) return '';
    if (a.k === 'ed' && b.k === 'ed') return b.d > a.d ? 'next' : 'prev';
    var i = ORDER.indexOf(a.k), j = ORDER.indexOf(b.k); return (j < 0 ? 99 : j) < (i < 0 ? 99 : i) ? 'prev' : 'next'; };
  var KEEP = [['header.top', 'pt-top'], ['.tabbar', 'pt-tab'], ['.cside', 'pt-side'], ['.calbox .cal', 'pt-cal'], ['.hero h1', 'pt-title']];  // (.calbox .roll is dd-date in cal.css)
  var name = function (on) { KEEP.forEach(function (k) { var e = document.querySelector(k[0]); if (e) e.style.viewTransitionName = on ? k[1] : ''; }); };
  // where we came from: the old page notes its URL on the way out (pages are no-referrer, and navigation.activation.from is often null)
  var FK = 'news-pt-from', note = function () { try { sessionStorage.setItem(FK, JSON.stringify({ u: location.href, t: Date.now() })); } catch (e) {} };
  var fromUrl = function () { var a = window.navigation && navigation.activation; if (a && a.from && a.from.url) return a.from.url;
    try { var o = JSON.parse(sessionStorage.getItem(FK) || 'null'); if (o && Date.now() - o.t < 15000) return o.u; } catch (e) {} return ''; };
  addEventListener('pagehide', note);
  window.NDTurn = { off: off, dir: dirOf, set: function (on) { try { on ? localStorage.removeItem(PK) : localStorage.setItem(PK, '0'); } catch (e) {} } };
  // old page: bars + shared elements out of the root snapshot (or skip the whole thing)
  addEventListener('pageswap', function (e) { note(); if (!e.viewTransition) return; var to = e.activation && e.activation.entry && e.activation.entry.url;
    if (off() || (to && !dirOf(location.href, to))) { e.viewTransition.skipTransition(); return; } name(true); });
  addEventListener('pageshow', function (e) { if (e.persisted) { name(false); H.classList.remove('pt-in', 'pt-vt'); } });
  var VT = 'onpagereveal' in window && window.CSS && CSS.supports && CSS.supports('view-transition-name: a');
  if (VT) addEventListener('pagereveal', function (e) { var vt = e.viewTransition; if (!vt) return; var d = dirOf(fromUrl(), location.href);
    if (off() || !d) { vt.skipTransition(); return; }
    H.dataset.pt = d; H.classList.add('pt-vt'); if (document.body) name(true); else document.addEventListener('DOMContentLoaded', function () { name(true); }, { once: true });
    vt.finished.finally(function () { H.classList.remove('pt-vt'); delete H.dataset.pt; name(false); }); });
  else { // fallback: the new page drifts in (no waiting on the old one)
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {}, f0 = fromUrl(), d0 = nav.type === 'navigate' && f0 ? dirOf(f0, location.href) : '';
    if (d0 && !off()) { H.dataset.pt = d0; H.classList.add('pt-in'); setTimeout(function () { H.classList.remove('pt-in'); delete H.dataset.pt; }, 600); } }
})();
