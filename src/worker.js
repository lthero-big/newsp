// Cloudflare Worker entry (Workers + static assets). Replaces the Pages Functions file router with an explicit route table;
// the handlers themselves stay in functions/ (same modules, same exports, same tests) so behaviour is unchanged:
//   functions/_middleware.js   wraps every request (old day URL 301 + X-Robots-Tag), like a Pages root middleware
//   functions/mcp.js           /mcp
//   functions/api/<name>.js    /api/<name>          (files starting with _ are helpers, not routes — as in Pages)
// Anything else (and any method a route doesn't export) falls through to the static site in dist/ via the ASSETS binding,
// which also applies dist/_headers and serves dist/404.html for misses (wrangler.toml [assets]).
import * as middleware from '../functions/_middleware.js';
import * as mcp from '../functions/mcp.js';
import * as agentTask from '../functions/api/agent-task.js';
import * as deletions from '../functions/api/deletions.js';
import * as learned from '../functions/api/learned.js';
import * as mcpTokens from '../functions/api/mcp-tokens.js';
import * as prefs from '../functions/api/prefs.js';
import * as ratings from '../functions/api/ratings.js';
import * as reads from '../functions/api/reads.js';
import * as sources from '../functions/api/sources.js';

export const ROUTES = {
  '/mcp': mcp,
  '/api/agent-task': agentTask,
  '/api/deletions': deletions,
  '/api/learned': learned,
  '/api/mcp-tokens': mcpTokens,
  '/api/prefs': prefs,
  '/api/ratings': ratings,
  '/api/reads': reads,
  '/api/sources': sources,
};
const METHOD = { GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', PATCH: 'onRequestPatch', DELETE: 'onRequestDelete', HEAD: 'onRequestHead', OPTIONS: 'onRequestOptions' };

// Pages-style handler lookup: onRequest<Method>, then onRequest; null = not a function route (serve static).
export function handlerFor(pathname, method) {
  const mod = ROUTES[pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname];
  return mod ? mod[METHOD[method]] || mod.onRequest || null : null;
}

const assets = (env, request) => env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });

export default {
  async fetch(request, env, ctx) {
    const waitUntil = p => (ctx && ctx.waitUntil ? ctx.waitUntil(p) : undefined);
    const route = () => {
      const fn = handlerFor(new URL(request.url).pathname, request.method);
      const next = () => assets(env, request);
      return fn ? fn({ request, env, params: {}, data: {}, waitUntil, next }) : next();
    };
    return middleware.onRequest({ request, env, waitUntil, next: route });
  },
};
