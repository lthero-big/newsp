// ix chips/direction — inspired by ★5 motion-cult-direction-aware-tabs (bubble spring bounce .19 · 400ms; content from the travel direction, blur 4px).
(function () { var SLOT = 'chips';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    // spring with bounce b, duration d → sampled linear() easing (same as the demo)
    function lin(b, n) { var d = 0.4, k = Math.pow(2 * Math.PI / d, 2), c = 4 * Math.PI * (1 - b) / d, x = 0, v = 0, h = d / n / 8, pts = ['0'];
      for (var i = 1; i <= n; i++) { for (var j = 0; j < 8; j++) { v += (k * (1 - x) - c * v) * h; x += v * h; } pts.push(x.toFixed(3)); } pts[n] = '1'; return 'linear(' + pts.join(',') + ')'; }
    var EASE = lin(0.19, 24);
    var init = function () { var row = document.querySelector('[data-ixh~="chips"]'); if (!row) return; var bub = document.createElement('i'); bub.className = 'ixbub'; bub.setAttribute('aria-hidden', 'true'); row.prepend(bub);
      var cur = null;
      function box(c) { return { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }; }
      function place(c, anim) { if (!c) { bub.style.opacity = 0; cur = null; return; } var b = box(c); bub.style.opacity = 1;
        var to = 'translate(' + b.x + 'px,' + b.y + 'px)'; bub.style.width = b.w + 'px'; bub.style.height = b.h + 'px';
        if (anim && cur && !still()) { var a = box(cur), dir = b.x > a.x ? 1 : -1;
          bub.animate([{ transform: 'translate(' + a.x + 'px,' + a.y + 'px)', width: a.w + 'px' }, { transform: to, width: b.w + 'px' }], { duration: 400, easing: EASE });
          c.animate([{ filter: 'blur(4px)', translate: (10 * dir) + 'px 0' }, { filter: 'none', translate: '0 0' }], { duration: 400, easing: EASE }); }
        bub.style.transform = to; cur = c; }
      var pressed = function () { return row.querySelector('[data-ixh~="chip"][aria-pressed="true"]'); };
      place(pressed(), false); H.classList.add('ix-chips-on');
      new MutationObserver(function () { var p = pressed(); if (p !== cur) place(p, true); }).observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
      addEventListener('resize', function () { place(pressed(), false); });
      row.addEventListener('keydown', function () {});
      window.__ddIx = (window.__ddIx || []).concat(SLOT + ':direction'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { window.ddIxFail && window.ddIxFail(SLOT, e); } }); else init();
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
