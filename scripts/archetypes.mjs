// Theme archetypes: layout-level looks (site/assets/arch.css, keyed by body[data-arch]). Deterministic, NO AI.
// Weekly pick: seeded by ISO week, no repeat within 3 weeks; palette = weekly MCP palette when its scheme fits the
// archetype (fonts/radius/border from archetype), else archetype palette with the MCP accent if it keeps AA contrast.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng } from './theme.mjs';
import { contrast } from './weekly-theme.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHS = JSON.parse(readFileSync(join(root, 'config/archetypes.json'), 'utf8'));
const prevWeek = w => { const [y, n] = w.split('-W').map(Number); return n > 1 ? `${y}-W${String(n - 1).padStart(2, '0')}` : `${y - 1}-W52`; };
const memo = new Map();
const frozen = week => { try { return JSON.parse(readFileSync(join(root, 'data/themes', `${week}.json`), 'utf8')).arch || null; } catch { return null; } };
// Owner favourites (data/state/theme-prefs.json, synced from D1) weight the pick ×3; no repeat within 3 weeks stays absolute.
export function favArchs() {
  try { const p = JSON.parse(readFileSync(join(root, 'data/state/theme-prefs.json'), 'utf8')); return new Set((p.theme_favs || []).map(id => id.startsWith('arch-') ? id.slice(5) : (id.startsWith('wk-') ? frozen(id.slice(3).toUpperCase()) : null)).filter(Boolean)); } catch { return new Set(); }
}
export function archFor(week, depth = 0, favs = null) {
  const fz = frozen(week); if (fz) return fz;  // once a week is generated its archetype never changes
  if (memo.has(week) && !favs) return memo.get(week);
  const recent = depth < 60 ? [archFor(prevWeek(week), depth + 1), archFor(prevWeek(prevWeek(week)), depth + 2)] : [];
  const pool = ARCHS.filter(a => !recent.includes(a.id)).flatMap(a => Array(favs && favs.has(a.id) ? 3 : 1).fill(a));
  const id = pool[Math.floor(rng('arch:' + week)() * pool.length)].id;
  if (!favs) memo.set(week, id); return id;
}
const LAYOUT_KEYS = ['radius', 'border-w', 'shadow', 'font-display', 'font-body', 'font-mono', 'bg-pattern', 'tilt'];
export function constrain(weekly, archId) {
  const a = ARCHS.find(x => x.id === archId);
  let tokens;
  if (weekly.scheme === a.scheme) {
    tokens = { ...weekly.tokens };
    for (const k of LAYOUT_KEYS) tokens[k] = a.tokens[k];
    if (archId === 'brutal') { tokens.line = tokens.ink; tokens.shadow = `5px 5px 0 ${tokens.ink}`; }
  } else {
    tokens = { ...a.tokens };
    const acc = weekly.tokens.accent;
    if (acc && contrast(acc, tokens.bg) >= 3 && contrast(acc, tokens.surface) >= 3) {
      tokens.accent = acc; tokens['accent-ink'] = contrast('#000000', acc) >= contrast('#ffffff', acc) ? '#111111' : '#ffffff';
    }
  }
  const ok = contrast(tokens.ink, tokens.bg) >= 4.5 && contrast(tokens.muted, tokens.bg) >= 4.5 && contrast(tokens.ink, tokens.surface) >= 4.5 && contrast(tokens.muted, tokens.surface) >= 4.5;
  if (!ok) tokens = { ...a.tokens };
  return { ...weekly, arch: archId, scheme: a.scheme, tokens, name: `${a.name} · ${weekly.name}` };
}
export const archThemes = () => ARCHS.map(a => ({ id: 'arch-' + a.id, name: a.name, arch: a.id, scheme: a.scheme, tokens: a.tokens }));
