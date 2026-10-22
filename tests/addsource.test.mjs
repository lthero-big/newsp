import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanConfig, feedLinks, feedId, publicHost } from '../functions/api/_sources-lib.js';
import { buildTask, authHeaders } from '../functions/api/agent-task.js';
test('cleanConfig keeps new kinds, rejects junk', () => {
  const c = cleanConfig({ feeds: [{ url: 'https://github.com/a/b/releases.atom', label: 'a/b' }, { url: 'http://x.com/f' }, { url: 'https://127.0.0.1/f' }, { url: 'https://localhost/f' }, { url: 'https://blog.example.com/feed.xml' }],
    subreddits: ['r/LocalLLaMA', 'bad name', 'comfyui'], hf_orgs: ['Qwen', '../x', 'black-forest-labs'] });
  assert.deepEqual(c.feeds.map(f => f.id), ['gh-a-b', 'u-blog-example-com-feed-xml']);
  assert.deepEqual(c.subreddits, ['LocalLLaMA', 'comfyui']);
  assert.deepEqual(c.hf_orgs, ['Qwen', 'black-forest-labs']);
  assert.ok(!publicHost('10.0.0.1') && publicHost('openai.com'));
  assert.equal(feedId('https://github.com/x/y/releases.atom'), 'gh-x-y');
});
test('cleanConfig weights: lower-case known ids, integers −1…2 only', () => {
  const c = cleanConfig({ weights: { 'reddit:StableDiffusion': 1, 'rss:vllm': -1, 'rsshub:qbit': 2, 'xa:Karpathy': 0, 'xa:big': 3, 'bad:x': 1, 'rss:f': 1.5, 'rss:t': true, 'rss:<x>': 1 } });
  assert.deepEqual(c.weights, { 'reddit:stablediffusion': 1, 'rss:vllm': -1, 'rsshub:qbit': 2, 'xa:karpathy': 0 });
  assert.deepEqual(cleanConfig({ weights: [1, 2] }).weights, {}); assert.deepEqual(cleanConfig({}).weights, {});
});
test('feed autodiscovery parses link alternates', () => {
  const h = '<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml"><link rel="alternate" type="application/atom+xml" href="https://e.com/comments/feed">';
  assert.deepEqual(feedLinks(h, 'https://e.com/post/1'), [{ url: 'https://e.com/feed.xml', label: 'Blog' }]);
});
test('agent task validation + auth header modes', () => {
  const id = 'sha256:' + 'a'.repeat(64);
  assert.equal(buildTask({ action: 'x', id, url: 'https://a.com' }).error, 'bad action');
  assert.equal(buildTask({ action: 'command', id, url: 'https://a.com', text: ' ' }).error, 'empty command');
  assert.equal(buildTask({ action: 'deep_dive', id, url: 'javascript:alert(1)' }).error, 'bad item');
  assert.equal(buildTask({ action: 'deep_dive', id, url: 'https://a.com/x', title: 'T\nx' }).task.title, 'T x');
  assert.deepEqual(Object.keys(authHeaders({ AGENT_WEBHOOK_KEY: 'k' })).sort(), ['authorization', 'x-webhook-key']);
  assert.deepEqual(authHeaders({ AGENT_WEBHOOK_KEY: 'k', AGENT_WEBHOOK_AUTH: 'header' }), { 'x-webhook-key': 'k' });
});
