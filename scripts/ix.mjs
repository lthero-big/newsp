// Shared interaction layer (ix) — registry + safety checks used by build.mjs, tests/invariants.mjs and compose-edition.mjs.
// Registry: site/assets/ix/registry.json (same format as design-daily assets/ix/registry.json + sites/kind). Variants: site/assets/ix/<slot>/<variant>.{css,js}.
// "default" = the site's built-in behaviour, no files. Contract: site/assets/ix/README.md. Proposal for sharing with design-daily: docs/SHARED-IX.md.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const IX_DIR = join(root, 'site/assets/ix');
export const SITE = 'news';
export const CAPS = { css: 8 * 1024, js: 4 * 1024 };   // per-variant file size caps (bytes, unminified)
export const loadIx = () => JSON.parse(readFileSync(join(IX_DIR, 'registry.json'), 'utf8'));
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
// Containers that FLIP (tuck/put-back), peek and reflow own: variants may never move, transform, filter or animate them.
const CONTAINER = /(^|[\s>+~])(main|\.card|\.grid|\.ed|\.ed-lead|\.ed-side|\.ed-more|\.module|\.seen)((\.[\w-]+|\[[^\]]+\]|:(not|has|is|where)\([^)]*\)|:[a-z-]+)*)$/;
const BAD = /^(transform|translate|rotate|scale|filter|backdrop-filter|perspective|animation|animation-name|will-change|offset-path)$/;
export function lintCss(css, label) { const errs = [];
  for (const m of strip(css).matchAll(/([^{}@]+)\{([^{}]*)\}/g)) { const sels = m[1].split(',').map(x => x.trim()).filter(Boolean);
    if (!sels.some(x => CONTAINER.test(x) && !/::?(before|after)\b/.test(x))) continue;
    for (const d of m[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) if (BAD.test(d[1]) && !/^none\b/.test(d[2].trim()) && !(d[1] === 'will-change' && !/transform|filter/.test(d[2])))
      errs.push(`${label}: "${m[1].trim().slice(0, 80)}" sets ${d[1]}:${d[2].trim()} on a card/layout container (FLIP / peek / reflow own those)`); }
  return errs; }
export function checkVariant(slot, name, v, favs = null) { const errs = [], L = `ix ${slot}/${name}`; if (name === 'default') return errs;
  if (!v.css && !v.js) errs.push(`${L}: needs css and/or js`);
  if (v.sites && !v.sites.includes(SITE)) return errs;   // other site's variant: not ours to ship
  for (const k of ['css', 'js']) if (v[k] && v[k] !== `assets/ix/${slot}/${name}.${k}`) errs.push(`${L}: ${k} must be assets/ix/${slot}/${name}.${k}`);
  const read = p => { const f = join(root, 'site', p); if (!existsSync(f)) { errs.push(`${L}: missing ${p}`); return null; } return readFileSync(f, 'utf8'); };
  const css = v.css ? read(v.css) : '', js = v.js ? read(v.js) : '';
  if (css) { errs.push(...lintCss(css, L)); if (!/prefers-reduced-motion|dd-rm/.test(css)) errs.push(`${L}: css must handle prefers-reduced-motion / html.dd-rm`);
    if (!new RegExp(`data-ix-${slot}="${name}"|:active-view-transition-type`).test(css)) errs.push(`${L}: css must be scoped to html[data-ix-${slot}="${name}"]`);
    if (Buffer.byteLength(css) > CAPS.css) errs.push(`${L}: css ${Buffer.byteLength(css)} B > ${CAPS.css} B cap`); }
  if (js) { const code = strip(js);
    if (!/prefers-reduced-motion/.test(js) || !/dd-rm/.test(js)) errs.push(`${L}: js must check prefers-reduced-motion AND html.dd-rm`);
    if (/pointer(down|move)|mouse(down|enter|over|move)/.test(code) && !/keydown|focusin|'click'|"click"/.test(code)) errs.push(`${L}: pointer-driven js needs a keyboard path`);
    if (/\.(card|grid|ed|ed-lead|ed-side|ed-more|module)\b/.test(code)) errs.push(`${L}: js must not touch cards or layout containers`);
    if (!/ddIxFail/.test(code)) errs.push(`${L}: js must call window.ddIxFail(slot) in its catch`);
    if (Buffer.byteLength(js) > CAPS.js) errs.push(`${L}: js ${Buffer.byteLength(js)} B > ${CAPS.js} B cap`); }
  const ib = v.inspiredBy; if (!ib?.id) errs.push(`${L}: inspiredBy {id,title,stars,url} required`);
  else if (!(ib.stars >= 4)) errs.push(`${L}: inspiration ${ib.id} must be a ≥4★ favourite (has ${ib.stars})`);
  else if (favs && favs[ib.id] && !(favs[ib.id].stars >= 4)) errs.push(`${L}: ${ib.id} is no longer ≥4★ in design-daily (now ${favs[ib.id].stars}★)`);
  if (!v.desc || !v.added) errs.push(`${L}: desc + added required`);
  return errs; }
export function checkRegistry(reg = loadIx(), favs = null) { const errs = [];
  for (const [slot, s] of Object.entries(reg.slots)) { if (!s.label || !s.default) errs.push(`ix ${slot}: label + default required`);
    for (const [name, v] of Object.entries(s.variants || {})) errs.push(...checkVariant(slot, name, v, favs)); }
  return errs; }
const h10 = p => createHash('sha256').update(readFileSync(join(root, 'site', p))).digest('hex').slice(0, 10);
// Variants that pass every check, with a content hash per variant (build ships only these; anything failing falls back to default).
export function healthy(reg = loadIx(), favs = null) { const out = {};
  for (const [slot, s] of Object.entries(reg.slots)) for (const [name, v] of Object.entries(s.variants || {})) {
    if ((v.sites && !v.sites.includes(SITE)) || checkVariant(slot, name, v, favs).length) continue;
    (out[slot] ||= {})[name] = { ...(v.css ? { css: v.css } : {}), ...(v.js ? { js: v.js } : {}), h: createHash('sha256').update([v.css, v.js].filter(Boolean).map(h10).join('')).digest('hex').slice(0, 10) }; }
  return out; }
export const fileHash = h10;
export function loadFavs() { try { return JSON.parse(readFileSync(join(root, 'data/state/design-favs.json'), 'utf8')).items || null; } catch { return null; } }
