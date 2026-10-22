// Specific feedback keys for a card (mirror of scripts/collect/learning.py item_keys — keep in sync, tested).
// Broad tags / generic technique words never become keys, so one "不感兴趣" can't suppress a whole topic.
export const BROAD = new Set(['ai', 'llm', 'agent', 'agents', 'model', 'models', 'gpt', 'benchmark', 'diffusion', 'fine-tune', 'open weights', 'open source',
  'quantization', 'text-to-image', 'text-to-video', 'tokenizer', 'transformer', 'workflow', 'coding agent', 'computer use', 'gguf', 'hugging face', 'inference', '图片视频音频']);
export const BRANDS = new Set(['gpt', 'openai', 'anthropic', 'claude', 'gemini', 'google', 'deepmind', 'nvidia', 'deepseek', 'qwen', 'meta', 'llama', 'mistral', 'xai', 'grok', 'kimi', 'moonshot', 'minimax', 'chatgpt', 'codex', 'cursor', 'apple', 'microsoft', 'copilot', 'amazon', 'aws', 'huggingface', 'hugging_face', 'flux', 'black_forest_labs', 'bfl', 'sora', 'veo', 'midjourney', 'zhipu', 'glm', 'baidu', 'ernie', 'alibaba', 'tencent', 'hunyuan', 'bytedance', 'seedance', 'doubao', 'stepfun', 'nemotron', 'gemma', 'phi', 'ollama', 'vllm', 'comfyui', 'llama.cpp', 'perplexity', 'stability', 'runway', 'kling', 'elevenlabs']);
const reEsc = b => b.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const BRAND_RE = new RegExp('^(?:' + [...BRANDS].sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')(?:$|[-_.\\d])');
const FIRST_PARTY_RE = /openai|anthropic|deepmind|google|gemini|hf-blog|huggingface|nvidia|meta\.com|ai\.meta|mistral|x\.ai|qwen|deepseek|microsoft|apple/;
export const isBrand = t => BRAND_RE.test(String(t).toLowerCase().trim().replace(/\s+/g, '_'));
export const gated = k => k.startsWith('kw:') || (/^(feed|site):/.test(k) && FIRST_PARTY_RE.test(k));
const GENERIC_HOSTS = new Set(['github.com', 'x.com', 'twitter.com', 'reddit.com', 'old.reddit.com', 'huggingface.co', 'news.ycombinator.com', 'youtube.com', 'youtu.be', 'medium.com', 'substack.com', 'i.redd.it', 'v.redd.it']);
export function itemKeys(card) {
  const keys = new Set(), url = String(card.url || ''), label = String(card.source_label || '');
  const gh = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (gh) keys.add(`repo:${gh[1]}/${gh[2]}`.toLowerCase());
  const hf = url.match(/^https:\/\/huggingface\.co\/([\w.-]+)\/([\w.-]+)/i);
  if (hf && card.source === 'hf') { keys.add(`hf:${hf[1]}`.toLowerCase()); keys.add(`hffam:${hf[1]}/${hf[2].split('-')[0]}`.toLowerCase()); }
  const x = label.match(/^X · @([\w]+)/);
  if (x) keys.add(`x:@${x[1]}`.toLowerCase());
  const sub = label.match(/^r\/([\w]+)/);
  if (sub) keys.add(`sub:${sub[1]}`.toLowerCase());
  if (card.source === 'rss' && label) keys.add(`feed:${label}`.toLowerCase());
  if (['hn', 'rss'].includes(card.source)) { try { const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); if (!GENERIC_HOSTS.has(h)) keys.add(`site:${h}`); } catch {} }
  for (const k of card.keywords || []) { const t = String(k).toLowerCase().trim(); if (t.length >= 3 && !BROAD.has(t) && !isBrand(t)) keys.add(`kw:${t.replace(/\s+/g, '_')}`); }
  return [...keys].sort();
}
// Decayed strength per key (same constants as learning.py).
export const HALF_LIFE_DAYS = 30, KEY_CAP = 2;
// gate=true (penalties): brand kw: keys never count; kw: and first-party lab feed:/site: keys need >=2 distinct deleted items in the half-life.
export function strengths(events, overrides = {}, now = Date.now(), gate = false) {
  const out = {}, seen = {};
  if (gate) events.forEach((e, n) => { if ((now - e.at) / 864e5 <= HALF_LIFE_DAYS) for (const k of e.keys || []) if (!(overrides[k] && e.at <= overrides[k])) (seen[k] ||= new Set()).add(e.id ?? n); });
  for (const e of events) for (const k of e.keys || []) {
    if (overrides[k] && e.at <= overrides[k]) continue;
    if (gate && ((k.startsWith('kw:') && isBrand(k.slice(3))) || (gated(k) && (seen[k]?.size || 0) < 2))) continue;
    out[k] = (out[k] || 0) + (e.weight ?? 1) * 0.5 ** ((now - e.at) / 864e5 / HALF_LIFE_DAYS);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.min(KEY_CAP, +v.toFixed(3))]));
}
