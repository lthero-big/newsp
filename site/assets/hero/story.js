// Hero widget "story": one big image with date + source chips over it, title below; crossfades through the top items.
// Ref: Brink iOS 「In the News」 card (Mobbin). Pauses on hover/focus/hidden tab; prefers-reduced-motion → no autoplay, no fades.
(() => {
  const CSS = `
.hs-story{height:100%;display:flex}
.st{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;background:var(--surface);border:var(--border-w) solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px 10px 16px;min-width:0}
.st-media{position:relative;display:block;flex:1 1 auto;min-height:220px;border-radius:calc(var(--radius)*.7);overflow:hidden;background:color-mix(in srgb,var(--ink) 8%,var(--surface))}
.st-slide{position:absolute;inset:0;opacity:0;transition:opacity .7s cubic-bezier(.22,1,.36,1)}
.st-slide.on{opacity:1}
.st-slide .bk{position:absolute;inset:-12%;width:124%;height:124%;object-fit:cover;filter:blur(22px) saturate(1.2);opacity:.55}
.st-slide .im{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-slide.wide .im{object-fit:contain}
.st-chips{position:absolute;left:12px;bottom:12px;right:12px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}
.st-chips span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font:600 12px/1.2 var(--font-body);color:#fff;background:rgba(20,20,20,.46);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.28);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-chips svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.8;flex:none}
.st-body{padding:0 6px;min-width:0}
.st-title{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font:700 clamp(19px,1.7vw,24px)/1.32 var(--font-display);color:var(--ink);text-decoration:none;min-height:2.64em}
.st-title:hover{color:var(--accent)}
.st-bars{display:flex;gap:6px;margin-top:14px}
.st-bars button{flex:1;height:22px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center}
.st-bars button i{display:block;width:100%;height:4px;border-radius:4px;background:color-mix(in srgb,var(--ink) 14%,transparent);overflow:hidden}
.st-bars button i b{display:block;height:100%;width:0;background:var(--accent);border-radius:inherit}
.st-bars button.done i b{width:100%}
.st-bars button.on i b{animation:stbar var(--dur) linear forwards}
.st.paused .st-bars button.on i b{animation-play-state:paused}
.st-bars button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
@keyframes stbar{to{width:100%}}
@media (prefers-reduced-motion:reduce){.st-slide{transition:none}.st-bars button.on i b{animation:none;width:100%}}
@media (max-width:860px){.st{height:auto}.st-media{flex:none;min-height:0;aspect-ratio:16/10}.st{padding:8px 8px 12px}}`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 7h11M5.5 2v3M10.5 2v3"/></svg>';
  let timer = null, off = [];
  HeroSlot.register('story', {
    minItems: 1,
    mount(el, H, ctx) {
      if (!document.getElementById('hs-story-css')) { const s = document.createElement('style'); s.id = 'hs-story-css'; s.textContent = CSS; document.head.appendChild(s); }
      const items = H.items.slice(0, 3), DUR = 5200, [, m, d] = H.date.split('-').map(Number);
      el.innerHTML = `<article class="st" style="--dur:${DUR}ms" aria-roledescription="carousel" aria-label="今日头图">
  <a class="st-media" href="${esc(items[0].url)}" tabindex="-1" aria-hidden="true">${items.map((it, i) => `<span class="st-slide${i ? '' : ' on'}${it.w / it.h > 1.9 ? ' wide' : ''}"><img class="bk" src="${esc(it.img)}" alt="" decoding="async" referrerpolicy="no-referrer"><img class="im" src="${esc(it.img)}" alt="" width="${esc(it.w)}" height="${esc(it.h)}" decoding="async" referrerpolicy="no-referrer"></span>`).join('')}
    <span class="st-chips"><span>${ICAL}${m}月${d}日</span><span class="st-src">${esc(items[0].src)}</span></span></a>
  <div class="st-body"><a class="st-title" href="${esc(items[0].url)}" aria-live="polite">${esc(items[0].title)}</a>
    ${items.length > 1 ? `<div class="st-bars">${items.map((it, i) => `<button type="button" class="${i ? '' : 'on'}" aria-label="第 ${i + 1} 条：${esc(it.title)}" aria-pressed="${!i}"><i><b></b></i></button>`).join('')}</div>` : ''}</div></article>`;
      const st = el.querySelector('.st'), media = st.querySelector('.st-media'), title = st.querySelector('.st-title'), src = st.querySelector('.st-src');
      const slides = [...st.querySelectorAll('.st-slide')], bars = [...st.querySelectorAll('.st-bars button')];
      let i = 0, paused = false, left = DUR, t0 = 0;
      const show = n => { i = (n + items.length) % items.length; const it = items[i];
        slides.forEach((s, k) => s.classList.toggle('on', k === i));
        bars.forEach((b, k) => { b.className = k === i ? 'on' : k < i ? 'done' : ''; b.setAttribute('aria-pressed', String(k === i)); void b.offsetWidth; });
        title.textContent = it.title; title.href = it.url; media.href = it.url; src.textContent = it.src; left = DUR; arm(); };
      const arm = () => { clearTimeout(timer); timer = null; if (ctx.reduced || paused || items.length < 2) return; t0 = Date.now(); timer = setTimeout(() => show(i + 1), left); };
      const pause = on => { if (on === paused) return; paused = on; st.classList.toggle('paused', on); if (on) { clearTimeout(timer); timer = null; left = Math.max(300, left - (Date.now() - t0)); } else arm(); };
      bars.forEach((b, k) => b.addEventListener('click', () => show(k)));
      const L = (t, e, f) => { t.addEventListener(e, f); off.push(() => t.removeEventListener(e, f)); };
      L(st, 'mouseenter', () => pause(true)); L(st, 'mouseleave', () => pause(st.contains(document.activeElement)));
      L(st, 'focusin', () => pause(true)); L(st, 'focusout', e => { if (!st.contains(e.relatedTarget) && !st.matches(':hover')) pause(false); });
      L(document, 'visibilitychange', () => pause(document.hidden || st.matches(':hover')));
      if (ctx.reduced) st.classList.add('paused');
      arm();
    },
    unmount() { clearTimeout(timer); timer = null; off.forEach(f => f()); off = []; }
  });
})();
