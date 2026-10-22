// ix toast/island — inspired by ★5 motion-cult-dynamic-island (SIZE_PRESETS + one spring k 400 · c 30 for width/height/radius).
// A new toast opens from a 52×44 "minimal" island to its full size via clip-path (its position/transform stay the site's), content pops in.
(function () { var SLOT = 'toast';
  try {
    var H = document.documentElement, MQ = matchMedia('(prefers-reduced-motion: reduce)');
    var still = function () { return MQ.matches || H.classList.contains('dd-rm'); };
    function spring(k, c) { var x = 1, v = 0, h = 1 / 240, out = [1], t = 0; while (t < 1) { for (var i = 0; i < 4; i++) { v += (-k * x - c * v) * h; x += v * h; } t += 1 / 60; out.push(x); if (Math.abs(x) < 0.001 && Math.abs(v) < 0.01) break; } out.push(0); return out; }
    var S = spring(400, 30), DUR = Math.round((S.length - 1) * 1000 / 60);
    function open(el) { if (still() || el.__ix) return; el.__ix = 1; var r = el.getBoundingClientRect(); if (!r.width) return;
      var ix = Math.max(0, (r.width - 52) / 2), iy = Math.max(0, (r.height - 44) / 2);
      el.animate(S.map(function (p) { return { clipPath: 'inset(' + (iy * p).toFixed(1) + 'px ' + (ix * p).toFixed(1) + 'px round ' + (22 + 0 * p) + 'px)' }; }), { duration: DUR, easing: 'linear' });
      [].forEach.call(el.children, function (c, i) { c.animate([{ opacity: 0, transform: 'translateY(5px) scale(.9)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 320, delay: 90 + i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }); }); }
    new MutationObserver(function (recs) { recs.forEach(function (r) { [].forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1 && n.matches('[data-ixh~="toast"]')) requestAnimationFrame(function () { open(n); }); }); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('keydown', function () {});
    window.__ddIx = (window.__ddIx || []).concat(SLOT + ':island');
  } catch (err) { if (window.ddIxFail) window.ddIxFail(SLOT, err); }
})();
