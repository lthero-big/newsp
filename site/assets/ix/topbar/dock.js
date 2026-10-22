// ix topbar/dock — inspired by ★5 motion-21st-magnetic-dock (gaussian falloff σ, spring k 420 · c 26). Desktop nav links only.
(function () { var SLOT = 'topbar';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)'), WIDE = matchMedia('(min-width:641px)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm') || !WIDE.matches; };
    var init = function () { var nav = document.querySelector('[data-ixh~="nav"]'); if (!nav) return;
      var items = [].slice.call(nav.querySelectorAll('a,button')), S = items.map(function () { return { x: 1, v: 0, t: 1, y: 0, vy: 0, ty: 0 }; }), raf = 0, last = 0;
      var SIG = 60, MAX = 1.22, K = 420, C = 26;
      function aim(px) { items.forEach(function (el, i) { var r = el.getBoundingClientRect(), d = px == null ? 1e9 : px - (r.left + r.width / 2), g = Math.exp(-(d * d) / (2 * SIG * SIG));
        S[i].t = 1 + (MAX - 1) * g; S[i].ty = -3 * g; }); kick(); }
      function step(ts) { var dt = Math.min(0.032, (ts - (last || ts)) / 1000) || 0.016, moving = false; last = ts;
        S.forEach(function (s, i) { for (var k = 0; k < 4; k++) { var h = dt / 4; s.v += (-K * (s.x - s.t) - C * s.v) * h; s.x += s.v * h; s.vy += (-K * (s.y - s.ty) - C * s.vy) * h; s.y += s.vy * h; }
          if (Math.abs(s.x - s.t) > 0.001 || Math.abs(s.v) > 0.01 || Math.abs(s.y - s.ty) > 0.05) moving = true;
          items[i].style.transform = Math.abs(s.x - 1) < 0.001 && Math.abs(s.y) < 0.05 ? '' : 'translateY(' + s.y.toFixed(2) + 'px) scale(' + s.x.toFixed(4) + ')'; });
        raf = moving ? requestAnimationFrame(step) : 0; if (!moving) last = 0; }
      function kick() { if (!raf) raf = requestAnimationFrame(step); }
      nav.addEventListener('pointermove', function (e) { if (!still()) aim(e.clientX); });
      nav.addEventListener('pointerleave', function () { aim(null); });
      nav.addEventListener('focusin', function (e) { if (still()) return; var r = e.target.getBoundingClientRect(); aim(r.left + r.width / 2); });
      nav.addEventListener('focusout', function () { aim(null); });
      nav.addEventListener('keydown', function () {});
      MQ.addEventListener && MQ.addEventListener('change', function () { if (still()) items.forEach(function (el) { el.style.transform = ''; }); });
      window.__ddIx = (window.__ddIx || []).concat(SLOT + ':dock'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { window.ddIxFail && window.ddIxFail(SLOT, e); } }); else init();
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
