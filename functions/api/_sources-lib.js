// Pure helpers for /api/sources (validation + feed autodiscovery); no bindings, unit-testable.
// Owner-only 信息源 settings. GET -> { defaults, config, status }.
// POST {action:'config', config} (validated, replaces) · POST {action:'status', status} (written by the collector after each run).
// Defaults are bundled from config/collect-sources.json; the RSSHub base/key never live here (collector env only).
const ID = /^[a-z0-9][a-z0-9:_\-.]{0,80}$/i;
const ROUTE = /^\/[^\s?#<>"'`\\]{1,200}$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const KW = /^[^\n\r<>`\\]{1,60}$/;
const uniq = a => [...new Set(a)];
const SUB = /^[A-Za-z0-9_]{2,21}$/;
const HFORG = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
// Owner-added feeds (RSS/Atom URL, incl. GitHub releases.atom): [{id:'u-…', url, label}]
function cleanFeeds(list) {
  const out = [], seen = new Set();
  for (const f of list) {
    let u; try { u = new URL(String(f?.url || '')); } catch { continue; }
    if (u.protocol !== 'https:' || !publicHost(u.hostname) || u.href.length > 300) continue;
    const id = String(f.id || feedId(u.href)).toLowerCase().slice(0, 60);
    if (!ID.test(id) || seen.has(id) || seen.has(u.href)) continue; seen.add(id); seen.add(u.href);
    out.push({ id, url: u.href, label: String(f.label || u.hostname).replace(/[<>`\\]/g, '').slice(0, 40) });
  }
  return out;
}
export const feedId = url => { const g = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\.atom$/i);
  return (g ? `gh-${g[1]}-${g[2]}` : 'u-' + url.replace(/^https:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')).toLowerCase().slice(0, 60); };
export function publicHost(h) {
  h = String(h).toLowerCase();
  return !!h && h.includes('.') && !/^\[|^(\d+\.){3}\d+$|^localhost$|\.local$|\.internal$|\.lan$/.test(h);
}
// X accounts: [{handle, name?, enabled, from: 'manual'|'following'}]; legacy plain strings = enabled manual accounts.
function cleanAccounts(list) {
  const out = [], seen = new Set();
  for (const a of list) {
    const o = typeof a === 'string' ? { handle: a, enabled: true } : (a || {});
    const handle = String(o.handle || '').trim().replace(/^@/, ''); const k = handle.toLowerCase();
    if (!HANDLE.test(handle) || seen.has(k)) continue; seen.add(k);
    const group = String(o.group || '').trim().slice(0, 20);
    const keywords = uniq((Array.isArray(o.keywords) ? o.keywords : []).map(k => String(k).trim()).filter(k => KW.test(k))).slice(0, 3);
    out.push({ handle, name: String(o.name || '').slice(0, 50), enabled: !!o.enabled, from: o.from === 'following' ? 'following' : 'manual', ...(group ? { group } : {}), ...(keywords.length ? { keywords } : {}), ...(o.unverified ? { unverified: true } : {}) });
  }
  return out;
}
export function cleanConfig(c = {}) {
  const arr = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
  const rsshub = []; const seen = new Set();
  for (const r of arr(c.rsshub, 60)) {
    const route = String(r?.route || '').trim(); if (!ROUTE.test(route)) continue;
    const id = String(r.id || ('rsshub-u-' + route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase())).slice(0, 60) || 'rsshub-u';
    if (!ID.test(id) || seen.has(id)) continue; seen.add(id);
    rsshub.push({ id, route, label: String(r.label || route).slice(0, 40), max: Math.max(1, Math.min(15, +r.max || 8)) });
  }
  return {
    disabled: uniq(arr(c.disabled, 300).map(String).filter(s => ID.test(s))),
    removed: uniq(arr(c.removed, 100).map(String).filter(s => ID.test(s))),
    rsshub,
    x_keywords: uniq(arr(c.x_keywords, 40).map(s => String(s).trim()).filter(s => KW.test(s))),
    x_accounts: cleanAccounts(arr(c.x_accounts, 500)),
    feeds: cleanFeeds(arr(c.feeds, 100)),
    subreddits: uniq(arr(c.subreddits, 50).map(s => String(s).trim().replace(/^r\//i, '')).filter(s => SUB.test(s))),
    hf_orgs: uniq(arr(c.hf_orgs, 50).map(s => String(s).trim()).filter(s => HFORG.test(s))),
    // per-source weight (−1 / 0 / +1 / +2), lower-case ids reddit:<sub> · rss:<id> · rsshub:<id> · xa:<handle>; generate.py multiplies the score by 1 + 0.3·w
    weights: Object.fromEntries(Object.entries(c.weights && typeof c.weights === 'object' && !Array.isArray(c.weights) ? c.weights : {}).slice(0, 300)
      .map(([k, v]) => [String(k).toLowerCase(), v]).filter(([k, v]) => /^(reddit|rss|rsshub|xa):[a-z0-9_.@-]{1,60}$/.test(k) && Number.isInteger(v) && v >= -1 && v <= 2)),
    x_groups: Object.fromEntries(Object.entries(c.x_groups && typeof c.x_groups === 'object' ? c.x_groups : {}).slice(0, 30).map(([k, v]) => [String(k).trim().slice(0, 20), v !== false]).filter(([k]) => k)),
  };
}
// Feed autodiscovery for an article URL (owner only, server-side, deterministic): <link rel=alternate> RSS/Atom on the
// page, then a few common feed paths on the site; plus a known RSSHub route for sites without feeds.
const RSSHUB_KNOWN = { 'openai.com': ['/openai/news', 'OpenAI News'], 'anthropic.com': ['/anthropic/news', 'Anthropic News'], 'www.anthropic.com': ['/anthropic/news', 'Anthropic News'],
  'qbitai.com': ['/qbitai/category/资讯', '量子位'], 'www.qbitai.com': ['/qbitai/category/资讯', '量子位'], '36kr.com': ['/36kr/newsflashes', '36氪快讯'],
  'sspai.com': ['/sspai/index', '少数派'], 'www.ithome.com': ['/ithome/it', 'IT之家'], 'www.infoq.cn': ['/infoq/topic/AI', 'InfoQ AI'], 'huggingface.co': ['/huggingface/daily-papers', 'HF Daily Papers'] };
const isFeed = (ct, body) => /xml|rss|atom/.test(ct) || /^\s*(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 400));
async function get(url, ms = 6000) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'news-daily-discover/1.0 (+https://news.lthero.com)', accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.5' } });
  const body = (await r.text()).slice(0, 400000);
  return { ok: r.ok, ct: (r.headers.get('content-type') || '').toLowerCase(), body, url: r.url };
}
export function feedLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0]; if (!/rel=["']?alternate/i.test(t) || !/type=["']?application\/(rss|atom)\+xml/i.test(t)) continue;
    const h = t.match(/href=["']([^"']+)["']/i); const ti = t.match(/title=["']([^"']*)["']/i);
    try { const u = new URL(h[1].replace(/&amp;/g, '&'), base); if (u.protocol === 'https:') out.push({ url: u.href, label: (ti?.[1] || '').trim().slice(0, 40) }); } catch {}
  }
  return out.filter(f => !/comments|\/comments\/feed/i.test(f.url));
}
export async function discover(url) {
  let u; try { u = new URL(url); } catch { return { error: 'bad url' }; }
  if (u.protocol !== 'https:' || !publicHost(u.hostname)) return { error: 'url not allowed' };
  const host = u.hostname.toLowerCase(), site = host.replace(/^www\./, '');
  const res = { host: site, feeds: [], rsshub: RSSHUB_KNOWN[host] ? { route: RSSHUB_KNOWN[host][0], label: RSSHUB_KNOWN[host][1] } : null };
  try { const p = await get(u.href); if (p.ok && !isFeed(p.ct, p.body)) res.feeds = feedLinks(p.body, p.url); else if (p.ok) res.feeds = [{ url: p.url, label: site }]; } catch {}
  if (!res.feeds.length) {
    try { const home = await get(u.origin + '/'); if (home.ok) res.feeds = feedLinks(home.body, home.url); } catch {}
  }
  if (!res.feeds.length) {
    for (const path of ['/feed', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml', '/rss']) {
      try { const f = await get(u.origin + path, 4000); if (f.ok && isFeed(f.ct, f.body)) { res.feeds = [{ url: f.url, label: site }]; break; } } catch {}
    }
  }
  res.feeds = res.feeds.slice(0, 3).map(f => ({ ...f, label: f.label || site, id: feedId(f.url) }));
  return res;
}
