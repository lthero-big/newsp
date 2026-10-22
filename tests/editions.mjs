// Runs the full behaviour suite (tests/mobile-layout.mjs) once per shipped slot variant (?ix=slot:variant) and per edition
// (?ed=<week>), on a reduced theme set, then tests/invariants.mjs. DESIGN-RULES §12.
// Usage: node tests/editions.mjs [distDir] [--only ix|ed] [--jobs 3]   env NEWS_TEST_THEMES (default "2": the current + next theme)
import { spawn } from 'node:child_process';
import { loadIx, healthy, loadFavs, SITE } from '../scripts/ix.mjs';
import { loadEditions } from '../scripts/editions.mjs';
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const only = opt('--only'), jobs = +(opt('--jobs') || 3), dist = args[0] || new URL('../dist/', import.meta.url).pathname;
const reg = loadIx(), ok = healthy(reg, loadFavs());
const runs = [];
if (only !== 'ed') for (const [s, x] of Object.entries(reg.slots)) for (const [n, v] of Object.entries(x.variants || {})) if ((!v.sites || v.sites.includes(SITE)) && ok[s]?.[n]) runs.push(`ix=${s}:${n}`);
if (only !== 'ix') for (const e of loadEditions()) if (e.status !== 'rejected') runs.push(`ed=${e.id}`);
const run = (cmd, env) => new Promise(r => { const p = spawn('node', cmd, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', code => r({ code, out })); });
const res = []; let i = 0;
await Promise.all(Array.from({ length: jobs }, async () => { while (i < runs.length) { const qs = runs[i++], t0 = Date.now();
  const { code, out } = await run([new URL('./mobile-layout.mjs', import.meta.url).pathname], { NEWS_TEST_QS: qs, NEWS_TEST_DIST: dist, NEWS_TEST_THEMES: process.env.NEWS_TEST_THEMES || '2' });
  res.push([qs, code]); console.log(`${code ? '✗' : '✓'} ${qs} (${Math.round((Date.now() - t0) / 1000)}s)${code ? '\n' + out.split('\n').filter(l => /✗|Error|FAIL|fail/.test(l)).slice(0, 12).join('\n') : ''}`); } }));
const inv = await run([new URL('./invariants.mjs', import.meta.url).pathname, dist], {}); console.log(inv.out.trim().split('\n').slice(-12).join('\n'));
const bad = res.filter(([, c]) => c).length + (inv.code ? 1 : 0);
console.log(bad ? `editions: ${bad} 项失败` : `editions: ${res.length} 次完整套件（变体 + 版本）+ invariants 全部通过`); process.exit(bad ? 1 : 0);
