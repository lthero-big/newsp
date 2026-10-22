// Weekly theme (seeded by ISO week): seeded weighted pick (mulberry32, same as design-daily scripts/lib.mjs rng).
// weight = (theme.weight || 1) * (1 + rating²), rating from config/theme-ratings.json { "<theme-id>": 0-5 }.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function rng(seedStr) {
  let h = 1779033703; for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 3432918353) >>> 0;
  let a = h; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function loadThemes(dir = join(root, 'themes')) {
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function loadRatings(file = join(root, 'config/theme-ratings.json')) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

// ISO-8601 week key, e.g. 2026-W42 — the big theme changes weekly.
export function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`), day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function pickTheme(date, themes = loadThemes(), ratings = loadRatings()) {
  const R = rng('theme:' + isoWeek(date));
  const weighted = themes.map(t => ({ t, w: (t.weight ?? 1) * (1 + (ratings[t.id] || 0) ** 2) }));
  let r = R() * weighted.reduce((s, x) => s + x.w, 0);
  return (weighted.find(x => (r -= x.w) <= 0) || weighted[weighted.length - 1]).t;
}

export function themeCss(themes) {
  return themes.map(t => `[data-theme="${t.id}"]{color-scheme:${t.scheme};${Object.entries(t.tokens).map(([k, v]) => `--${k}:${v}`).join(';')}}`).join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const t = pickTheme(date); console.log(`${date} → ${t.id}（${t.name}，灵感：${t.inspiredBy}）`);
}
