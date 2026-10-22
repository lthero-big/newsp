// noindex everywhere (pages, functions, 404s), in addition to robots.txt and _headers.
// v3.6: day pages moved from /<date>(.html) to /<yyyy>/<mm>/<date>; old links (chat messages, bookmarks) get a 301, query kept
// (the #fragment stays in the browser and survives the redirect).
export const OLD_DAY = /^\/(\d{4})-(\d{2})-(\d{2})(?:\.html)?\/?$/;
export function dayRedirect(url) {
  const u = new URL(url), m = u.pathname.match(OLD_DAY);
  return m ? `${u.origin}/${m[1]}/${m[2]}/${m[1]}-${m[2]}-${m[3]}${u.search}` : null;
}
export async function onRequest({ request, next }) {
  const to = dayRedirect(request.url);
  if (to) return new Response(null, { status: 301, headers: { location: to, 'cache-control': 'public, max-age=86400', 'x-robots-tag': 'noindex, nofollow' } });
  const r = await next();
  const res = new Response(r.body, r);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
