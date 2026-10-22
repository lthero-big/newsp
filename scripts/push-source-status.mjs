// After generate: summarise per-source counts of this run and store them via /api/sources (owner token from env).
//   node scripts/push-source-status.mjs <run dir> [x-items file]     never prints the token; failures are non-fatal.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [run, xFile] = process.argv.slice(2);
const SITE = process.env.NEWS_SITE, token = process.env.RATINGS_TOKEN;
const load = f => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
const stats = load(join(run, 'stats.json')) || {}, raw = load(join(run, 'raw.json')) || [], gen = load(join(run, 'generated.json'));
const key = r => r.source === 'reddit' ? 'reddit:' + String(r.feed || '').split(':')[0] : r.transport === 'rsshub' ? 'rsshub:' + r.feed : r.source === 'rss' ? 'rss:' + r.feed : 'plugin:' + r.source;
const sources = {};
const bump = (k, f) => { (sources[k] ||= { fetched: 0, selected: 0 })[f]++; };
for (const r of raw) { bump(key(r), 'fetched'); if (!key(r).startsWith('plugin:')) bump('plugin:' + (r.transport === 'rsshub' ? 'rsshub' : r.source), 'fetched'); }
const byUrl = new Map(raw.map(r => [r.url, r]));
for (const it of gen?.items || []) { const r = byUrl.get(it.url); if (!r) continue; bump(key(r), 'selected'); if (!key(r).startsWith('plugin:')) bump('plugin:' + (r.transport === 'rsshub' ? 'rsshub' : r.source), 'selected'); }
const plugins = {};
for (const [name, st] of Object.entries(stats)) {
  plugins[name] = { errors: (st.errors || []).slice(0, 5).map(e => String(e).slice(0, 160)), skipped: st.skipped || null };
  for (const [fid, f] of Object.entries(st.feeds || {})) { const k = (name === 'rsshub' ? 'rsshub:' : 'rss:') + fid; (sources[k] ||= { fetched: 0, selected: 0 }).status = f.status; }
}
const x = xFile && load(xFile); if (x) (sources['plugin:x'] ||= { fetched: 0, selected: 0 }).file_items = (x.items || x).length;
const status = { run_at: new Date().toISOString(), run: run.split('/').slice(-2).join('/'), plugins, sources };
if (!token || !SITE) { console.log('source-status: 没有 RATINGS_TOKEN / NEWS_SITE，跳过上传'); process.exit(0); }
try { const r = await fetch(SITE + '/api/sources', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status', status }), signal: AbortSignal.timeout(20000) });
  console.log(`source-status: ${r.ok ? '已上传' : 'HTTP ' + r.status}（${Object.keys(sources).length} 个源）`); } catch (e) { console.log(`source-status: 上传失败（${e.message}）`); }
