// Read-only MCP server (Streamable HTTP, JSON responses), ported from design-daily functions/mcp.js.
// POST /mcp JSON-RPC · GET -> 405 (HTML -> /mcp-admin) · DELETE -> 204.  Auth: Bearer <MCP token> (managed on /mcp-admin, owner only).
import catalog from '../lib/catalog.js';
import { json, mcpGate } from './api/_auth.js';
import SRC_DEFAULTS from '../config/collect-sources.json';  // plain import like functions/api/sources.js (the Pages build's bundler rejects import attributes); tests add a json loader hook
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id', 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS', 'access-control-expose-headers': 'mcp-session-id, www-authenticate' };
const SITE = 'https://news.lthero.com';
const items = catalog.items;
const MODULES = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻' };
const TAGS = ['AI', 'LLM', '图片视频音频', 'Agent'];
const summary = it => ({ id: it.id, date: it.date, module: it.module, moduleLabel: MODULES[it.module], title: it.title, source: it.source, tags: it.tags, url: it.url, pageUrl: `${SITE}/${it.date.slice(0, 4)}/${it.date.slice(5, 7)}/${it.date}#${it.id}` });
// 收藏 / 点赞 filters read the owner's state from D1 (ratings: fav + fav_at = 收藏, vote = 1 = ♥ 点赞) — only after mcpGate, so owner data stays behind the token.
const MINE = { favorites: '只看收藏', liked: '只看 ♥ 点赞', either: '收藏或点赞（= 收藏页「同时列出 ♥ 点赞的」）', both: '既收藏又点赞' };
const mineProp = { type: 'string', enum: Object.keys(MINE), description: '按主人状态过滤：favorites = 收藏，liked = ♥ 点赞，either = 收藏或点赞，both = 两者都有。不填 = 不过滤。' };
const DAY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const RO = { readOnlyHint: true, openWorldHint: false };
const SRC_CATS = { x: 'X', reddit: 'Reddit', hn: 'Hacker News', rss: 'RSS', rsshub: 'RSSHub', github: 'GitHub', hf: 'Hugging Face', ossinsight: 'OSSInsight' };
const SRC_TYPES = ['x_query', 'x_keyword', 'x_account', 'reddit', 'hn_query', 'rss', 'rsshub', 'github_search', 'hf_trending', 'hf_org', 'ossinsight'];
const TOOLS = [
  { name: 'search_news', title: 'Search AI news', description: '搜索每日 AI 新闻（只读）。按关键词/模块/标签/来源/日期过滤，可用 only 只看收藏或 ♥ 点赞的；返回摘要（带 fav / liked 状态），用 get_item 取详情。',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords (title, excerpt, source). Empty = all.' },
      module: { type: 'string', enum: Object.keys(MODULES) },
      tags: { type: 'array', items: { type: 'string', enum: TAGS }, description: 'Must include all of these tags' },
      source: { type: 'string', description: 'Substring of source label, e.g. "Hacker News", "r/LocalLLaMA", "GitHub", "X"' },
      only: mineProp,
      date_from: { ...DAY, description: '发布日期（含），YYYY-MM-DD' }, date_to: { ...DAY, description: '发布日期（含），YYYY-MM-DD' },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }, additionalProperties: false },
    annotations: RO },
  { name: 'list_favorites', title: 'List favorites / liked', description: '列出主人收藏、♥ 点赞的新闻（只读，和网站「收藏」页同源）。默认 either（收藏或点赞），按收藏时间倒序；可按收藏时间或发布日期范围、模块、标签、关键词过滤。',
    inputSchema: { type: 'object', properties: {
      only: { ...mineProp, default: 'either' },
      query: { type: 'string', description: '关键词（标题/摘录/来源），可选' },
      module: { type: 'string', enum: Object.keys(MODULES) },
      tags: { type: 'array', items: { type: 'string', enum: TAGS }, description: 'Must include all of these tags' },
      fav_from: { ...DAY, description: '收藏 / 点赞时间（北京时间日期，含），YYYY-MM-DD' }, fav_to: { ...DAY, description: '收藏 / 点赞时间（北京时间日期，含）' },
      date_from: { ...DAY, description: '发布日期（含）' }, date_to: { ...DAY, description: '发布日期（含）' },
      sort: { type: 'string', enum: ['fav_time', 'date'], default: 'fav_time', description: 'fav_time = 按收藏 / 点赞时间，date = 按发布日期' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }, additionalProperties: false },
    annotations: RO },
  { name: 'list_sources', title: 'List subscription sources', description: '列出订阅源（信息源，和网站「订阅源」页同源）：X 查询 / 账号、Reddit、Hacker News、RSS、RSSHub 路由、GitHub、Hugging Face、OSSInsight。返回名称、类别、类型、分组、公开链接、权重（−1…+2）、是否启用，以及最近一次采集的抓取 / 入选数。不含任何密钥或服务器地址。',
    inputSchema: { type: 'object', properties: {
      category: { type: 'string', enum: Object.keys(SRC_CATS), description: '类别：' + Object.entries(SRC_CATS).map(([k, v]) => `${k} = ${v}`).join('，') },
      type: { type: 'string', enum: SRC_TYPES, description: '源类型' },
      enabled: { type: 'boolean', description: 'true = 只看实际生效的（自身、分组、类别都开着），false = 只看停用的' },
      query: { type: 'string', description: '名称 / 链接 / 分组 / 关键词子串' },
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 } }, additionalProperties: false },
    annotations: RO },
  { name: 'list_filters', title: 'List filters', description: '列出模块、标签、来源、日期及数量，以及收藏 / 点赞数。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: RO },
  { name: 'get_item', title: 'Get one news item', description: '获取单条：原标题、摘录、来源、指标、链接、规则得分、是否收藏 / 点赞。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, annotations: RO },
];
const USER = 'me';
// ---- 订阅源 (same merge as site/assets/sources.js: bundled defaults + owner config in D1 + last collector status) ----
const readKV = async (env, k) => { const r = await env.DB.prepare('SELECT v, updated_at FROM source_settings WHERE user_id=?1 AND k=?2').bind(USER, k).first(); try { return r ? { ...JSON.parse(r.v), updated_at: r.updated_at } : null; } catch { return null; } };
// only public facts: names, public pages / feed URLs, RSSHub route paths (never the RSSHub base or key), weights, switches, counts. Raw collector errors are reduced to ok / empty / failed.
export function buildSources(D, cfg, st) {
  const C = { disabled: [], removed: [], rsshub: [], x_keywords: [], x_accounts: [], feeds: [], subreddits: [], hf_orgs: [], weights: {}, x_groups: {}, ...(cfg || {}) };
  const off = new Set(C.disabled), W = C.weights || {}, S = (st && st.sources) || {};
  const plug = c => !off.has('plugin:' + c);
  const health = id => { const s = S[id]; if (!s) return {}; const ok = !s.status || /^ok/.test(s.status) || s.status === 'empty';
    return { last_run: { fetched: s.fetched ?? 0, selected: s.selected ?? 0, status: ok ? (s.status === 'empty' ? 'empty' : 'ok') : 'failed' } }; };
  const out = [];
  const add = (category, type, o) => { const own = o.enabled !== false, active = own && plug(category) && o.group_on !== false; const { group_on, ...rest } = o;
    out.push({ category, category_label: SRC_CATS[category], type, ...rest, enabled: own, active, ...(o.sid ? health(o.sid) : {}) }); };
  const wOf = (k, def = 0) => { const v = W[String(k).toLowerCase()]; return Math.max(-1, Math.min(2, Math.round(v ?? def ?? 0))); };
  const clean = o => { delete o.sid; return o; };
  for (const q of (D.x?.queries || [])) add('x', 'x_query', { id: 'xq:' + q.id, name: q.label, group: '默认查询', terms: q.terms, url: 'https://x.com/search?q=' + encodeURIComponent(q.terms.join(' OR ')) + '&f=live', enabled: !off.has('xq:' + q.id), sid: 'xq:' + q.id });
  for (const kw of C.x_keywords) add('x', 'x_keyword', { id: 'xkw:' + kw, name: kw, group: '自定义关键词', url: 'https://x.com/search?q=' + encodeURIComponent(kw) + '&f=live' });
  for (const a0 of C.x_accounts) { const a = typeof a0 === 'string' ? { handle: a0, enabled: true } : a0, g = a.group || '未分组';
    add('x', 'x_account', { id: 'xa:' + a.handle, name: '@' + a.handle, ...(a.name ? { display_name: a.name } : {}), group: g, url: 'https://x.com/' + a.handle, weight: wOf('xa:' + a.handle), enabled: !!a.enabled, group_on: (C.x_groups || {})[g] !== false,
      ...(a.keywords?.length ? { extra_keywords: a.keywords } : {}), ...(a.from === 'following' ? { from: 'following' } : {}), ...(a.unverified ? { unverified: true } : {}) }); }
  for (const f of (D.reddit?.feeds || [])) add('reddit', 'reddit', { id: 'reddit:' + f.subreddit, name: 'r/' + f.subreddit, group: '子版块', mode: f.mode, url: `https://www.reddit.com/r/${f.subreddit}/`, weight: wOf('reddit:' + f.subreddit, f.weight), enabled: !off.has('reddit:' + f.subreddit), sid: 'reddit:' + f.subreddit });
  for (const n of C.subreddits) add('reddit', 'reddit', { id: 'reddit:' + n, name: 'r/' + n, group: '卡片上添加的', mode: 'new', url: `https://www.reddit.com/r/${n}/`, weight: wOf('reddit:' + n), enabled: !off.has('reddit:' + n), sid: 'reddit:' + n });
  for (const q of (D.hn?.queries || [])) add('hn', 'hn_query', { id: 'hn:' + q, name: q, group: '关键词', url: 'https://hn.algolia.com/?query=' + encodeURIComponent(q) });
  for (const f of (D.rss || [])) add('rss', 'rss', { id: 'rss:' + f.id, name: f.label || f.id, group: '订阅', url: f.url, weight: wOf('rss:' + f.id, f.weight), enabled: !off.has('rss:' + f.id), sid: 'rss:' + f.id });
  for (const f of C.feeds) add('rss', 'rss', { id: 'rss:' + f.id, name: f.label || f.id, group: '卡片上添加的', url: f.url, weight: wOf('rss:' + f.id), enabled: !off.has('rss:' + f.id), sid: 'rss:' + f.id });
  for (const r of (D.rsshub?.routes || []).filter(r => !C.removed.includes(r.id))) add('rsshub', 'rsshub', { id: 'rsshub:' + r.id, name: r.label || r.id, group: '默认路由', route: r.route, docs: 'https://docs.rsshub.app/routes/', weight: wOf('rsshub:' + r.id), enabled: !off.has('rsshub:' + r.id), sid: 'rsshub:' + r.id });
  for (const r of C.rsshub) add('rsshub', 'rsshub', { id: 'rsshub:' + r.id, name: r.label, group: '自建路由', route: r.route, docs: 'https://docs.rsshub.app/routes/', weight: wOf('rsshub:' + r.id), enabled: !off.has('rsshub:' + r.id), sid: 'rsshub:' + r.id });
  add('github', 'github_search', { id: 'plugin:github', name: 'GitHub 新仓库', queries: D.github_search?.queries || [], url: 'https://github.com/search?type=repositories&s=stars', sid: 'plugin:github' });
  add('hf', 'hf_trending', { id: 'plugin:hf', name: 'Hugging Face 热门模型', url: 'https://huggingface.co/models?sort=trending', sid: 'plugin:hf' });
  for (const o of C.hf_orgs) add('hf', 'hf_org', { id: 'hforg:' + o, name: o, group: '关注的组织', url: 'https://huggingface.co/' + o, enabled: !off.has('hforg:' + o) });
  add('ossinsight', 'ossinsight', { id: 'plugin:ossinsight', name: 'OSSInsight 开源趋势', url: 'https://ossinsight.io/trending', sid: 'plugin:ossinsight' });
  out.forEach(clean);
  const categories = Object.entries(SRC_CATS).map(([value, label]) => ({ value, label, enabled: plug(value), sources: out.filter(o => o.category === value).length, active: out.filter(o => o.category === value && o.active).length, ...health('plugin:' + value) }));
  return { sources: out, categories, last_collect: st && Number.isFinite(+new Date(st.run_at)) ? { at: shIso(+new Date(st.run_at)), run: String(st.run || '').slice(0, 40) } : null };
}
function sourcesTool(a, all) {
  const q = String(a.query || '').toLowerCase().trim(), lim = Math.max(1, Math.min(500, +a.limit || 200));
  const list = all.sources.filter(s => (!a.category || s.category === a.category) && (!a.type || s.type === a.type) && (a.enabled === undefined || s.active === !!a.enabled)
    && (!q || [s.name, s.display_name, s.url, s.route, s.group, ...(s.terms || []), ...(s.extra_keywords || []), ...(s.queries || [])].filter(Boolean).join(' ').toLowerCase().includes(q)));
  return { total: list.length, active: list.filter(s => s.active).length, last_collect: all.last_collect, categories: all.categories, sources: list.slice(0, lim) };
}
// { [item_id]: { fav, liked, favAt, at } } — at = 收藏时间, or the last update for 点赞-only rows (same rule as the 收藏 page)
async function mineState(env) {
  const { results } = await env.DB.prepare('SELECT item_id, fav, vote, updated_at, fav_at FROM ratings WHERE user_id = ?1 AND (fav = 1 OR vote = 1)').bind(USER).all();
  return Object.fromEntries(results.map(r => [r.item_id, { fav: !!r.fav, liked: r.vote === 1, favAt: r.fav && r.fav_at ? r.fav_at : null, at: (r.fav && r.fav_at) || r.updated_at }]));
}
const pick = (only, s) => !!s && (only === 'favorites' ? s.fav : only === 'liked' ? s.liked : only === 'both' ? s.fav && s.liked : s.fav || s.liked);
const shDay = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);   // Asia/Shanghai calendar day
const shIso = t => new Date(t + 8 * 3600e3).toISOString().replace('Z', '+08:00').replace(/\.\d{3}/, '');
const mineOf = s => s ? { fav: s.fav, liked: s.liked, ...(s.favAt ? { fav_at: shIso(s.favAt) } : {}), ...(s.liked && !s.fav ? { liked_at: shIso(s.at) } : {}) } : { fav: false, liked: false };
const bad = msg => ({ content: [{ type: 'text', text: msg }], isError: true });
const badDay = a => ['date_from', 'date_to', 'fav_from', 'fav_to'].find(k => a[k] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(a[k])));
function search(a, mine) {
  const q = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean), tg = (a.tags || []).map(String), src = String(a.source || '').toLowerCase();
  const lim = Math.max(1, Math.min(50, +a.limit || 10)); const out = [];
  for (const it of items) {
    if (a.module && it.module !== a.module) continue;
    if (tg.length && !tg.every(t => it.tags.includes(t))) continue;
    if (src && !it.source.toLowerCase().includes(src)) continue;
    if (a.date_from && it.date < a.date_from) continue; if (a.date_to && it.date > a.date_to) continue;
    if (mine && a.only && !pick(a.only, mine[it.id])) continue;
    let score = 0; if (q.length) { const t = it.title.toLowerCase(), b = `${it.excerpt} ${it.source} ${(it.keywords || []).join(' ')}`.toLowerCase();
      for (const w of q) score += (t.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0); if (!score) continue; }
    out.push({ ...summary(it), ...(mine ? mineOf(mine[it.id]) : {}), score });
  }
  out.sort((x, y) => y.score - x.score || y.date.localeCompare(x.date));
  return { total: out.length, results: out.slice(0, lim) };
}
function favorites(a, mine) {
  const only = a.only || 'either', q = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean), tg = (a.tags || []).map(String);
  const lim = Math.max(1, Math.min(100, +a.limit || 20)); const out = [];
  for (const it of items) { const s = mine[it.id]; if (!pick(only, s)) continue;
    if (a.module && it.module !== a.module) continue;
    if (tg.length && !tg.every(t => it.tags.includes(t))) continue;
    if (a.date_from && it.date < a.date_from) continue; if (a.date_to && it.date > a.date_to) continue;
    const day = shDay(s.at); if (a.fav_from && day < a.fav_from) continue; if (a.fav_to && day > a.fav_to) continue;
    if (q.length) { const t = `${it.title} ${it.excerpt} ${it.source} ${(it.keywords || []).join(' ')}`.toLowerCase(); if (!q.every(w => t.includes(w))) continue; }
    out.push({ ...summary(it), ...mineOf(s), _at: s.at });
  }
  if (a.sort === 'date') out.sort((x, y) => y.date.localeCompare(x.date) || y._at - x._at); else out.sort((x, y) => y._at - x._at || y.date.localeCompare(x.date));
  return { only, total: out.length, results: out.slice(0, lim).map(({ _at, ...r }) => r) };
}
function filters(mine) { const count = f => { const m = {}; for (const it of items) for (const k of [].concat(f(it) || [])) m[k] = (m[k] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })); };
  return { modules: Object.entries(MODULES).map(([value, label]) => ({ value, label, count: items.filter(i => i.module === value).length })), tags: count(i => i.tags), sources: count(i => i.source), dates: count(i => i.date).sort((a, b) => b.value.localeCompare(a.value)),
    mine: Object.fromEntries(Object.keys(MINE).map(k => [k, items.filter(i => pick(k, mine[i.id])).length])) }; }
const ok = (id, result) => ({ jsonrpc: '2.0', id, result }), err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const toolResult = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
async function handle(m, ctx, env) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(m && m.id !== undefined ? m.id : null, -32600, 'Invalid Request');
  const isNote = m.id === undefined || m.id === null; const p = m.params || {};
  switch (m.method) {
    case 'initialize': { const v = VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[0]; ctx.newSession = true;
      return ok(m.id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'news-daily', title: '每日 AI 新闻 MCP（只读）', version: catalog.version },
        instructions: 'Read-only archive of the daily AI news digest at news.lthero.com (modules: model / opensource / community; tags: AI, LLM, 图片视频音频, Agent). Use list_filters, search_news, get_item; list_favorites (or search_news with only=favorites|liked|either|both) for the owner\'s 收藏 / ♥ 点赞; list_sources for the 订阅源 (subscription sources).' }); }
    case 'ping': return isNote ? null : ok(m.id, {});
    case 'tools/list': return ok(m.id, { tools: TOOLS });
    case 'tools/call': { const a = p.arguments || {}; const bd = badDay(a); if (bd) return ok(m.id, bad(`${bd} must be YYYY-MM-DD`));
      if (a.only !== undefined && !MINE[a.only]) return ok(m.id, bad(`only must be one of: ${Object.keys(MINE).join(', ')}`));
      if (p.name === 'search_news') return ok(m.id, toolResult(search(a, a.only ? await mineState(env) : null)));
      if (p.name === 'list_favorites') return ok(m.id, toolResult(favorites(a, await mineState(env))));
      if (p.name === 'list_sources') { if (a.category !== undefined && !SRC_CATS[a.category]) return ok(m.id, bad(`category must be one of: ${Object.keys(SRC_CATS).join(', ')}`));
        if (a.type !== undefined && !SRC_TYPES.includes(a.type)) return ok(m.id, bad(`type must be one of: ${SRC_TYPES.join(', ')}`));
        return ok(m.id, toolResult(sourcesTool(a, buildSources(SRC_DEFAULTS, await readKV(env, 'config'), await readKV(env, 'status'))))); }
      if (p.name === 'list_filters') return ok(m.id, toolResult(filters(await mineState(env))));
      if (p.name === 'get_item') { const it = items.find(i => i.id === a.id); if (!it) return ok(m.id, bad(`item not found: ${a.id}`));
        const mine = await mineState(env); return ok(m.id, toolResult({ ...summary(it), ...mineOf(mine[it.id]), excerpt: it.excerpt, metrics: it.metrics, links: it.links, keywords: it.keywords, score: it.score, published_at: it.published_at })); }
      return err(m.id, -32602, `Unknown tool: ${p.name}`); }
    default: if (isNote) return null; return err(m.id, -32601, `Method not found: ${m.method}`);
  }
}
export async function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }
export async function onRequestGet({ request }) { if ((request.headers.get('accept') || '').includes('text/html')) return Response.redirect(new URL('/mcp-admin', request.url).toString(), 302); return new Response('Method Not Allowed: this server does not offer an SSE stream', { status: 405, headers: { allow: 'POST, DELETE, OPTIONS', ...CORS } }); }
export async function onRequestDelete({ request, env }) { const g = await mcpGate(request, env, CORS); if (g instanceof Response) return g; return new Response(null, { status: 204, headers: CORS }); }
export async function onRequestPost({ request, env }) {
  const g = await mcpGate(request, env, CORS); if (g instanceof Response) return g;
  let body; try { body = await request.json(); } catch { return json(err(null, -32700, 'Parse error'), 400, CORS); }
  const ctx = {}; const batch = Array.isArray(body); const msgs = batch ? body : [body];
  if (!msgs.length) return json(err(null, -32600, 'Invalid Request'), 400, CORS);
  const out = (await Promise.all(msgs.map(m => (m && m.method === undefined && (m.result !== undefined || m.error !== undefined)) ? null : handle(m, ctx, env)))).filter(Boolean);
  const h = { ...CORS }; if (ctx.newSession) h['mcp-session-id'] = crypto.randomUUID();
  if (!out.length) return new Response(null, { status: 202, headers: h });
  return json(batch ? out : out[0], 200, h);
}
