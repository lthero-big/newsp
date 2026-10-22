// 订阅源 (owner only, zip sources.html layout): category list on the left, the picked category's sections on the right; every source
// has an elastic switch (assets/switch.js), X accounts / Reddit / RSS / RSSHub a 权重 select. Stored via /api/sources (D1) on 保存. No AI.
// Not ported from the zip on purpose: 分区 rename / new 分区 / drag sort (管理-type editing) — our sections are the config's own groups.
(() => {
  const root = document.getElementById('src'); if (!root) return;
  const tok = () => localStorage.getItem('news-owner') || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = t => t ? new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  async function api(method, body) { const r = await fetch((document.body.dataset.root || '') + 'api/sources', { method, headers: { authorization: 'Bearer ' + tok(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; }
  let D = null, C = null, S = null, dirty = false, cat = new URLSearchParams(location.search).get('cat') || 'x', q = '', note = '';
  const CATS = [['x', 'X', '𝕏', '关键词搜索和指定账号（routine 连接器 / RSSHub 账号时间线）'], ['reddit', 'Reddit', 'r/', '子版块（自带 429 限速与重试）'], ['hn', 'Hacker News', 'Y', '首页与关键词'],
    ['rss', 'RSS', 'RSS', '任意 RSS / Atom'], ['rsshub', 'RSSHub', 'HUB', '自建 RSSHub 路由（服务器端用密钥验证）'], ['github', 'GitHub', 'GH', '新仓库'], ['hf', 'Hugging Face', 'HF', '热门模型与关注的组织'], ['ossinsight', 'OSSInsight', 'OI', '开源趋势']];
  const on = id => !C.disabled.includes(id);
  const cnt = id => { const s = S?.sources?.[id]; if (!s) return '<span class="sc muted">暂无记录</span>';
    const bad = s.status && !/^ok/.test(s.status) && s.status !== 'empty';
    return `<span class="sc${bad ? ' bad' : ''}" title="${esc(s.status || '')}">抓 ${s.fetched ?? 0} · 选 ${s.selected ?? 0}${bad ? ' · 失败' : ''}</span>`; };
  // 权重 (DESIGN-RULES §4): −1…+2 → score × max(0.4, 1 + 0.3·w); shows the override, else the config default; back to default drops it
  const WV = [[-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']];
  const wsel = (id, def = 0) => { const k = id.toLowerCase(), v = C.weights?.[k] ?? def ?? 0;
    return `<label class="wsel${v ? (v > 0 ? ' up' : ' down') : ''}" title="权重：分数 ×${Math.max(0.4, 1 + 0.3 * v).toFixed(1)}${def ? `（默认 ${def > 0 ? '+' : ''}${def}）` : ''}"><span>权重</span><select data-w="${esc(k)}" data-def="${def || 0}" aria-label="权重 ${esc(id)}">${WV.map(([n, l]) => `<option value="${n}"${n === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`; };
  const sw = (t, checked, label, dis = false) => `<button class="switch" type="button" role="switch" aria-checked="${checked}" data-t="${esc(t)}" aria-label="${esc(label)}"${dis ? ' disabled' : ''}><i></i></button>`;
  const x = (attr, label) => `<button class="btn sm ghost danger x" type="button" ${attr} aria-label="删除 ${esc(label)}">✕</button>`;
  // row: {name, sub, t (switch target) | null, on, w: [id, def], rm: attr, extra}
  const row = r => `<div class="sx-row${r.t && !r.on ? ' off' : ''}"><div class="sx-n"><b>${esc(r.name)}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</div><div class="sx-a">${r.extra || ''}${r.cnt || ''}${r.w ? wsel(...r.w) : ''}${r.rm || ''}${r.t ? sw(r.t, r.on, '启用 ' + r.name, r.dis) : ''}</div></div>`;
  const sect = s => `<section class="sx-sect${s.t && !s.on ? ' off' : ''}"><header><h3>${esc(s.title)}</h3>${s.tag || ''}<span class="tag plain">${s.n ?? s.rows.length}</span><span class="sp"></span>${s.head || ''}${s.t ? sw(s.t, s.on, '启用分组 ' + s.title) : ''}</header>
    ${s.rows.map(row).join('') || `<div class="sx-empty">${s.empty || '空'}</div>`}${s.foot ? `<div class="sx-foot">${s.foot}</div>` : ''}</section>`;
  const gOn = g => (C.x_groups || {})[g] !== false;
  const match = a => !q || (a.handle + ' ' + (a.name || '')).toLowerCase().includes(q);
  function sections(k) {
    const hub = (D.rsshub?.routes || []).filter(r => !C.removed.includes(r.id));
    if (k === 'x') { const groups = [...new Set(C.x_accounts.map(a => a.group || '未分组'))], list = C.x_accounts.map((a, i) => ({ ...a, i }));
      return [{ title: '默认查询', rows: (D.x?.queries || []).map(qq => ({ name: qq.label, sub: `<code>${esc(qq.terms.join(' OR ').slice(0, 70))}</code>`, t: 'id:xq:' + qq.id, on: on('xq:' + qq.id), cnt: cnt('xq:' + qq.id) })) },
        { title: '自定义关键词', rows: C.x_keywords.map((kw, i) => ({ name: kw, sub: '合并进同一条查询', rm: x(`data-rm-kw="${i}"`, kw) })), empty: '还没有',
          foot: '<form class="sadd" id="addkw"><input class="input" name="kw" placeholder="关键词，如 Grok 或 &quot;world model&quot;" maxlength="60" required aria-label="X 关键词"><button class="btn sm">添加</button></form>' },
        ...groups.map(g => { const all = list.filter(a => (a.group || '未分组') === g), rows = all.filter(match);
          return { title: g, t: 'group:' + g, on: gOn(g), n: `${all.filter(a => a.enabled).length} / ${all.length}`, tag: g === '特别关注' ? '<span class="tag">特别关注 · 低点赞门槛</span>' : '',
            rows: rows.map(a => ({ name: '@' + a.handle, sub: [esc(a.name || ''), ...(a.keywords || []).map(kk => `<span class="kw" title="随账号开关的额外搜索">+搜 ${esc(kk)}</span>`), a.unverified ? '<span class="tag err">未验证</span>' : '', a.from === 'following' ? '<span class="tag plain">关注</span>' : ''].filter(Boolean).join(' · ') || '账号',
              t: 'acct:' + a.i, on: !!a.enabled, dis: !gOn(g), w: ['xa:' + a.handle], rm: x(`data-rm-acct="${a.i}"`, '@' + a.handle) })), empty: '没有匹配的账号' }; })]; }
    if (k === 'reddit') return [{ title: '子版块', rows: (D.reddit?.feeds || []).map(f => ({ name: 'r/' + f.subreddit, sub: esc(f.mode || ''), t: 'id:reddit:' + f.subreddit, on: on('reddit:' + f.subreddit), cnt: cnt('reddit:' + f.subreddit), w: ['reddit:' + f.subreddit, f.weight] })) },
      ...(C.subreddits.length ? [{ title: '卡片上添加的', rows: C.subreddits.map((n, i) => ({ name: 'r/' + n, sub: 'new', t: 'id:reddit:' + n, on: on('reddit:' + n), cnt: cnt('reddit:' + n), w: ['reddit:' + n], rm: x(`data-rm-sub="${i}"`, 'r/' + n) })) }] : [])];
    if (k === 'rss') return [{ title: '订阅', rows: (D.rss || []).map(f => ({ name: f.id, sub: esc((f.url || '').replace(/^https?:\/\//, '').slice(0, 56)), t: 'id:rss:' + f.id, on: on('rss:' + f.id), cnt: cnt('rss:' + f.id), w: ['rss:' + f.id, f.weight] })) },
      ...(C.feeds.length ? [{ title: '卡片上添加的', rows: C.feeds.map((f, i) => ({ name: f.label || f.id, sub: esc(f.url.replace(/^https:\/\//, '').slice(0, 56)), t: 'id:rss:' + f.id, on: on('rss:' + f.id), cnt: cnt('rss:' + f.id), w: ['rss:' + f.id], rm: x(`data-rm-feed="${i}"`, f.label || f.id) })) }] : [])];
    if (k === 'rsshub') return [{ title: '默认路由', rows: hub.map(r => ({ name: r.label || r.id, sub: `<code>${esc(r.route)}</code>`, t: 'id:rsshub:' + r.id, on: on('rsshub:' + r.id), cnt: cnt('rsshub:' + r.id), w: ['rsshub:' + r.id], rm: x(`data-rm-default="${esc(r.id)}"`, r.label || r.id) })),
        foot: C.removed.length ? `已移除默认路由 ${C.removed.length} 条 <button class="btn sm ghost" type="button" id="restore">恢复</button>` : '' },
      { title: '自建路由', rows: C.rsshub.map((r, i) => ({ name: r.label, sub: `<code>${esc(r.route)}</code>`, t: 'id:rsshub:' + r.id, on: on('rsshub:' + r.id), cnt: cnt('rsshub:' + r.id), w: ['rsshub:' + r.id], rm: x(`data-rm-hub="${i}"`, r.label) })), empty: '还没有',
        foot: '<form class="sadd" id="addhub"><input class="input" name="route" placeholder="路由，如 /36kr/newsflashes" required pattern="/[^\\s?#]+" aria-label="RSSHub 路由"><input class="input" name="label" placeholder="显示名（可选）" maxlength="40" aria-label="显示名"><button class="btn sm">添加</button></form><small>路由在下次采集时由服务器端验证；失败会在这里标红。路由列表见 <a href="https://docs.rsshub.app/routes/" target="_blank" rel="noopener">docs.rsshub.app</a>。</small>' }];
    if (k === 'hn') return [{ title: '关键词', rows: (D.hn?.queries || []).map(qq => ({ name: qq, sub: '标题匹配' })), foot: '关键词跟着整个类别开关，单个不能关。' }];
    if (k === 'hf') return [{ title: '关注的组织', rows: C.hf_orgs.map((o, i) => ({ name: o, sub: 'huggingface.co/' + esc(o), t: 'id:hforg:' + o, on: on('hforg:' + o), rm: x(`data-rm-hf="${i}"`, o) })), empty: '热门模型整体开关；从卡片上「＋」可以关注组织。' }];
    return [{ title: '来源', rows: [], empty: '这个类别只有整体开关，没有单独的源。' }];
  }
  const count = k => sections(k).reduce((a, s) => a + s.rows.length, 0) || (k === 'github' || k === 'ossinsight' ? 1 : 0);
  const plugErr = n => { const p = S?.plugins?.[n]; return p?.skipped ? `<p class="hint">${esc(p.skipped)}</p>` : p?.errors?.length ? `<p class="hint bad">最近错误：${esc(p.errors.join('；'))}</p>` : ''; };
  const bar = () => `<span>${S ? `最近一次采集：${fmt(S.run_at)}（${esc(S.run || '')}）` : '还没有采集记录（下次采集后显示）'}</span><span class="sp"></span><span class="smsg" role="status">${esc(note || (dirty ? '有未保存的改动' : ''))}</span><button class="btn primary sm" id="save" type="button"${dirty ? '' : ' disabled'}>保存</button>`;
  function render() {
    const [k, name, ic, desc] = CATS.find(c => c[0] === cat) || CATS[0], secs = sections(k), pOn = on('plugin:' + k);
    root.innerHTML = `<div class="sx-layout"><nav class="sx-cats" role="tablist" aria-label="源类别">${CATS.map(([c, n, i]) => `<button role="tab" type="button" aria-selected="${c === k}" data-c="${c}" class="${on('plugin:' + c) ? '' : 'off'}"><i class="ci ci-${c}">${i}</i><span>${n}</span><small>${count(c)}</small></button>`).join('')}</nav>
<div class="sx-pane${pOn ? '' : ' off'}"><div class="sx-head"><div><b>${esc(name)}</b><div class="muted">${esc(desc)} · ${secs.length} 个分组 · ${secs.reduce((a, s) => a + s.rows.length, 0)} 个源</div></div>
  <div class="sx-ha">${k === 'x' ? '<button class="btn sm" type="button" data-add="acct">＋ 添加 X 账号</button>' : k === 'rsshub' ? '<button class="btn sm" type="button" data-add="hub">＋ 添加路由</button>' : ''}<label class="sx-all">${pOn ? '已启用' : '已停用'} ${sw('id:plugin:' + k, pOn, '启用 ' + name)}</label></div></div>
  ${plugErr(k)}
  ${k === 'x' ? `<div class="sx-tools"><input class="input" type="search" id="aq" placeholder="筛选账号…" value="${esc(q)}" aria-label="筛选账号"><button class="btn sm" type="button" data-bulk="1">全部启用</button><button class="btn sm" type="button" data-bulk="0">全部停用</button><span class="muted">已启用 ${C.x_accounts.filter(a => a.enabled).length} / ${C.x_accounts.length} 个账号</span></div>` : ''}
  ${secs.map(sect).join('')}
  ${k === 'x' ? '<p class="hint">关键词合并成一条查询；只有已启用、且所在分组开启的账号进入查询，同组账号拼成 <code>from:a OR from:b</code>；「特别关注」用更低的点赞门槛；「+搜」关键词随账号开关。「关注」来自你 X 首页时间线（只读导入，默认停用）。</p>' : ''}
</div></div>
<div class="sx-bar${dirty ? ' dirty' : ''}">${bar()}</div>`;
  }
  const paintBar = () => { const b = root.querySelector('.sx-bar'); if (b) { b.classList.toggle('dirty', dirty); b.innerHTML = bar(); } };
  const change = (fn, msg = '') => { fn(); dirty = true; note = msg; render(); };
  async function load() {
    if (!tok()) return;
    try { const j = await api('GET'); D = j.defaults || {}; C = { disabled: [], removed: [], rsshub: [], x_keywords: [], x_accounts: [], feeds: [], subreddits: [], hf_orgs: [], weights: {}, ...j.config }; S = j.status;
      C.x_accounts = C.x_accounts.map(a => typeof a === 'string' ? { handle: a, enabled: true, from: 'manual' } : a); dirty = false; render(); }
    catch (e) { root.innerHTML = `<p class="empty">${e.status === 429 ? '尝试次数过多，已锁定 15 分钟。' : '口令无效或已过期，请重新解锁。'}</p>`; }
  }
  // switches flip in place (so the elastic spring can play), the counts / bar update without a re-render
  function flip(b) { const t = b.dataset.t, v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); dirty = true; note = '';
    if (t.startsWith('id:')) { const id = t.slice(3); C.disabled = v ? C.disabled.filter(x => x !== id) : [...C.disabled, id]; }
    else if (t.startsWith('acct:')) C.x_accounts[+t.slice(5)].enabled = v;
    else if (t.startsWith('group:')) C.x_groups = { ...(C.x_groups || {}), [t.slice(6)]: v };
    const box = b.closest('.sx-row,.sx-sect,.sx-pane'); box?.classList.toggle('off', !v);
    if (t.startsWith('group:')) box.querySelectorAll('.sx-row .switch').forEach(s => { s.disabled = !v; });
    if (t.startsWith('id:plugin:')) { root.querySelector(`.sx-cats [data-c="${cat}"]`)?.classList.toggle('off', !v); const l = b.closest('.sx-all'); if (l) l.firstChild.textContent = (v ? '已启用' : '已停用') + ' '; }
    if (t.startsWith('acct:') || t.startsWith('group:')) { const s = b.closest('.sx-sect'), g = s && s.querySelector('h3')?.textContent, all = C.x_accounts.filter(a => (a.group || '未分组') === g);
      const n = s?.querySelector('header .tag.plain'); if (n && t.startsWith('acct:')) n.textContent = `${all.filter(a => a.enabled).length} / ${all.length}`; }
    paintBar(); }
  root.addEventListener('input', e => { if (e.target.id !== 'aq') return; q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const n = document.getElementById('aq'); n.focus(); n.setSelectionRange(pos, pos); });
  root.addEventListener('change', e => { const ws = e.target.closest('select[data-w]'); if (!ws) return;
    const k = ws.dataset.w, v = +ws.value, d = +ws.dataset.def || 0; C.weights = { ...(C.weights || {}) }; if (v === d) delete C.weights[k]; else C.weights[k] = v;
    const l = ws.closest('.wsel'); l.classList.toggle('up', v > 0); l.classList.toggle('down', v < 0); l.title = `权重：分数 ×${Math.max(0.4, 1 + 0.3 * v).toFixed(1)}`; dirty = true; note = ''; paintBar(); });
  root.addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target);
    if (e.target.id === 'addhub') { const route = String(f.get('route')).trim(); if (!/^\/[^\s?#<>"'`\\]{1,200}$/.test(route)) { note = '路由需以 / 开头'; return paintBar(); }
      const id = 'rsshub-u-' + route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '-' + (C.rsshub.length + 1);
      change(() => C.rsshub.push({ id, route, label: String(f.get('label') || '').trim() || route }), '已添加路由，记得保存'); }
    if (e.target.id === 'addkw') { const k = String(f.get('kw')).trim(); if (k && !C.x_keywords.includes(k)) change(() => C.x_keywords.push(k), '已添加关键词，记得保存'); }
  });
  root.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.switch[data-t]')) return flip(b);
    if (b.dataset.c) { cat = b.dataset.c; q = ''; render(); root.querySelector(`.sx-cats [data-c="${cat}"]`)?.focus(); return; }
    if (b.dataset.add) return openAdd(b.dataset.add);
    if (b.id === 'save') { b.disabled = true; try { const j = await api('POST', { action: 'config', config: C }); C = { ...C, ...j.config }; dirty = false; note = '已保存，下次采集生效'; render(); } catch (er) { note = '保存失败：' + er.message; dirty = true; paintBar(); } return; }
    if (b.dataset.bulk) return change(() => { C.x_accounts.forEach(a => { if (match(a)) a.enabled = b.dataset.bulk === '1'; }); });
    if (b.id === 'restore') return change(() => { C.removed = []; });
    if (b.dataset.rmDefault) return change(() => { C.removed.push(b.dataset.rmDefault); });
    if (b.dataset.rmHub) return change(() => { C.rsshub.splice(+b.dataset.rmHub, 1); });
    if (b.dataset.rmKw) return change(() => { C.x_keywords.splice(+b.dataset.rmKw, 1); });
    if (b.dataset.rmHf) return change(() => { C.hf_orgs.splice(+b.dataset.rmHf, 1); });
    if (b.dataset.rmFeed) return change(() => { C.feeds.splice(+b.dataset.rmFeed, 1); });
    if (b.dataset.rmSub) return change(() => { C.subreddits.splice(+b.dataset.rmSub, 1); });
    if (b.dataset.rmAcct) return change(() => { C.x_accounts.splice(+b.dataset.rmAcct, 1); });
  });
  // ＋ 添加源 (zip dialog, our three addable kinds: X 账号 · X 关键词 · RSSHub 路由; Reddit / RSS come from a card's ＋ 加信息源)
  const dlg = document.createElement('dialog'); dlg.className = 'sx-dlg'; dlg.setAttribute('aria-labelledby', 'sxdT');
  dlg.innerHTML = `<form method="dialog" id="sxadd"><header><h3 id="sxdT">添加源</h3><button class="btn ghost sm" value="cancel" type="submit" formnovalidate aria-label="关闭">✕</button></header>
  <div class="body"><div class="lbl">1 · 类别</div><div class="seg" id="sxk"><button type="button" data-k="acct" aria-pressed="true">X 账号</button><button type="button" data-k="kw" aria-pressed="false">X 关键词</button><button type="button" data-k="hub" aria-pressed="false">RSSHub 路由</button></div>
  <div class="lbl">2 · 源信息</div><div id="sxf"></div><p class="hint">Reddit 子版块和 RSS 从卡片「＋」菜单里的「加信息源」添加。</p></div>
  <footer><span class="sp"></span><button class="btn ghost" value="cancel" type="submit" formnovalidate>取消</button><button class="btn primary" value="ok" type="submit" id="sxok">添加</button></footer></form>`;
  document.body.append(dlg);
  let dk = 'acct';
  const fields = () => { dlg.querySelectorAll('#sxk button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === dk)));
    const groups = [...new Set((C?.x_accounts || []).map(a => a.group).filter(Boolean))];
    dlg.querySelector('#sxf').innerHTML = dk === 'acct' ? `<label class="fld"><span>账号</span><input class="input" name="h" placeholder="@OpenAI" maxlength="16" pattern="@?[A-Za-z0-9_]{1,15}" required></label>
      <label class="fld"><span>分组</span><input class="input" name="g" list="sxg" placeholder="如 英文区 / 特别关注（可选）" maxlength="20"><datalist id="sxg">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="fld"><span>权重</span><select class="input" name="w">${WV.map(([n, l]) => `<option value="${n}"${n === 0 ? ' selected' : ''}>${l}${n ? `（×${Math.max(0.4, 1 + 0.3 * n).toFixed(1)}）` : ' · 普通'}</option>`).join('')}</select></label>`
      : dk === 'kw' ? '<label class="fld"><span>关键词</span><input class="input" name="kw" placeholder="Grok 或 &quot;world model&quot;" maxlength="60" required></label>'
      : '<label class="fld"><span>路由</span><input class="input mono" name="route" placeholder="/36kr/newsflashes" required pattern="/[^\\s?#]+"></label><label class="fld"><span>显示名</span><input class="input" name="label" placeholder="可选" maxlength="40"></label>'; };
  function openAdd(k) { if (!C) return; dk = k === 'hub' ? 'hub' : k === 'kw' ? 'kw' : 'acct'; fields(); dlg.showModal(); dlg.querySelector('#sxf input')?.focus(); }
  dlg.querySelector('#sxk').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { dk = b.dataset.k; fields(); } });
  dlg.addEventListener('close', () => { if (dlg.returnValue !== 'ok') return; const f = new FormData(dlg.querySelector('form'));
    if (dk === 'acct') { const h = String(f.get('h') || '').trim().replace(/^@/, ''), g = String(f.get('g') || '').trim(), w = +f.get('w') || 0;
      if (!/^[A-Za-z0-9_]{1,15}$/.test(h) || C.x_accounts.some(a => a.handle.toLowerCase() === h.toLowerCase())) { note = '账号格式不对或已存在'; return paintBar(); }
      cat = 'x'; change(() => { C.x_accounts.unshift({ handle: h, name: '', enabled: true, from: 'manual', ...(g ? { group: g } : {}) }); if (w) C.weights = { ...(C.weights || {}), ['xa:' + h.toLowerCase()]: w }; }, `已添加 @${h}，记得保存`); }
    if (dk === 'kw') { const k = String(f.get('kw') || '').trim(); if (k && !C.x_keywords.includes(k)) { cat = 'x'; change(() => C.x_keywords.push(k), '已添加关键词，记得保存'); } }
    if (dk === 'hub') { const route = String(f.get('route') || '').trim(); if (!/^\/[^\s?#<>"'`\\]{1,200}$/.test(route)) { note = '路由需以 / 开头'; return paintBar(); }
      const id = 'rsshub-u-' + route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '-' + (C.rsshub.length + 1);
      cat = 'rsshub'; change(() => C.rsshub.push({ id, route, label: String(f.get('label') || '').trim() || route }), '已添加路由，记得保存'); } });
  document.getElementById('addSrc')?.addEventListener('click', () => openAdd(cat === 'rsshub' ? 'hub' : 'acct'));
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('news-state', () => load()); load();
})();
