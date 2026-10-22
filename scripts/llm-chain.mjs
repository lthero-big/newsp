// 模型 page (read-only): the provider slots scripts/llm.py will use — slot, preset label, model and a coarse channel label.
// Labels come from the PRESETS table in llm.py; provider / model come from env (NEWS_LLM_* and NEWS_LLM_FALLBACK_*).
// Never reads or emits keys, key variable names or base URLs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function parsePresets(src) {
  const out = {}, re = /^\s*"([a-z0-9-]+)":\s*\("([^"]+)",\s*"(openai|anthropic)",\s*"([^"]*)",\s*"([^"]*)",\s*(True|False)\),?\s*$/gm; let m;
  while ((m = re.exec(src))) out[m[1]] = { label: m[2], model: m[5] };
  return out;
}
export function parseChain(src, env = process.env) {
  const P = parsePresets(src), chain = [];
  for (const [slot, pre] of [['primary', 'NEWS_LLM_'], ['fallback', 'NEWS_LLM_FALLBACK_']]) {
    const id = (env[pre + 'PROVIDER'] || (env[pre + 'BASE_URL'] ? 'custom' : '')).trim().toLowerCase();
    if (!id || !P[id]) continue;
    const model = (env[pre + 'MODEL'] || P[id].model || '').trim();
    if (!model) continue;
    chain.push({ name: slot, label: P[id].label, model, channel: env[pre + 'BASE_URL'] ? '自定义地址' : id === 'custom' ? '自定义地址' : '官方 API', optin: false });
  }
  return { chain, optin: [] };
}
export const loadChain = (root, env = process.env) => { try { return parseChain(readFileSync(join(root, 'scripts/llm.py'), 'utf8'), env); } catch { return { chain: [], optin: [] }; } };
