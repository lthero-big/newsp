// Pull owner feedback from the live API (owner passphrase RATINGS_TOKEN from ~/.config/newsp/env) into
// var/state/feedback.json for generate.py (learning) and build.mjs (hide trashed items). Never prints the token.
//   node scripts/sync-state.mjs        (no token / offline → keeps the previous file, exits 0)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemKeys } from './keys.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.NEWS_SITE;
const out = join(root, 'var/state/feedback.json');

// buildFeedback / voteOf / DISLIKE_WEIGHT live in scripts/feedback.mjs (pure, shared with /api/learned); re-exported for tests.
export { DISLIKE_WEIGHT, voteOf } from './feedback.mjs';
import { buildFeedback as build } from './feedback.mjs';
export const buildFeedback = (deletions, ratings, cardsById) => build(deletions, ratings, id => (cardsById[id] ? itemKeys(cardsById[id]) : null), id => cardsById[id]?.title || '');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.RATINGS_TOKEN;
  if (!token || !SITE) { console.log('sync-state: 没有 RATINGS_TOKEN / NEWS_SITE，沿用旧的反馈文件'); process.exit(0); }
  try {
    const get = async p => { const r = await fetch(SITE + p, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); };
    const [deletions, ratings] = await Promise.all([get('/api/deletions'), get('/api/ratings')]);
    try { const pr = await get('/api/prefs'); mkdirSync(join(root, 'data/state'), { recursive: true }); writeFileSync(join(root, 'data/state/theme-prefs.json'), JSON.stringify({ theme_favs: pr.theme_favs || [], theme_default: pr.theme_default ?? null }, null, 1) + '\n'); console.log(`sync-state: 收藏主题 ${(pr.theme_favs || []).length}`); } catch (e) { console.log('sync-state: prefs 跳过 ' + e.message); }
    try { const src = await get('/api/sources'); mkdirSync(join(root, 'var/state'), { recursive: true }); writeFileSync(join(root, 'var/state/sources.json'), JSON.stringify(src.config || {}, null, 1) + '\n'); console.log(`sync-state: 信息源设置 停用 ${(src.config?.disabled || []).length}，自定义 RSSHub ${(src.config?.rsshub || []).length}，X 关键词 ${(src.config?.x_keywords || []).length}，X 账号 ${(src.config?.x_accounts || []).length}`); }
    catch (e) { console.log(`sync-state: 信息源设置拉取失败（${e.message}），沿用旧文件`); }
    const cardsById = {};
    const dir = process.env.NEWS_DATA_DIR || join(root, 'data');
    for (const f of readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) for (const c of JSON.parse(readFileSync(join(dir, f), 'utf8')).items) cardsById[c.id] = c;
    const fb = buildFeedback(deletions, ratings, cardsById);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(fb, null, 1) + '\n');
    // public, non-secret list of trashed card ids for the Cloudflare Git build (CI has no token / no var/)
    mkdirSync(join(root, 'data/state'), { recursive: true });
    writeFileSync(join(root, 'data/state/hidden.json'), JSON.stringify({ trashed: [...new Set(fb.trashed.map(t => t.id))].sort() }, null, 1) + '\n');
    console.log(`sync-state: 垃圾箱 ${fb.trashed.length}，倒计时 ${fb.pending.length}，喜欢 ${fb.liked.length}，少推 ${fb.disliked.length}，清除 ${Object.keys(fb.overrides).length}`);
  } catch (e) { console.log(`sync-state: 拉取失败（${e.message}），沿用旧的反馈文件${existsSync(out) ? '' : '（没有）'}`); }
}
