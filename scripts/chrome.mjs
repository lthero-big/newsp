// One Chrome launcher for every news-daily script/test (tests/*.mjs, compose-edition.mjs). The box is shared with design-daily, whose
// test-themes.mjs drives Chrome over CDP on :9553 (DD_CDP_PORT). Ours never take that port:
//  - default: Playwright launch over a pipe (--remote-debugging-pipe) with a throwaway profile, so no TCP port is opened at all;
//  - NEWS_CDP_PORT=<port>: start our own headless Chrome on that port (news reserves 9563; any free port works) with its own profile
//    (/tmp/news-cdp-<port>) and connect over CDP, e.g. to attach DevTools. An already-listening Chrome on that port is reused, never killed.
// env: CHROME (binary, default /usr/bin/google-chrome), PLAYWRIGHT_CORE (module path), NEWS_CDP_PORT.
import { spawn } from 'node:child_process';
import os from 'node:os';
export const NEWS_CDP_DEFAULT = 9563;
export const cdpPort = () => { const v = process.env.NEWS_CDP_PORT; if (!v) return null; const n = v === '1' || v === 'default' ? NEWS_CDP_DEFAULT : +v;
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`NEWS_CDP_PORT must be a port 1024–65535 (got ${v})`);
  if (n === 9553) throw new Error('NEWS_CDP_PORT=9553 is design-daily\'s test port; use 9563'); return n; };
export async function launchChrome(opts = {}) {
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/node_modules/playwright-core/index.mjs');
  const bin = process.env.CHROME || '/usr/bin/google-chrome', port = cdpPort();
  if (!port) return chromium.launch({ executablePath: bin, ...opts });
  const url = `http://127.0.0.1:${port}`, up = async () => { try { return (await fetch(url + '/json/version')).ok; } catch { return false; } };
  let proc = null;
  if (!(await up())) { proc = spawn(bin, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${os.tmpdir()}/news-cdp-${port}`, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await up()); i++) await new Promise(r => setTimeout(r, 250)); if (!(await up())) { proc.kill(); throw new Error(`Chrome did not open CDP on :${port}`); } }
  const b = await chromium.connectOverCDP(url), close = b.close.bind(b);
  b.close = async () => { for (const c of b.contexts()) for (const p of c.pages()) await p.close().catch(() => {}); await close(); if (proc) proc.kill(); };
  return b;
}
