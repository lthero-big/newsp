// Weekly editions (DESIGN-RULES §12): editions/<YYYY-Www>.json = which theme + which ix slot variants a week uses (+ optional editions/<week>.css).
//   status: candidate (built only on its preview branch edition/<week>) · approved (live) · rejected (kept for history).
// Resolution per day page: that week's approved edition, else the newest approved edition before it (no owner reply → last week's look stays),
// else none (legacy theme pick). Each page pins its edition in <html data-ed>, so old issues keep their own week's look.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoWeek } from './theme.mjs';
import { lintCss } from './ix.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ED_DIR = process.env.NEWS_EDITIONS_DIR || join(root, 'editions');
export const STATUSES = ['candidate', 'approved', 'rejected'];
// preview mode: NEWS_EDITION_PREVIEW=<week>, or a Cloudflare Workers Builds (or Pages) build of branch edition/<week>
export const previewWeek = () => process.env.NEWS_EDITION_PREVIEW || (process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || '').match(/^edition\/(\d{4}-W\d{2})$/)?.[1] || null;
export function loadEditions(dir = ED_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /^\d{4}-W\d{2}\.json$/.test(f)).sort().map(f => { const e = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const css = join(dir, f.replace(/\.json$/, '.css')); return { ...e, cssFile: existsSync(css) ? css : null }; });
}
export function checkEditions(eds, { slots, themeIds }) { const errs = [];
  for (const e of eds) { const L = `edition ${e.id}`;
    if (!/^\d{4}-W\d{2}$/.test(e.id || '') || e.id !== e.week) errs.push(`${L}: id must equal week (YYYY-Www)`);
    if (!STATUSES.includes(e.status)) errs.push(`${L}: status must be ${STATUSES.join('/')}`);
    const tid = typeof e.theme === 'string' ? e.theme : e.theme?.id; if (!tid) errs.push(`${L}: theme required`);
    else if (typeof e.theme === 'string' && !themeIds.has(e.theme)) errs.push(`${L}: unknown theme ${e.theme}`);
    else if (typeof e.theme === 'object' && !e.theme.tokens?.bg) errs.push(`${L}: theme object needs tokens`);
    for (const [s, v] of Object.entries(e.slots || {})) { if (!slots[s]) errs.push(`${L}: unknown slot ${s}`); else if (v !== 'default' && !slots[s].variants?.[v]) errs.push(`${L}: unknown variant ${s}/${v}`); }
    if (e.cssFile) { const css = readFileSync(e.cssFile, 'utf8'); errs.push(...lintCss(css, `${L} css`)); if (/^[^@/\s][^{]*\{/m.test(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(new RegExp(`html\\[data-ed="${e.id}"\\][^{]*\\{[^}]*\\}`, 'g'), '').replace(/@media[^{]*\{|\}/g, ''))) errs.push(`${L} css: every rule must be scoped to html[data-ed="${e.id}"]`); } }
  return errs; }
export function live(eds, preview = previewWeek()) { return eds.filter(e => e.status === 'approved' || (preview && e.week === preview && e.status === 'candidate')); }
export function editionFor(date, eds, { latest = false, preview = previewWeek() } = {}) {
  const L = live(eds, preview), w = isoWeek(date);
  if (preview && latest) { const p = L.find(e => e.week === preview); if (p) return p; }  // preview branch: the candidate dresses the newest issue
  return L.find(e => e.week === w) || [...L].reverse().find(e => e.week < w) || null;
}
export const themeIdOf = e => !e ? null : typeof e.theme === 'string' ? e.theme : e.theme.id;
export const editionThemes = eds => eds.filter(e => e.theme && typeof e.theme === 'object').map(e => ({ weight: 1, scheme: 'light', arch: 'classic', ...e.theme }));
