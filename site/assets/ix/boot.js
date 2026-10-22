// Shared ix boot (contract v1, README.md). Loaded synchronously in <head> right after <script type="application/json" id="ix-data">.
// Data: { up: root prefix, ok: { slot: { variant: { css?, js?, h } } } (healthy variants only), eds: { id: { theme, arch, slots, css?, h? } }, ed: pinned id }.
// The build already put the pinned edition on <html> (data-ed, data-ix-<slot>) and its CSS as <link id="ix-<slot>">/<link id="ix-ed">, so a normal
// visit never flashes. Here: ?ed=<id> (preview another edition) and ?ix=slot:variant[,slot:default] overrides, JS variants, runtime fallback
// (window.ddIxFail(slot) → back to default), and the direction types (ix-next / ix-prev) for cross-document page transitions.
(function () {
  var H = document.documentElement, X = {}; try { X = JSON.parse(document.getElementById('ix-data').textContent); } catch (e) { return; }
  var ok = X.ok || {}, eds = X.eds || {}, up = X.up || '', fails = window.__ddIxFail = window.__ddIxFail || []; window.__ddIx = window.__ddIx || [];
  var link = function (id, href) { var l = document.getElementById(id); if (!href) { if (l) l.remove(); return; } if (l && l.getAttribute('href') === href) return;
    var n = document.createElement('link'); n.rel = 'stylesheet'; n.id = id; n.href = href; if (l) l.replaceWith(n); else document.head.appendChild(n); };
  window.ddIxFail = function (s, e) { try { H.removeAttribute('data-ix-' + s); link('ix-' + s, null); fails.push(s); if (window.NEWS_IX) delete window.NEWS_IX.map[s]; console.warn('ix ' + s + ' → default', e || ''); } catch (_) {} };
  try {
    var q = new URLSearchParams(location.search), want = q.get('ed'), id = want && eds[want] ? want : X.ed, ed = eds[id] || { slots: {} }, map = {}, k;
    for (k in ed.slots || {}) if (ed.slots[k] !== 'default' && ok[k] && ok[k][ed.slots[k]]) map[k] = ed.slots[k];
    (q.get('ix') || '').split(',').forEach(function (p) { var a = p.split(':'); if (!a[1]) return; if (a[1] === 'default') delete map[a[0]]; else if (ok[a[0]] && ok[a[0]][a[1]]) map[a[0]] = a[1]; });
    for (k in ok) { var v = map[k], f = v && ok[k][v];
      if (v) H.setAttribute('data-ix-' + k, v); else H.removeAttribute('data-ix-' + k);
      link('ix-' + k, f && f.css ? up + f.css + '?v=' + f.h : null);
      if (f && f.js) { var s = document.createElement('script'); s.src = up + f.js + '?v=' + f.h; s.async = false; s.onerror = (function (slot) { return function () { window.ddIxFail(slot, 'load'); }; })(k); document.head.appendChild(s); } }
    H.setAttribute('data-ed', id || ''); link('ix-ed', ed.css ? up + ed.css + '?v=' + ed.h : null);
    window.NEWS_IX = { ed: id, pinned: X.ed, map: map };
    // previewing another edition also previews its theme (the body is not parsed yet: set it the moment it exists)
    if (id !== X.ed && ed.theme && !q.get('theme')) { var put = function (b) { b.dataset.theme = ed.theme; if (ed.arch) b.dataset.arch = ed.arch; b.dataset.ed = id; };
      if (document.body) put(document.body); else { var mo = new MutationObserver(function () { if (document.body) { mo.disconnect(); put(document.body); } }); mo.observe(H, { childList: true }); } }
  } catch (e) { console.warn('ix boot', e); }
  // cross-document transitions between issues: tag the direction so any transition/* variant can style ix-next / ix-prev
  var day = function (u) { var m = String(u || '').match(/(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; try { return /\/(index(\.html)?)?$/.test(new URL(u, location.href).pathname) ? '9999-12-31' : null; } catch (e) { return null; } };
  addEventListener('pagereveal', function (e) { var vt = e.viewTransition; if (!vt || !H.hasAttribute('data-ix-transition')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || H.classList.contains('dd-rm')) { vt.skipTransition(); return; }
    var from = window.navigation && navigation.activation && navigation.activation.from && navigation.activation.from.url, a = day(from), b = day(location.href);
    if (!a || !b || a === b) { vt.skipTransition(); return; } try { vt.types.add(b > a ? 'ix-next' : 'ix-prev'); } catch (_) { vt.skipTransition(); } });
})();
