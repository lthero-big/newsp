// Day pages: shared DDCal. Dots = item count per day (build-inlined index), current day selected, empty days disabled;
// picking a day navigates to /<yyyy>/<mm>/<date> (v3.6 layout; data-root leads back to the site root) — the page turns (motion.js 页面切换动效) and the
// NEW page rolls the digits from the date you came from, once. (Before 2026-10-22 the old page rolled to the new date, then the new page rolled
// 00 → date again: the number changed twice.) The last edition date seen in this tab is kept in sessionStorage news-roll-from.
// Old .pager links stay as no-JS fallback (hidden once this runs).
(() => { const el = document.querySelector('.ical'); if (!el || !window.DDCal) return;
  const I = JSON.parse(el.dataset.days || '{}'), cur = el.dataset.cur;
  const ROOT = document.body.dataset.root || '', day = d => `${ROOT}${d.slice(0, 4)}/${d.slice(5, 7)}/${d}.html`, RK = 'news-roll-from';
  const ss = { get: () => { try { return sessionStorage.getItem(RK); } catch { return null; } }, set: v => { try { sessionStorage.setItem(RK, v); } catch {} } };
  const from = ss.get(), rollFrom = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : null; ss.set(cur);
  addEventListener('pageshow', e => { if (e.persisted) ss.set(cur); });  // back / forward from the bfcache: this page is the reference again
  document.documentElement.classList.add('dd-cal');
  DDCal({ calbox: el.querySelector('.calbox'), days: () => I, sel: cur, rollFrom, rollOnSelect: false, disableEmpty: true,
    unit: '一期', dotLabel: '日报', countLabel: c => `，${c} 条`, emptyLabel: '，无日报', allLabel: '往期', subOf: d => ` · ${I[d]} 条`,
    onAll: () => { location.href = ROOT + 'archive.html'; },
    onSelect: s => { if (!s || s === cur) return; ss.set(cur); location.href = day(s); } });
})();
