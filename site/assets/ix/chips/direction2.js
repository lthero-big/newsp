// ix chips/direction2 — direction (★5 motion-cult-direction-aware-tabs: bubble spring bounce .19 · 400ms, content from the travel direction, blur 4px)
// + radio groups: the selected chip is [aria-pressed=true] OR [aria-checked=true] (role=radio); arrow keys / Home / End move the choice inside a
// radiogroup (APG: selection follows focus, done by .click() so the site's own handler sets the state). Never sets ARIA itself.
(function () { var SLOT = 'chips';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    function lin(b, n) { var d = 0.4, k = Math.pow(2 * Math.PI / d, 2), c = 4 * Math.PI * (1 - b) / d, x = 0, v = 0, h = d / n / 8, pts = ['0'];
      for (var i = 1; i <= n; i++) { for (var j = 0; j < 8; j++) { v += (k * (1 - x) - c * v) * h; x += v * h; } pts.push(x.toFixed(3)); } pts[n] = '1'; return 'linear(' + pts.join(',') + ')'; }
    var EASE = lin(0.19, 24), CHIP = '[data-ixh~="chip"],[role="radio"]', SEL = ':is(' + CHIP + '):is([aria-pressed="true"],[aria-checked="true"])';
    var init = function () { var row = document.querySelector('[data-ixh~="chips"]'); if (!row) return; var bub = document.createElement('i'); bub.className = 'ixbub'; bub.setAttribute('aria-hidden', 'true');
      var cur = null, put = function () { if (bub.parentNode !== row) row.prepend(bub); };
      function box(c) { return { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }; }
      function place(c, anim) { put(); if (!c) { bub.style.opacity = 0; cur = null; return; } var b = box(c); bub.style.opacity = 1;
        var to = 'translate(' + b.x + 'px,' + b.y + 'px)'; bub.style.width = b.w + 'px'; bub.style.height = b.h + 'px';
        if (anim && cur && cur.isConnected && !still()) { var a = box(cur), dir = b.x > a.x ? 1 : -1;
          bub.animate([{ transform: 'translate(' + a.x + 'px,' + a.y + 'px)', width: a.w + 'px' }, { transform: to, width: b.w + 'px' }], { duration: 400, easing: EASE });
          c.animate([{ filter: 'blur(4px)', translate: (10 * dir) + 'px 0' }, { filter: 'none', translate: '0 0' }], { duration: 400, easing: EASE }); }
        bub.style.transform = to; cur = c; }
      var sel = function () { return row.querySelector(SEL); };
      place(sel(), false); H.classList.add('ix-chips-on');
      new MutationObserver(function () { var p = sel(); if (p !== cur || bub.parentNode !== row) place(p, p !== cur); }).observe(row, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-checked'] });
      addEventListener('resize', function () { place(sel(), false); });
      var KEY = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 0, End: 0 };
      row.addEventListener('keydown', function (e) { if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !(e.key in KEY)) return;
        var t = e.target.closest && e.target.closest('[role="radio"]'); if (!t || !row.contains(t)) return;
        var g = t.closest('[role="radiogroup"]') || row, all = [].filter.call(g.querySelectorAll('[role="radio"]'), function (r) { return !r.disabled && r.getAttribute('aria-disabled') !== 'true' && r.offsetParent; });
        var i = all.indexOf(t), n = all.length; if (i < 0 || n < 2) return;
        var j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + KEY[e.key] + n) % n, nx = all[j]; e.preventDefault(); if (nx === t) return;
        nx.focus(); if (nx.getAttribute('aria-checked') !== 'true') nx.click(); });
      window.__ddIx = (window.__ddIx || []).concat(SLOT + ':direction2'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { window.ddIxFail && window.ddIxFail(SLOT, e); } }); else init();
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
