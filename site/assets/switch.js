// Elastic switch — ported from design.lthero.com's ★5 favourite「弹簧拉伸开关」(design-daily demos/motion-21st-elastic-switch.html, the
// motion behind its ix press/elastic 收藏 pop): press stretches the knob into a pill, release lets a spring (k 500 · c 16 · m 1) carry it
// to the other end with one overshoot; the stretch is a second spring. Any <button class="switch" role="switch"><i></i></button>:
// whoever owns it flips aria-checked; this file only animates the change. Reduced motion (system or 减少动效): no animation at all.
(() => {
  const P = { k: 500, c: 16, m: 1 }, still = () => matchMedia('(prefers-reduced-motion: reduce)').matches, S = new WeakMap();
  const on = sw => sw.getAttribute('aria-checked') === 'true';
  function st(sw) { let s = S.get(sw); if (!s) { s = { x: on(sw) ? 1 : 0, v: 0, z: 0, zv: 0, zt: 0, raf: 0 }; S.set(sw, s); } return s; }
  function draw(sw, s) { const k = sw.querySelector('i'); if (!k) return; const cs = getComputedStyle(sw), p = parseFloat(cs.getPropertyValue('--p')) || 3, d = sw.clientHeight - 2 * p, travel = sw.clientWidth - 2 * p - d, ext = Math.max(-0.15, s.z) * d * 0.45;
    k.style.width = d + ext + 'px'; k.style.translate = (s.x * travel - (s.x > 0.5 ? ext : 0)) + 'px 0'; }
  function rest(sw, s) { const k = sw.querySelector('i'); s.x = on(sw) ? 1 : 0; s.v = 0; s.z = s.zt; s.zv = 0; s.raf = 0; if (k && !s.zt) { k.style.width = ''; k.style.translate = ''; } }
  function tick(sw) { const s = st(sw), t = on(sw) ? 1 : 0, h = 1 / 240;
    for (let i = 0; i < 4; i++) { s.v += (-P.k * (s.x - t) - P.c * s.v) / P.m * h; s.x += s.v * h; s.zv += (-P.k * (s.z - s.zt) - P.c * s.zv) / P.m * h; s.z += s.zv * h; }
    if (!sw.isConnected) return; draw(sw, s);
    if (Math.abs(s.x - t) + Math.abs(s.v) + Math.abs(s.z - s.zt) + Math.abs(s.zv) > 1e-3) s.raf = requestAnimationFrame(() => tick(sw)); else rest(sw, s); }
  const kick = sw => { const s = st(sw); if (still()) return rest(sw, s); if (!s.raf) s.raf = requestAnimationFrame(() => tick(sw)); };
  const tgt = e => e.target.closest && e.target.closest('.switch[role="switch"]');
  addEventListener('pointerdown', e => { const sw = tgt(e); if (!sw || sw.disabled || still()) return; const s = st(sw); s.x = on(sw) ? 1 : 0; s.zt = 1; kick(sw); }, true);
  addEventListener('pointerup', () => document.querySelectorAll('.switch[role="switch"]').forEach(sw => { const s = S.get(sw); if (s && s.zt) { s.zt = 0; kick(sw); } }), true);
  addEventListener('pointercancel', () => document.querySelectorAll('.switch[role="switch"]').forEach(sw => { const s = S.get(sw); if (s && s.zt) { s.zt = 0; kick(sw); } }), true);
  // aria-checked flips (by the page's own click handler) → spring to the other end, with the click's extra stretch impulse
  new MutationObserver(ms => { for (const m of ms) { const sw = m.target; if (!sw.matches?.('.switch[role="switch"]')) continue; const s = st(sw);
    if (m.oldValue === sw.getAttribute('aria-checked')) continue; if (m.oldValue != null) s.x = m.oldValue === 'true' ? (s.raf ? s.x : 1) : (s.raf ? s.x : 0); s.zt = 0; s.zv += 7; kick(sw); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['aria-checked'], attributeOldValue: true, subtree: true });
  window.NDSwitch = { kick };
})();
