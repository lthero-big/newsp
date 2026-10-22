// 学到的偏好 (pure): the exact key strengths learning.py uses for ranking, plus who caused them — for the owner-only page / API.
//   penalty = strengths(trashed + disliked, overrides, now, gate=true)   boost = strengths(liked, boost overrides, now)
// Boost undo is stored next to penalty clears in penalty_overrides with a '+' prefix ('+x:@foo'); learning.py strips it the same way.
// Item factor (learning.py): clamp(1 − 0.25·Σpenalty, 0.4, 1) × (1 + min(0.30, 0.08·Σboost)) — the per-key effect shown is that key alone.
import { strengths } from './keys.mjs';
export const PENALTY_PER = 0.25, PENALTY_FLOOR = 0.4, BOOST_PER = 0.08, BOOST_CAP = 0.30;
export const splitOverrides = (ov = {}) => { const pen = {}, boost = {}; for (const [k, v] of Object.entries(ov)) (k.startsWith('+') ? (boost[k.slice(1)] = v) : (pen[k] = v)); return { pen, boost }; };
// fb: buildFeedback() output; meta(id) → { title, fav, like } (optional, for examples and counts)
export function learned(fb, now = Date.now(), meta = () => ({})) {
  const ov = splitOverrides(fb.overrides), neg = [...(fb.trashed || []).map(e => ({ ...e, kind: 'del' })), ...(fb.disliked || []).map(e => ({ ...e, kind: 'dis' }))];
  const liked = (fb.liked || []).map(e => ({ ...e, kind: 'like' }));
  const P = strengths(neg, ov.pen, now, true), B = strengths(liked, ov.boost, now);
  const rows = (S, events, cleared, effect) => Object.entries(S).filter(([, s]) => s > 0.005).map(([key, s]) => {
    const ev = events.filter(e => (e.keys || []).includes(key) && !(cleared[key] && e.at <= cleared[key])).sort((a, b) => b.at - a.at), c = {};
    for (const e of ev) { const m = meta(e.id) || {}, k = e.kind === 'like' ? (m.fav ? 'fav' : 'like') : e.kind; c[k] = (c[k] || 0) + 1; }
    const ex = [...new Set(ev.map(e => e.title || meta(e.id)?.title).filter(Boolean))].slice(0, 2);
    return { key, s: +s.toFixed(3), n: ev.length, c, ex, last: ev[0]?.at || 0, effect: effect(s) };
  }).sort((a, b) => b.s - a.s || b.last - a.last);
  const cleared = Object.entries(fb.overrides || {}).map(([k, at]) => ({ key: k.replace(/^\+/, ''), kind: k.startsWith('+') ? 'boost' : 'penalty', at })).sort((a, b) => b.at - a.at);
  return {
    now, boost: rows(B, liked, ov.boost, s => +Math.min(BOOST_CAP, BOOST_PER * s).toFixed(3)),
    penalty: rows(P, neg, ov.pen, s => +(-Math.min(1 - PENALTY_FLOOR, PENALTY_PER * s)).toFixed(3)), cleared,
  };
}
