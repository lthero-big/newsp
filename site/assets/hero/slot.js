// Hero slot: a swappable widget area on the right of the day hero. See docs/DESIGN-RULES.md §9.
// Data contract: window.HERO, parsed from <script type="application/json" id="hero-data"> (CSP forbids inline JS):
//   { v:1, date, week, widgets:{name:hash}, rotation:[name], themes:{themeId:name}, items:[{id,title,img,w,h,url,ext,src,module,published_at}] }
// Widgets live in assets/hero/<name>.js and call HeroSlot.register(name, { minItems, mount(el, HERO, ctx), unmount() }).
// A widget only touches the element it is given. Pick order: ?hero= → owner pref (prefs.hero) → theme's hero field → weekly seed over rotation → static fan.
(() => {
  const R = {}, wait = {};
  window.HeroSlot = { register(name, w) { R[name] = w; (wait[name] || []).forEach(f => f(w)); delete wait[name]; } };
  const el = document.querySelector('[data-slot="hero"]'), dj = document.getElementById('hero-data');
  if (!el || !dj) return;
  let H; try { H = JSON.parse(dj.textContent); } catch { el.dataset.hero = 'fan'; return; }
  window.HERO = H;
  const fallback = el.innerHTML, root = document.body.dataset.root || '';
  const names = Object.keys(H.widgets || {}).filter(n => n !== 'slot');
  const ok = n => typeof n === 'string' && names.includes(n);
  const owner = () => !!localStorage.getItem('news-owner');
  const prefs = () => { try { return JSON.parse(localStorage.getItem('news-theme-prefs') || '{}'); } catch { return {}; } };
  const q = new URLSearchParams(location.search).get('hero');
  const seed = [...(H.week || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const choose = () => { const rot = (H.rotation || []).filter(ok);
    return [q, owner() && prefs().hero, (H.themes || {})[document.body.dataset.theme], rot.length ? rot[seed % rot.length] : null].find(ok) || 'fan'; };
  const load = name => R[name] ? Promise.resolve(R[name]) : new Promise((res, rej) => {
    (wait[name] = wait[name] || []).push(res);
    const s = document.createElement('script'); s.src = `${root}assets/hero/${name}.js?v=${H.widgets[name]}`; s.async = true;
    s.onerror = rej; document.head.appendChild(s); setTimeout(() => rej(new Error('timeout')), 8000); });
  const ctx = { owner: owner(), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, fallback };
  let cur = null, curName = null;
  async function mount(name) {
    if (name === curName) return;
    try { cur?.unmount?.(); } catch {}
    cur = null; curName = name;
    if (name === 'fan' && !R.fan) { el.innerHTML = fallback; el.dataset.hero = 'fan'; tools(); return; }
    try { const w = await load(name); if (curName !== name) return;
      if ((H.items || []).length < (w.minItems || 1)) throw new Error('not enough items');
      const box = document.createElement('div'); box.className = `hs hs-${name}`; el.replaceChildren(box); el.dataset.hero = name; cur = w; w.mount(box, H, ctx);
    } catch { if (name !== 'fan') { curName = null; el.innerHTML = fallback; el.dataset.hero = 'fan'; curName = 'fan'; } }
    tools();
  }
  // owner: one small circular button cycles widgets and remembers the choice (D1 /api/prefs key "hero")
  function tools() { if (!owner() || el.querySelector('.hs-cycle')) return; const b = document.createElement('button');
    b.type = 'button'; b.className = 'hs-cycle'; b.title = '换一种头图样式'; b.setAttribute('aria-label', '换一种头图样式');
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8"/></svg>';
    b.onclick = async () => { const all = ['fan', ...names.filter(n => n !== 'fan')], next = all[(all.indexOf(curName) + 1) % all.length];
      const P = prefs(); P.hero = next; localStorage.setItem('news-theme-prefs', JSON.stringify(P)); await mount(next);
      try { await fetch(root + 'api/prefs', { method: 'POST', headers: { authorization: 'Bearer ' + localStorage.getItem('news-owner'), 'content-type': 'application/json' }, body: JSON.stringify({ hero: next }) }); } catch {} };
    el.appendChild(b); }
  mount(choose());
  new MutationObserver(() => mount(choose())).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('news-state', () => mount(choose()));
})();
