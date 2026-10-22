// Weekly big theme tokens + contrast guard (used by build/tests). Themes are frozen: no design-daily catalog access.
//   node scripts/weekly-theme.mjs <date>  → prints the cached data/themes/<ISO-week>.json, if any
// extractTokens(): tokens from params/code/demoHtml by rules (hex colours, font-family, border-radius), contrast-guarded (WCAG AA).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rng, isoWeek } from './theme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEIGHT = { brand: 2, ui: 2 };
export const SAFE = () => JSON.parse(readFileSync(join(root, 'themes/one-accent.json'), 'utf8'));

// ---------- colour maths ----------
const hex6 = h => { h = h.replace('#', '').toLowerCase(); if (h.length === 3) h = [...h].map(c => c + c).join(''); return h.length === 6 ? '#' + h : null; };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const sat = h => { const [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v * (1 - t) + rgb(b)[i] * t));
// push colour toward black/white until it reaches the target contrast against bg
function ensure(color, bg, target) {
  const toward = lum(bg) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0; t <= 1.0001; t += 0.05) { const c = mix(color, toward, t); if (contrast(c, bg) >= target) return c; }
  return toward;
}

// ---------- extraction ----------
export function extractTokens(item) {
  const text = [JSON.stringify(item.params || {}), item.code || '', item.demoHtml || ''].join('\n');
  const freq = new Map();
  for (const m of text.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) { const h = hex6(m[0]); if (h) freq.set(h, (freq.get(h) || 0) + 1); }
  const colors = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h]) => h);
  if (colors.length < 2) throw new Error('颜色太少，无法提取');
  // background: body/:root background if declared, else the most frequent extreme (very light or very dark) colour
  const bgDecl = text.match(/(?:body|html|:root)\s*\{[^}]*?background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})\b/);
  let bg = bgDecl ? hex6(bgDecl[1]) : colors.find(h => lum(h) > 0.85 || lum(h) < 0.02);
  if (!bg) bg = '#faf8f3';
  const dark = lum(bg) < 0.2;
  const accent0 = colors.filter(h => sat(h) > 0.45 && contrast(h, bg) > 1.3).sort((a, b) => ((contrast(b, bg) >= 3) - (contrast(a, bg) >= 3)) || (freq.get(b) - freq.get(a)) || (sat(b) - sat(a)) || a.localeCompare(b))[0];
  if (!accent0) throw new Error('没有足够饱和的强调色');
  const inkCand = colors.find(h => h !== bg && contrast(h, bg) >= 7) || (dark ? '#f2f0eb' : '#161616');
  const ink = ensure(inkCand, bg, 7);                 // body text: AA needs 4.5, we aim for 7
  const muted = ensure(mix(ink, bg, 0.45), bg, 4.5);  // secondary text still AA
  const accent = ensure(accent0, bg, 3);              // large text / UI components: AA 3:1
  const accentInk = contrast('#000000', accent) >= contrast('#ffffff', accent) ? '#111111' : '#ffffff';
  const surface = mix(bg, dark ? '#ffffff' : '#000000', dark ? 0.05 : 0.025);
  const line = mix(bg, ink, dark ? 0.16 : 0.12);
  const radii = [...text.matchAll(/border-radius\s*:\s*(\d+)px/g)].map(m => +m[1]).filter(n => n <= 40).sort((a, b) => a - b);
  const radius = radii.length ? Math.min(22, Math.max(2, radii[Math.floor(radii.length / 2)])) : 12;
  const fam = (text.match(/font(?:-family)?\s*:[^;"}]*?(serif|mono|Georgia|Times|Courier|ui-monospace|rounded)/i) || [])[1]?.toLowerCase() || '';
  const display = /georgia|times|serif/.test(fam) && !/sans/.test(fam) ? "'Fraunces','Georgia','Noto Serif SC',serif"
    : /mono|courier/.test(fam) ? "'JetBrains Mono','SF Mono',ui-monospace,'Noto Sans SC',monospace"
    : "'Inter Tight','Inter','PingFang SC','Noto Sans SC',system-ui,sans-serif";
  const tokens = { bg, surface, ink, muted, line, accent, 'accent-ink': accentInk, radius: `${radius}px`, 'border-w': '1px',
    shadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,.04),0 6px 20px rgba(0,0,0,.05)', 'font-display': display,
    'font-body': "'Inter','PingFang SC','Noto Sans SC',system-ui,sans-serif", 'font-mono': "'JetBrains Mono','SF Mono',ui-monospace,monospace",
    'bg-pattern': 'none', tilt: '0deg' };
  const checks = { ink: contrast(tokens.ink, bg), muted: contrast(tokens.muted, bg), ink_on_surface: contrast(tokens.ink, surface), accent: contrast(accent, bg), accent_ink: contrast(accentInk, accent) };
  if (checks.ink < 4.5 || checks.muted < 4.5 || checks.ink_on_surface < 4.5 || checks.accent_ink < 4.5) throw new Error('对比度检查未通过');
  return { scheme: dark ? 'dark' : 'light', tokens, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, +v.toFixed(2)])) };
}

// newsp: weekly looks are frozen in editions/<week>.json (the last approved looks are reused); no design-daily catalog is
// fetched any more. run() only reads an existing data/themes/<week>.json cache.
export async function run(date, { dir = join(root, 'data/themes') } = {}) {
  const week = isoWeek(date), file = join(dir, `${week}.json`);
  if (existsSync(file)) return { file, cached: true, ...JSON.parse(readFileSync(file, 'utf8')) };
  return { file, cached: true, skipped: true, week, name: '每周版本已冻结（editions/），跳过' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  // No top-level await: run() dynamically imports archetypes.mjs, which imports this module back;
  // awaiting here would deadlock that cycle (module never finishes evaluating).
  run(date).then(r => {
    console.log(`${r.week} 主题（${r.cached ? '缓存' : r.source || 'fallback'}）：${r.name}${r.fallback ? ` — 回退：${r.reason}` : ''}`);
  }, e => { console.error(e); process.exit(1); });
}
