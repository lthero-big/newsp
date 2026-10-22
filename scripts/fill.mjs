// Mechanical fill: recompute ids (normalised-URL sha256), module index/count and visibility so hand edits stay valid.
// node scripts/fill.mjs <in.json> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stableId } from './identity.mjs';

export const MODULES = [['model', '模型新闻', '新模型、版本发布与榜单'], ['opensource', '开源项目发现', '新仓库、热门模型权重与工具发布'], ['community', '社区新闻', 'HN、Reddit 与 X 上的讨论']];
export function fill(input) {
  const seen = new Set();
  const items = (input.items ?? []).map(item => ({ ...item, id: stableId(item.url), visibility: 'public', links: item.links ?? [], metrics: item.metrics ?? {}, score: item.score ?? { total: 0 }, excerpt: item.excerpt ?? '', batch: item.batch ?? 'am' }))
    .filter(item => !seen.has(item.id) && seen.add(item.id));
  return { ...input, schema_version: '2.0', headline: input.headline || items[0]?.title || '今日暂无条目',
    modules: MODULES.map(([id, title, desc], i) => ({ id, index: `0${i + 1}`, title, desc, count: items.filter(c => c.module === id).length })),
    items, arena: input.arena ?? { boards: [] },
    meta: { generated_at: input.meta?.generated_at ?? new Date().toISOString(), generator: input.meta?.generator ?? 'news-daily/rules', visibility: 'public', ...(input.meta?.updated_at ? { updated_at: input.meta.updated_at } : {}) } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [inFile, outFile] = process.argv.slice(2);
  const out = JSON.stringify(fill(JSON.parse(readFileSync(resolve(inFile), 'utf8'))), null, 2) + '\n';
  if (outFile) writeFileSync(resolve(outFile), out); else process.stdout.write(out);
}
