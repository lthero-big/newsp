// 垃圾箱 page (owner only): pending countdowns, trashed items with restore / 永久删除 (+ 清空), and 最近少推 penalty keys with clear.
// 永久删除 = purged_at on the row: it leaves 已删除 and can't be restored, but stays hidden from editions and keeps teaching 少推 (see 学到的偏好).
// Confirmation is inline (the button turns into 确认 / 取消), never a native dialog.
(async () => {
  const { strengths } = await import('./keys.mjs');
  const KL = { feed: '信息源', site: '网站', repo: '仓库', x: 'X 账号', hf: 'HF', kw: '关键词' };
  const kl = k => { const i = k.indexOf(':'); const p = k.slice(0, i), v = k.slice(i + 1); return KL[p] ? `${KL[p]} ${v}` : k; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MOD = { model: '模型新闻', opensource: '开源项目发现', community: '社区新闻' };
  const fmt = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };
  function card(id, r, now, kind) {
    const s = r.snapshot || {};
    return `<article class="card" data-del-id="${esc(id)}"><div class="meta"><span class="src">${esc(s.date || '')}</span><span>${esc(MOD[s.module] || s.module || '')}</span><span>${esc(s.source || '')}</span></div>
      <h3>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || id)}</a>` : esc(s.title || id)}</h3>
      <p class="ex">${kind === 'pending' ? `剩 ${fmt(r.expires_at - now)} 进垃圾箱 · 已点 ${r.clicks}/5` : `删除于 ${new Date(r.trashed_at || r.expires_at).toLocaleString('zh-CN', { hour12: false })}`}</p>
      <div class="tags">${(s.keys || []).map(k => `<span class="tag kchip" title="${esc(k)}">${esc(kl(k))}</span>`).join('')}</div>
      <div class="foot"><span class="tacts"><button class="trash-act" data-act="restore">${kind === 'pending' ? '撤销' : '恢复'}</button>${kind === 'trashed' ? '<button class="trash-act purge" data-act="purge" title="从垃圾箱移除，不能恢复；仍不会出现在日报里，少推的学习保留">永久删除</button>' : ''}</span></div></article>`;
  }
  function render() {
    const X = window.NEWS_DEL; if (!X || !NEWS.owner()) return;
    const now = X.now(), rows = Object.entries(X.D);
    const pend = rows.filter(([, r]) => r.status === 'pending' && r.expires_at > now), all = rows.filter(([, r]) => r.status === 'trashed' || (r.status === 'pending' && r.expires_at <= now)), tr = all.filter(([, r]) => !r.purged_at);
    document.getElementById('pending').innerHTML = pend.map(([id, r]) => card(id, r, now, 'pending')).join('') || '<p class="empty">没有倒计时中的条目</p>';
    document.getElementById('trashed').innerHTML = tr.sort((a, b) => (b[1].trashed_at || 0) - (a[1].trashed_at || 0)).map(([id, r]) => card(id, r, now, 'trashed')).join('') || '<p class="empty">垃圾箱是空的</p>';
    const clr = document.getElementById('tclear'); if (clr) { clr.hidden = !tr.length; if (!clr.classList.contains('ask')) clr.querySelector('.n').textContent = tr.length; }
    const st = strengths(all.map(([id, r]) => ({ id, at: r.trashed_at || r.expires_at, keys: r.snapshot?.keys || [] })), X.overrides, now, true);
    const list = Object.entries(st).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]);
    document.getElementById('penalties').innerHTML = list.map(([k, v]) => `<li><code title="${esc(k)}">${esc(kl(k))}</code><span class="bar" title="强度 ${v.toFixed(2)} / 2"><i style="width:${Math.round(v / 2 * 100)}%"></i></span><button data-key="${esc(k)}">清除</button></li>`).join('') || '<li><span>暂无生效的降权</span></li>';
  }
  const msg = t => { const m = document.getElementById('tmsg'); if (m) { m.textContent = t; clearTimeout(m._t); m._t = setTimeout(() => { m.textContent = ''; }, 5000); } };
  // inline confirm: first click arms the button (确认永久删除？ + 取消), second click on 确认 runs it; Esc / 取消 / 6 s disarm
  const arm = (b, label) => { b.dataset.label = b.innerHTML; b.classList.add('ask'); b.innerHTML = label; const no = document.createElement('button'); no.type = 'button'; no.className = 'trash-act tno'; no.textContent = '取消'; b.after(no); b.focus(); b._t = setTimeout(() => disarm(b), 6000); };
  const disarm = b => { if (!b.classList.contains('ask')) return; clearTimeout(b._t); b.classList.remove('ask'); b.innerHTML = b.dataset.label; b.nextElementSibling?.matches('.tno') && b.nextElementSibling.remove(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.trash-act.ask,#tclear.ask').forEach(disarm); });
  document.addEventListener('click', async e => {
    const X = window.NEWS_DEL; if (!X) return;
    const no = e.target.closest('.tno'); if (no) { disarm(no.previousElementSibling); return; }
    const b = e.target.closest('.trash-act'), k = e.target.closest('#penalties button[data-key]'), c = e.target.closest('#tclear');
    try {
      if (c) { if (!c.classList.contains('ask')) return arm(c, `确认清空 ${document.querySelectorAll('#trashed [data-del-id]').length} 条？`);
        disarm(c); c.disabled = true; const j = await X.call({ action: 'purge_all' }); Object.assign(X.D, j.items || {}); c.disabled = false; X.paint ? X.paint() : render(); msg(`已永久删除 ${j.purged || 0} 条（仍不会出现在日报里，少推的学习保留）`); return; }
      if (b?.dataset.act === 'purge') { if (!b.classList.contains('ask')) return arm(b, '确认永久删除？');
        const id = b.closest('[data-del-id]').dataset.delId; X.D[id] = (await X.call({ action: 'purge', id })).item; X.paint ? X.paint() : render(); msg('已永久删除，不能恢复'); return; }
      if (b) { const id = b.closest('[data-del-id]').dataset.delId; X.D[id] = (await X.call({ action: 'restore', id })).item; render(); }
      if (k) { X.overrides = (await X.call({ action: 'clear_key', key: k.dataset.key })).overrides; render(); }
    } catch { msg('操作失败，请稍后再试'); }
  });
  addEventListener('news-del', render);
  render();
})();
