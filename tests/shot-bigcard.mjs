// Screenshot helper: owner view with the first section's lead collapsed (✓) and the second section's lead deleted.
// Usage: node tests/shot-bigcard.mjs <prefix>   (serves ./dist)
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { join, extname } from 'node:path';
import { launchChrome } from '../scripts/chrome.mjs';
const root = new URL('../dist/', import.meta.url).pathname, prefix = process.argv[2];
const srv = createServer(async (q, s) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; if (!extname(p)) p += '.html';
  try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await launchChrome();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(base + '?theme=wk-2026-w42'); const ids = await p.$$eval('.ed-lead .card', cs => cs.map(c => c.dataset.id));
  await p.route(/\/api\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(r.request().url().includes('deletions') ? { now: Date.now(), overrides: {}, items: { [ids[1]]: { status: 'trashed', trashed_at: 1, expires_at: 1 } } } : { items: {} }) }));
  await p.evaluate(id => { localStorage.setItem('news-owner', 'test'); localStorage.setItem('news-read-v2', JSON.stringify({ [id]: { on: true, t: Date.now() } })); }, ids[0]);
  await p.reload(); await p.waitForTimeout(800);
  for (const [i, id] of ids.slice(0, 2).entries()) { const m = await p.$(`.card[data-id="${id}"]`); const sec = await m.evaluateHandle(c => c.closest('.module') || c.closest('section'));
    await sec.screenshot({ path: `${prefix}-${i ? 'deleted' : 'collapsed'}-${w}.png` }); }
  await p.close();
}
await b.close(); srv.close();
