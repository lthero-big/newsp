// Owner-only MCP admin (aligned with design-daily 36839eb: per-client tabs): setup snippets + token management via /api/mcp-tokens (owner passphrase).
(() => {
  const root = document.getElementById('mcp'); const ENDPOINT = location.origin + '/mcp';
  const tok = () => localStorage.getItem('news-owner') || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—';
  async function api(method, body) { const r = await fetch('api/mcp-tokens', { method, headers: { authorization: 'Bearer ' + tok(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status, retry: r.headers.get('retry-after') }); return j; }
  const copyText = async (t, btn) => { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } if (btn) { const o = btn.textContent; btn.textContent = '已复制'; setTimeout(() => btn.textContent = o, 1200); } };
  // ---- client setups (formats verified against official docs, see `docs` links) ----
  const TK = '\u0000T\u0000'; // token sentinel, replaced at render time
  const NAME = 'newsp';
  const CLIENTS = [
    { id: 'cursor', label: 'Cursor', docs: 'https://cursor.com/docs/context/mcp',
      steps: ['创建令牌（上方）', '把配置写入全局 <code>~/.cursor/mcp.json</code> 或项目 <code>.cursor/mcp.json</code>', '在 Customize → MCP 里确认 news-daily 已启用'],
      blocks: [{ file: '~/.cursor/mcp.json', lang: 'json', code: `{\n  "mcpServers": {\n    "${NAME}": {\n      "url": "${ENDPOINT}",\n      "headers": { "Authorization": "Bearer ${TK}" }\n    }\n  }\n}` }] },
    { id: 'claude-code', label: 'Claude Code', docs: 'https://code.claude.com/docs/en/mcp',
      steps: ['创建令牌', '在终端运行下面的命令（加 <code>--scope user</code> 可在所有项目可用）', '运行 <code>claude mcp list</code> 或在会话里 <code>/mcp</code> 确认 ✔ Connected'],
      blocks: [{ file: 'Terminal', lang: 'bash', code: `claude mcp add --transport http ${NAME} ${ENDPOINT} \\\n  --header "Authorization: Bearer ${TK}"` }] },
    { id: 'claude-desktop', label: 'Claude Desktop', docs: 'https://github.com/geelen/mcp-remote#custom-headers',
      steps: ['创建令牌', 'Settings → Developer → Edit Config，写入下面的配置（自定义 Connector 走 OAuth，不支持静态 Bearer，所以用 mcp-remote 桥接；需要 Node.js）', '完全退出并重启 Claude Desktop'],
      blocks: [{ file: 'claude_desktop_config.json', lang: 'json', code: `{\n  "mcpServers": {\n    "${NAME}": {\n      "command": "npx",\n      "args": [\n        "-y", "mcp-remote",\n        "${ENDPOINT}",\n        "--header", "Authorization:\${AUTH_HEADER}"\n      ],\n      "env": { "AUTH_HEADER": "Bearer ${TK}" }\n    }\n  }\n}` }],
      note: '<code>Authorization:${AUTH_HEADER}</code> 中冒号两侧不留空格，是 mcp-remote 文档给出的 Windows 参数转义规避写法。' },
    { id: 'codex', label: 'Codex', docs: 'https://developers.openai.com/codex/mcp',
      steps: ['创建令牌', '在 <code>~/.codex/config.toml</code> 加入下面的表（原生支持 Streamable HTTP，无需 mcp-remote）', '把令牌放进环境变量，然后在 Codex TUI 里用 <code>/mcp</code> 确认'],
      blocks: [{ file: '~/.codex/config.toml', lang: 'toml', code: `[mcp_servers.news_daily]\nurl = "${ENDPOINT}"\nbearer_token_env_var = "NEWS_DAILY_MCP_TOKEN"` },
               { file: '~/.zshrc 或 ~/.bashrc', lang: 'bash', code: `export NEWS_DAILY_MCP_TOKEN="${TK}"` }],
      note: '也可以不用环境变量，直接写 <code>http_headers = { "Authorization" = "Bearer …" }</code>。' },
    { id: 'grok', label: 'Grok', docs: 'https://docs.x.ai/developers/tools/remote-mcp',
      steps: ['创建令牌', 'Grok CLI：一条命令添加；或在 xAI API 的 tools 里声明 <code>type: "mcp"</code>', 'xAI 由服务端连接 MCP，所以端点必须公网可达（本站已满足）'],
      blocks: [{ file: 'Grok CLI', lang: 'bash', code: `grok mcp add --transport http ${NAME} ${ENDPOINT} \\\n  --header "Authorization: Bearer ${TK}"`, docs: 'https://docs.x.ai/build/features/mcp-servers' },
               { file: 'xAI Responses API', lang: 'bash', code: `curl https://api.x.ai/v1/responses \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $XAI_API_KEY" \\\n  -d '{\n  "model": "grok-4.7",\n  "input": "用 news-daily 找本周和 Agent 相关的模型新闻，按日期列出",\n  "tools": [{\n    "type": "mcp",\n    "server_url": "${ENDPOINT}",\n    "server_label": "news_daily",\n    "authorization": "Bearer ${TK}",\n    "allowed_tools": ["search_news", "list_favorites", "list_sources", "list_filters", "get_item"]\n  }]\n}'` }] },
    { id: 'vscode', label: 'VS Code', docs: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
      steps: ['创建令牌', '在工作区新建 <code>.vscode/mcp.json</code>（注意顶层键是 <code>servers</code>）', '打开 Copilot Chat 的 Agent 模式，Configure Tools 里勾选 news-daily'],
      blocks: [{ file: '.vscode/mcp.json', lang: 'json', code: `{\n  "servers": {\n    "${NAME}": {\n      "type": "http",\n      "url": "${ENDPOINT}",\n      "headers": { "Authorization": "Bearer ${TK}" }\n    }\n  }\n}` }],
      note: '令牌是秘密：不要把含令牌的 mcp.json 提交到仓库。' },
    { id: 'windsurf', label: 'Windsurf', docs: 'https://docs.windsurf.com/windsurf/cascade/mcp',
      steps: ['创建令牌', 'Cascade 面板 … → Open MCP config file，加入下面的条目（远程服务用 <code>serverUrl</code>）', '保存后在 MCPs 列表里打开开关'],
      blocks: [{ file: 'mcp_config.json', lang: 'json', code: `{\n  "mcpServers": {\n    "${NAME}": {\n      "serverUrl": "${ENDPOINT}",\n      "headers": { "Authorization": "Bearer ${TK}" }\n    }\n  }\n}` }],
      note: '文件位置：macOS / Linux <code>~/.config/devin/mcp_config.json</code>，Windows <code>%APPDATA%\\devin\\mcp_config.json</code>（适用于 legacy Cascade agent）。' },
    { id: 'test', label: '测试连接', docs: 'https://modelcontextprotocol.io/specification/2025-06-18/basic/transports',
      steps: ['创建令牌', '运行下面的 curl：应返回 5 个工具名', '返回 401 说明令牌无效或已吊销；连续 3 次无效会锁定 15 分钟'],
      blocks: [{ file: 'Terminal', lang: 'bash', code: `curl -s ${ENDPOINT} \\\n  -H "Authorization: Bearer ${TK}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` }] },
  ];
  const TOOLS_REF = [
    ['search_news', '按关键词 / 模块 / 标签 / 来源 / 日期搜索每日新闻，返回摘要', [['query', 'string', '关键词（标题/摘录/来源/关键词）'], ['module', 'model | opensource | community', '模型新闻 / 开源项目发现 / 社区新闻'], ['tags', 'string[]', 'AI、LLM、图片视频音频、Agent，需全部包含'], ['source', 'string', '来源子串，如 Hacker News、r/LocalLLaMA、GitHub、X'], ['only', 'favorites | liked | either | both', '只看收藏 / ♥ 点赞 / 收藏或点赞 / 两者都有；不填不过滤'], ['date_from / date_to', 'YYYY-MM-DD', '发布日期，含边界'], ['limit', 'integer 1–50', '默认 10']]],
    ['list_favorites', '列出你收藏、♥ 点赞的新闻（和收藏页同源），默认按收藏时间倒序', [['only', 'favorites | liked | either | both', '默认 either（收藏或点赞）'], ['query', 'string', '关键词，可选'], ['module / tags', '同 search_news', ''], ['fav_from / fav_to', 'YYYY-MM-DD', '收藏 / 点赞时间（北京时间），含边界'], ['date_from / date_to', 'YYYY-MM-DD', '发布日期，含边界'], ['sort', 'fav_time | date', '默认 fav_time'], ['limit', 'integer 1–100', '默认 20']]],
    ['list_sources', '列出订阅源（和订阅源页同源）：名称、类别、类型、分组、公开链接 / RSSHub 路由、权重 −1…+2、是否启用 / 实际生效、最近一次抓取 · 入选数；不含密钥和服务器地址', [['category', 'x | reddit | hn | rss | rsshub | github | hf | ossinsight', '类别'], ['type', 'x_query | x_keyword | x_account | reddit | hn_query | rss | rsshub | github_search | hf_trending | hf_org | ossinsight', '源类型'], ['enabled', 'boolean', 'true 只看实际生效的（自身 + 分组 + 类别都开），false 只看停用的'], ['query', 'string', '名称 / 链接 / 分组 / 关键词子串'], ['limit', 'integer 1–500', '默认 200']]],
    ['list_filters', '列出模块、标签、来源、日期及数量，以及收藏 / 点赞数', []],
    ['get_item', '取单条：原标题、摘录、来源、指标、链接、规则得分、是否收藏 / 点赞', [['id', 'string', '必填，来自 search_news / list_favorites']]],
  ];
  let tab = localStorage.getItem('news-mcp-tab') || 'cursor';
  const codeHtml = (code, T) => esc(code).split(TK).join(T ? `<span class="tok">${esc(T)}</span>` : '<mark class="ph" title="创建令牌后自动填入">&lt;YOUR_MCP_TOKEN&gt;</mark>');
  const codeText = (code, T) => code.split(TK).join(T || '<YOUR_MCP_TOKEN>');
  function setupHtml(T) {
    const c = CLIENTS.find(x => x.id === tab) || CLIENTS[0];
    return `<div class="cl-tabs" role="tablist" aria-label="选择客户端">${CLIENTS.map(x => `<button role="tab" id="tab-${x.id}" aria-controls="tp" aria-selected="${x.id === c.id}" tabindex="${x.id === c.id ? 0 : -1}" data-tab="${x.id}">${x.label}</button>`).join('')}</div>
<div class="cl-panel" role="tabpanel" id="tp" aria-labelledby="tab-${c.id}" tabindex="0">
<ol class="cl-steps">${c.steps.map((st, i) => `<li${i === 0 && T ? ' class="done"' : ''}><span>${i + 1}</span><p>${st}</p></li>`).join('')}</ol>
${c.blocks.map((b, i) => `<figure class="cb"><figcaption><span class="cb-file">${esc(b.file)}</span><span class="cb-lang">${b.lang}</span>${b.docs ? `<a class="cb-doc" href="${b.docs}" target="_blank" rel="noopener">docs ↗</a>` : ''}<button class="cb-copy" data-block="${i}" aria-label="复制 ${esc(b.file)}">复制</button></figcaption><pre><code>${codeHtml(b.code, T)}</code></pre></figure>`).join('')}
${c.note ? `<p class="cl-note">${c.note}</p>` : ''}
<div class="cl-foot">${T ? '<span class="ok">✓ 已自动填入新令牌</span>' : '<span class="warn">先在上方创建令牌，创建后自动填入；或把高亮处换成你保存过的令牌</span>'}<a href="${c.docs}" target="_blank" rel="noopener">${c.label} 官方文档 ↗</a></div></div>
<details class="tref"><summary>工具参考 · 5 个只读工具</summary>${TOOLS_REF.map(([n, d, ps]) => `<div class="tr"><code class="tn">${n}</code><p>${d}</p>${ps.length ? `<table>${ps.map(([k, t, h]) => `<tr><td><code>${k}</code></td><td>${esc(t)}</td><td>${h}</td></tr>`).join('')}</table>` : '<p class="hint">无参数</p>'}</div>`).join('')}</details>`;
  }
  let created = null;
  const curTok = () => (created && created.token) || '';
  function render(tokens, msg) {
        root.innerHTML = `
<section class="panel ep"><div class="ep-row"><span class="ep-k">端点</span><code>${esc(ENDPOINT)}</code><button data-copy="${esc(ENDPOINT)}">复制</button></div>
<div class="ep-row"><span class="ep-k">令牌</span><span class="hint">只能在下方「创建令牌」由服务端随机生成，创建时显示一次并自动填入配置；不能手动设置或粘贴。</span></div>
<p class="hint">Streamable HTTP · POST JSON-RPC · 协议 2025-06-18 / 2025-03-26 / 2024-11-05 · Bearer 令牌（服务端只存 SHA-256）</p></section>
<section class="panel"><h2>1 · 创建令牌</h2><form id="mk" class="row"><input name="name" placeholder="令牌名称，如 cursor-macbook" maxlength="60" required><button>创建</button></form>
${created ? `<div class="once"><b>新令牌「${esc(created.name)}」只显示这一次，请立即保存：</b><code id="newtok">${esc(created.token)}</code><button data-copy="${esc(created.token)}">复制</button><p>下面各客户端的配置已自动填入这个令牌。</p></div>` : ''}
${msg ? `<p class="msg">${esc(msg)}</p>` : ''}</section>
<section class="panel setup"><h2>2 · 接入客户端</h2>${setupHtml(curTok())}</section>
<section class="panel"><h2>3 · 令牌列表</h2><table><thead><tr><th>名称</th><th>前缀</th><th>创建</th><th>最近使用</th><th>状态</th><th></th></tr></thead><tbody>
${tokens.map(t => `<tr data-id="${esc(t.id)}"><td>${esc(t.name)}</td><td><code>ndm_${esc(t.prefix)}…</code></td><td>${fmt(t.created_at)}</td><td>${fmt(t.last_used_at)}</td><td>${t.revoked_at ? `<span class="st off">已吊销 ${fmt(t.revoked_at)}</span>` : '<span class="st on">有效</span>'}</td>
<td>${t.revoked_at ? '<button data-act="delete">删除</button>' : '<button data-act="regenerate">重新生成</button><button data-act="revoke" class="danger">吊销</button>'}</td></tr>`).join('') || '<tr><td colspan="6">还没有令牌</td></tr>'}
</tbody></table></section>`;
  }
  async function load(msg) { if (!tok()) { root.innerHTML = '<p class="empty">仅主人可见。</p>'; return; }
    try { render((await api('GET')).tokens, msg); } catch (e) { root.innerHTML = `<p class="empty">${e.status === 429 ? `尝试次数过多，已锁定，请 ${Math.ceil((+e.retry || 900) / 60)} 分钟后再试。` : '口令无效或已过期，请重新解锁。'}</p>`; } }
  root.addEventListener('submit', async e => { e.preventDefault(); const name = new FormData(e.target).get('name'); try { const j = await api('POST', { action: 'create', name }); created = j.created; render(j.tokens); } catch (er) { load('创建失败：' + er.message); } });
  function selectTab(id, focus) { tab = id; localStorage.setItem('news-mcp-tab', id); const sec = root.querySelector('.setup'); if (!sec) return; const open = sec.querySelector('details.tref')?.open;
    sec.innerHTML = '<h2>2 · 接入客户端</h2>' + setupHtml(curTok()); if (open) sec.querySelector('details.tref').open = true;
    const t = sec.querySelector(`[data-tab="${id}"]`); t.scrollIntoView({ block: 'nearest', inline: 'center' }); if (focus) t.focus(); }
  root.addEventListener('keydown', e => { const t = e.target.closest('[role=tab]'); if (!t) return; const ids = CLIENTS.map(c => c.id); let i = ids.indexOf(t.dataset.tab);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = ids.length - 1; else return;
    e.preventDefault(); selectTab(ids[i], true); });
  root.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) return copyText(c.dataset.copy, c);
    const tb = e.target.closest('[data-tab]'); if (tb) return selectTab(tb.dataset.tab, false);
    const cb = e.target.closest('.cb-copy'); if (cb) { const cl = CLIENTS.find(x => x.id === tab); return copyText(codeText(cl.blocks[+cb.dataset.block].code, curTok()), cb); }
    const a = e.target.closest('[data-act]'); if (!a) return; const id = a.closest('tr').dataset.id, act = a.dataset.act;
    if (act !== 'delete' && !confirm(act === 'revoke' ? '吊销后使用该令牌的客户端会立即失效，确定？' : '重新生成会吊销旧令牌并创建一个同名新令牌，确定？')) return;
    try { const j = await api('POST', { action: act, id }); created = j.created || null; render(j.tokens, act === 'revoke' ? '已吊销' : act === 'delete' ? '已删除' : ''); } catch (er) { load('操作失败：' + er.message); } });
  addEventListener('news-state', () => load()); load();
})();
