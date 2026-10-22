// Client-side search for 收藏 / 往期 (items.json). Case-insensitive (NFKC + lower), plain substring so Chinese works without word breaks;
// whitespace-separated terms are ANDed. Fields: title, original title, excerpt, source/handle, tags, module name, prompt text. Pure — tests/search.test.mjs loads it in node.
(function (g) {
  const MOD = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻', prompts: '今日提示词' };
  const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const terms = q => norm(q).split(' ').filter(Boolean);
  const hay = m => m._hay || (m._hay = norm([m.title, m.title_orig, m.excerpt, m.source, (m.tags || []).join(' '), MOD[m.prompt_pick ? 'prompts' : m.module] || m.module, m.prompt && m.prompt.text].filter(Boolean).join('\n')));
  const match = (m, q) => { const t = Array.isArray(q) ? q : terms(q); if (!t.length) return true; const h = hay(m); return t.every(x => h.includes(x)); };
  const filter = (list, q) => { const t = terms(q); return t.length ? list.filter(m => match(m, t)) : list; };
  const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // wires an input + its × button: onChange(query) debounced while typing, immediately on clear / Enter / Escape
  const wire = (input, onChange) => { const x = input.parentElement.querySelector('.sx'), d = debounce(onChange);
    const sync = () => { if (x) x.hidden = !input.value; };
    input.addEventListener('input', () => { sync(); d(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; sync(); onChange(''); } else if (e.key === 'Enter') { e.preventDefault(); onChange(input.value); } });
    x && x.addEventListener('click', () => { input.value = ''; sync(); onChange(''); input.focus(); });
    sync(); };
  // highlight: escape `text`, wrap every case-insensitive hit of any term in <mark> (overlapping hits merged). Terms are already normalised (NFKC + lower);
  // matching runs on the NFKC'd text so full-width input still marks, and only when that keeps the length (else the plain escaped text comes back).
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }, esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const hl = (text, q) => { const s = String(text ?? ''), t = (Array.isArray(q) ? q : terms(q)).filter(Boolean); if (!t.length || !s) return esc(s);
    const n = s.normalize('NFKC').toLowerCase(); if (n.length !== s.length) return esc(s);
    const R = []; for (const w of t) { let i = n.indexOf(w); while (i >= 0 && w) { R.push([i, i + w.length]); i = n.indexOf(w, i + w.length); } }
    if (!R.length) return esc(s); R.sort((a, b) => a[0] - b[0]); const M = [R[0].slice()]; for (const [a, b] of R.slice(1)) { const L = M[M.length - 1]; if (a <= L[1]) L[1] = Math.max(L[1], b); else M.push([a, b]); }
    let o = '', k = 0; for (const [a, b] of M) { o += esc(s.slice(k, a)) + '<mark>' + esc(s.slice(a, b)) + '</mark>'; k = b; } return o + esc(s.slice(k)); };
  const api = { norm, terms, hay, match, filter, debounce, wire, hl, esc };
  if (typeof module === 'object' && module.exports) module.exports = api; else g.NDSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
