import { createHash } from 'node:crypto';

export function normalizeUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('URL 必须使用 http/https，且不能包含凭据');
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.href;
}

export function stableId(value) {
  return `sha256:${createHash('sha256').update(normalizeUrl(value), 'utf8').digest('hex')}`;
}
