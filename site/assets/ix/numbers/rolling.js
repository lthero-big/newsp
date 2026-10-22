// ix numbers/rolling — inspired by ★4 motion-cult-rolling-number (useSpring mass .8 · k 75 · c 15). Hook: [data-ixh~="num"] holding an integer.
// The roll is painted on an aria-hidden overlay; the element's own text never changes (scripts and screen readers read the real value).
(function () { var SLOT = 'numbers';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    function roll(el) { var to = parseInt((el.textContent || '').trim(), 10); if (!(to > 0) || el.__ix) return; el.__ix = 1;
      var o = document.createElement('span'); o.setAttribute('aria-hidden', 'true'); o.className = 'ixroll';
      var cs = getComputedStyle(el); el.style.position = el.style.position || (cs.position === 'static' ? 'relative' : ''); el.style.color = 'transparent';
      Object.assign(o.style, { position: 'absolute', left: 0, top: 0, color: cs.color, pointerEvents: 'none', font: 'inherit', fontVariantNumeric: 'tabular-nums' });
      o.textContent = '0'; el.appendChild(o);
      var x = 0, v = 0, m = 0.8, k = 75, c = 15, last = 0;
      function done() { o.remove(); el.style.color = ''; }
      function step(ts) { var dt = Math.min(0.032, (ts - (last || ts)) / 1000) || 0.016; last = ts;
        for (var i = 0; i < 4; i++) { var h = dt / 4; v += ((-k * (x - to) - c * v) / m) * h; x += v * h; }
        o.textContent = String(Math.max(0, Math.round(x)));
        if (Math.abs(x - to) < 0.02 && Math.abs(v) < 0.05) return done(); requestAnimationFrame(step); }
      requestAnimationFrame(step); setTimeout(done, 2400); }
    var init = function () { if (still()) { window.__ddIx = (window.__ddIx || []).concat(SLOT + ':rolling'); return; }
      var els = [].slice.call(document.querySelectorAll('[data-ixh~="num"]'));
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); roll(e.target); } }); }) : null;
      els.forEach(function (el) { io ? io.observe(el) : roll(el); });
      addEventListener('keydown', function () {});
      window.__ddIx = (window.__ddIx || []).concat(SLOT + ':rolling'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { window.ddIxFail && window.ddIxFail(SLOT, e); } }); else init();
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
