// ix tabbar/dock — inspired by ★5 motion-21st-magnetic-dock (spring k 420 · c 26, lift). Pressed tab icon magnifies + lifts, springs back.
(function () { var SLOT = 'tabbar';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    function spring(x0, k, c) { var x = x0, v = 0, h = 1 / 240, out = [x0], t = 0; while (t < 1) { for (var i = 0; i < 4; i++) { v += (-k * x - c * v) * h; x += v * h; } t += 1 / 60; out.push(x); if (Math.abs(x) < 0.002 && Math.abs(v) < 0.02) break; } out.push(0); return out; }
    var BACK = spring(1, 420, 26), DUR = Math.round((BACK.length - 1) * 1000 / 60);
    var tab = function (e) { return e.target && e.target.closest ? e.target.closest('[data-ixh~="tab"]') : null; };
    function up(el) { var s = el.querySelector('svg'); if (!s) return; s.getAnimations().forEach(function (a) { a.cancel(); });
      s.animate(BACK.map(function (x) { return { transform: 'translateY(' + (-4 * x).toFixed(2) + 'px) scale(' + (1 + 0.28 * x).toFixed(4) + ')' }; }), { duration: DUR, easing: 'linear' }); }
    function down(el) { var s = el.querySelector('svg'); if (s) s.animate([{ transform: 'none' }, { transform: 'translateY(-4px) scale(1.28)' }], { duration: 120, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }); el.__ixd = 1; }
    addEventListener('pointerdown', function (e) { if (still()) return; var t = tab(e); if (t) down(t); }, true);
    ['pointerup', 'pointercancel'].forEach(function (n) { addEventListener(n, function () { document.querySelectorAll('[data-ixh~="tab"]').forEach(function (t) { if (t.__ixd) { t.__ixd = 0; up(t); } }); }, true); });
    addEventListener('keydown', function (e) { if (still() || (e.key !== 'Enter' && e.key !== ' ')) return; var t = tab(e); if (t) { down(t); setTimeout(function () { t.__ixd = 0; up(t); }, 120); } }, true);
    addEventListener('click', function () {}, true);
    window.__ddIx = (window.__ddIx || []).concat(SLOT + ':dock');
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
