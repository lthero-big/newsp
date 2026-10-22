// news-daily schema 2.0 validator (模型新闻 / 开源项目发现 / 社区新闻).  CLI: node scripts/validate.mjs data/<date>.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { normalizeUrl, stableId } from './identity.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema/daily.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const check = ajv.compile(schema);
export const MODULE_ORDER = ['model', 'opensource', 'community'];
export const TAGS = ['AI', 'LLM', '图片视频音频', 'Agent'];

const ptr = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');

export function validateDaily(data) {
  if (data?.schema_version !== '2.0') return ['/schema_version: 仅支持 2.0'];
  if (!check(data)) {
    return check.errors.map(error => {
      const property = error.params.missingProperty ?? error.params.additionalProperty;
      return `${error.instancePath}${property === undefined ? '' : `/${ptr(property)}`}: ${error.message}${error.params.allowedValues ? ` (${error.params.allowedValues.join(', ')})` : ''}`;
    });
  }
  const errors = [];
  const report = (path, message) => errors.push(`${path}: ${message}`);
  if (Date.parse(data.window.start) >= Date.parse(data.window.end)) report('/window/end', '必须晚于 /window/start');
  try { new Intl.DateTimeFormat('en', { timeZone: data.window.timezone }); } catch { report('/window/timezone', '必须是有效 IANA 时区'); }
  const moduleIds = data.modules.map(m => m.id);
  const expected = MODULE_ORDER.filter(id => moduleIds.includes(id));
  if (moduleIds.join() !== expected.join()) report('/modules', `顺序必须为 ${MODULE_ORDER.join(', ')}`);
  if (moduleIds.length !== 3) report('/modules', '必须包含 3 个模块');
  data.modules.forEach((m, i) => {
    if (m.index !== `0${i + 1}`) report(`/modules/${i}/index`, '必须与模块顺序一致');
    const n = data.items.filter(card => card.module === m.id).length;
    if (m.count !== n) report(`/modules/${i}/count`, `应为 ${n}`);
  });
  const ids = new Map();
  data.items.forEach((card, index) => {
    const path = `/items/${index}`;
    if (ids.has(card.id)) report(`${path}/id`, `重复 id，与 /items/${ids.get(card.id)}/id 相同`);
    ids.set(card.id, index);
    try {
      const want = stableId(card.url);
      if (card.id !== want) report(`${path}/id`, `应为 ${want}（规范化 URL 哈希）`);
    } catch (error) { report(`${path}/url`, error.message); }
    if (!moduleIds.includes(card.module)) report(`${path}/module`, '模块未在 /modules 中声明');
    if (data.meta.visibility === 'public' && card.visibility !== 'public') report(`${path}/visibility`, '公开日报的卡片必须为 public');
    if (card.batch === 'pm' && !card.fetched_at) report(`${path}/fetched_at`, '15:00 新增条目必须带 fetched_at');
    if (card.image?.srcset && card.image.srcset.split(',').some(part => !/^https:\/\/\S+ \d+w$/.test(part.trim()))) report(`${path}/image/srcset`, 'srcset 格式应为 "<https-url> <宽>w, ..."');
    card.links.forEach((link, li) => { try { normalizeUrl(link.url); } catch (error) { report(`${path}/links/${li}/url`, error.message); } });
  });
  const seenBoards = new Set();
  data.arena.boards.forEach((board, i) => {
    if (seenBoards.has(board.name)) report(`/arena/boards/${i}/name`, '重复榜单');
    seenBoards.add(board.name);
    if (board.snapshot_date && board.snapshot_date > data.date) report(`/arena/boards/${i}/snapshot_date`, '不能晚于日报日期');
  });
  const visit = (value, path = '') => {
    if (typeof value === 'string') {
      if (/<\/?[a-z!][^>]*>/i.test(value)) report(path || '/', '文本不能包含 HTML');
      if (/https?:\/\/[^\s/<>]*@/i.test(value)) report(path || '/', '字符串包含带凭据的 URL');
      if (/(?:sk-[A-Za-z0-9_-]{16,}|(?:ghp_|github_pat_|hf_|glpat-)[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9_.-]{20,}|[?&](?:token|api_key|access_token)=[^\s&#]{8,})/i.test(value)) report(path || '/', '字符串包含疑似 token/密钥，拒绝入库');
      return;
    }
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, `${path}/${ptr(k)}`);
  };
  visit(data);
  return errors;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const file = process.argv[2];
  if (!file) { console.error('用法：node scripts/validate.mjs <daily.json>'); process.exit(2); }
  const data = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const errors = validateDaily(data);
  if (errors.length) { console.error(`校验失败：${file}\n${errors.map(e => `- ${e}`).join('\n')}`); process.exitCode = 1; }
  else console.log(`校验通过：${file}（${data.items.length} 张卡片）`);
}
