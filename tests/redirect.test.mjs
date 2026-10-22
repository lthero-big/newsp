// v3.6: old root day URLs 301 to /yyyy/mm/date (functions/_middleware.js)
import assert from 'node:assert/strict';
import test from 'node:test';
import { dayRedirect, onRequest } from '../functions/_middleware.js';
import { dayPath } from '../scripts/build.mjs';
test('old day URLs redirect, others pass', async () => {
  assert.equal(dayRedirect('https://news.lthero.com/2026-10-17'), 'https://news.lthero.com/2026/10/2026-10-17');
  assert.equal(dayRedirect('https://news.lthero.com/2026-10-17.html?theme=x'), 'https://news.lthero.com/2026/10/2026-10-17?theme=x');
  for (const u of ['/', '/index.html', '/2026/10/2026-10-17', '/archive', '/api/ratings', '/2026-10-1']) assert.equal(dayRedirect('https://n.test' + u), null, u);
  const r = await onRequest({ request: new Request('https://n.test/2026-10-16.html'), next: () => { throw new Error('no'); } });
  assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://n.test/2026/10/2026-10-16');
  const ok = await onRequest({ request: new Request('https://n.test/'), next: async () => new Response('hi') });
  assert.equal(ok.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(dayPath('2026-10-17'), '2026/10/2026-10-17.html');
});
