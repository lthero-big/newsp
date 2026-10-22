// Read-only 模型 card data (偏好 page, owner only). The server keeps var/llm/<date>-<run>.summary.json (scripts/llm.py) — var/ is not in git,
// so each build folds whatever summaries it can see into data/state/llm-usage.json (committed by publish.sh), and a Pages build (no var/)
// just reads that file. Only model names, token counts, seconds and fallback names — never keys, prompts or text.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export const KEEP = 14;
const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
export function compact(date, run, s) {
  const calls = Array.isArray(s.calls) ? s.calls : [];
  const models = [...new Set((Array.isArray(s.providers) ? s.providers : calls.map(c => `${c.provider}:${c.model}`)).map(String))].slice(0, 6);
  return { date, run, models, in: num(s.in), out: num(s.out), calls: calls.length, sec: num(s.sec), written: num(s.written), items: num(s.items),
    fallbacks: (Array.isArray(s.fallbacks) ? s.fallbacks : []).map(f => (typeof f === 'string' ? f : [f.from, f.to].filter(Boolean).join('→') || 'fallback')).slice(0, 6),
    errors: Array.isArray(s.errors) ? s.errors.length : 0,
    per: calls.reduce((o, c) => { const k = String(c.provider || '?').slice(0, 20), x = o[k] || (o[k] = { calls: 0, in: 0, out: 0 }); x.calls++; x.in += num(c.in); x.out += num(c.out); return o; }, {}) };
}
// prev runs + fresh summaries → newest first, one row per date+run, KEEP rows
export function mergeUsage(prev, fresh) {
  const m = new Map(); for (const r of [...(prev || []), ...fresh]) if (r && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) m.set(r.date + '|' + r.run, r);
  return [...m.values()].sort((a, b) => (b.date + b.run).localeCompare(a.date + a.run)).slice(0, KEEP);
}
export function loadUsage(root, { write = true } = {}) {
  const file = join(root, 'data/state/llm-usage.json');
  let prev = []; try { prev = JSON.parse(readFileSync(file, 'utf8')).runs || []; } catch {}
  const fresh = []; try { for (const f of readdirSync(join(root, 'var/llm'))) { const m = f.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.summary\.json$/); if (!m) continue;
    try { fresh.push(compact(m[1], m[2], JSON.parse(readFileSync(join(root, 'var/llm', f), 'utf8')))); } catch {} } } catch {}
  const runs = mergeUsage(prev, fresh);
  if (write && fresh.length && JSON.stringify(runs) !== JSON.stringify(prev)) { mkdirSync(join(root, 'data/state'), { recursive: true }); writeFileSync(file, JSON.stringify({ runs }, null, 1) + '\n'); }
  return runs;
}
