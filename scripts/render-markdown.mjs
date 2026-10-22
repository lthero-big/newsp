// Plain Markdown digest of one day (for notifications / chat push).  node scripts/render-markdown.mjs data/<date>.json [out.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const metricText = m => Object.entries(m ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ');
export function renderMarkdown(data, { perModule = Infinity } = {}) {
  const out = [`# 每日 AI 新闻 ${data.date}`, '', `**头条：** ${data.headline}`];
  for (const module of data.modules) {
    out.push('', `## ${module.index} ${module.title}`);
    const cards = data.items.filter(card => card.module === module.id).slice(0, perModule);
    if (!cards.length) out.push('', '（本时段没有符合规则的条目）');
    for (const card of cards) {
      out.push('', `### [${card.title}](${card.url})`, `${card.source_label} · ${card.tags.join(' / ')}${metricText(card.metrics) ? ` · ${metricText(card.metrics)}` : ''}`);
      if (card.excerpt) out.push('', `> ${card.excerpt}`);
    }
    if (module.id === 'model') {
      for (const board of (data.arena?.boards ?? []).filter(b => b.fetch_status === 'ok' && b.rows.length)) {
        out.push('', `**Arena ${board.name}**（快照 ${board.snapshot_date ?? '未知'}）`, '', '| # | 模型 |', '|---|---|', ...board.rows.map(row => `| ${row.rank ?? '—'} | ${row.model} |`));
      }
    }
  }
  return `${out.join('\n')}\n`;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [inFile, outFile] = process.argv.slice(2);
  const md = renderMarkdown(JSON.parse(readFileSync(resolve(inFile), 'utf8')));
  if (outFile) writeFileSync(resolve(outFile), md); else process.stdout.write(md);
}
