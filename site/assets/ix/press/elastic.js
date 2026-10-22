// ix press/elastic — inspired by ★5 motion-21st-elastic-switch (spring k 500 · c 16 · m 1). Shared with design-daily (identical file).
// Squash on press, spring release with overshoot; pop when a bookmark/like turns on (.on or aria-pressed=true); staggered star bounce. Buttons only (never .card/.grid).
(function () { var SLOT = 'press';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    var SEL = '.acts button,.stars button,.tools button,.tfav .fav,.tcard .fav,.btn';
    var on = function (el) { return el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'; };
    function spring(x0, v0, k, c) { var x = x0, v = v0, h = 1 / 240, out = [x0], t = 0;
      while (t < 1.2) { for (var i = 0; i < 4; i++) { var a = -k * x - c * v; v += a * h; x += v * h; } t += 1 / 60; out.push(x); if (Math.abs(x) < 0.002 && Math.abs(v) < 0.02) break; }
      out.push(0); return out; }
    var REL = spring(1, 0, 500, 16), POP = spring(0, 9.5, 500, 16), dur = function (a) { return Math.round((a.length - 1) * 1000 / 60); };
    function release(el) { el.animate(REL.map(function (x) { return { transform: 'scale(' + (1 + 0.14 * x).toFixed(4) + ',' + (1 - 0.14 * x).toFixed(4) + ')' }; }), { duration: dur(REL), easing: 'linear' }); }
    function pop(el, amp, delay) { el.animate(POP.map(function (x) { return { transform: 'scale(' + (1 + amp * x).toFixed(4) + ')' }; }), { duration: dur(POP), delay: delay || 0, easing: 'linear', fill: 'backwards' }); }
    function press(el) { el.animate([{ transform: 'none' }, { transform: 'scale(1.14,.86)' }], { duration: 90, easing: 'ease-out', fill: 'forwards' }); el.__ixDown = 1; }
    function up(el) { if (!el.__ixDown) return; el.__ixDown = 0; el.getAnimations().forEach(function (a) { a.cancel(); }); release(el); }
    var tgt = function (e) { var t = e.target && e.target.closest && e.target.closest(SEL); return t && !t.disabled ? t : null; };
    addEventListener('pointerdown', function (e) { if (still()) return; var el = tgt(e); if (el) press(el); }, true);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { addEventListener(n, function (e) { var el = tgt(e); if (el) up(el); else document.querySelectorAll(SEL).forEach(function (b) { if (b.__ixDown) up(b); }); }, true); });
    addEventListener('keydown', function (e) { if (still() || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return; var el = tgt(e); if (el) { press(el); setTimeout(function () { up(el); }, 90); } }, true);
    addEventListener('click', function (e) { if (still()) return; var el = tgt(e); if (!el) return;
      setTimeout(function () { // after the site has applied the new state
        if ((el.classList.contains('fav') || el.classList.contains('like')) && on(el)) pop(el, 0.034);
        var st = el.closest('.stars'); if (st && on(el)) st.querySelectorAll('button.on').forEach(function (b, i) { pop(b, 0.03, i * 30); });
      }, 0); });
    window.__ddIx = (window.__ddIx || []).concat(SLOT + ':elastic');
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
