# ix — shared slot variants (contract v1)

Same contract as design-daily `assets/ix/` (DESIGN-RULES §12; the sharing proposal is in `docs/SHARED-IX.md`).

- **Registry** `registry.json`: `{_doc, contract:1, slots:{<slot>:{label, default, variants:{<name>:{css, js, desc, params, kind, sites, inspiredBy:{id,title,stars,date,url}, added, pair?}}}}}`.
  `sites` lists the sites that can load the variant (`news`, `design`; a missing value means both). `kind` is `layout|skin|motion`. `pair` holds optional theme tokens the variant looks best with (the composer uses them).
- **Activation** `html[data-ix-<slot>="<name>"]`. Every selector in a variant's CSS starts with it. Files are immutable once shipped: to change one, add `<name>2`, because old daily pages stay pinned to their files.
- **Touch points**: hooks only, never site classes in JS.
  - `[data-ixh~=topbar|nav|chips|chip|tabbar|tab|num|toast]`.
  - The press hook is `.acts button`; "on" means `.on` or `aria-pressed=true`.
  - Tokens: `--ix-bg --ix-surface --ix-ink --ix-muted --ix-line --ix-accent --ix-on-accent --ix-radius --ix-font-d --ix-font --ix-per`. Each site maps them in `site-<site>.css`.
  - Direction: boot sets the View Transition types `ix-next`/`ix-prev` on `pagereveal`.
- **Must**:
  - check both reduced-motion signals (`@media (prefers-reduced-motion:reduce)` and `html.dd-rm`);
  - stay within the caps: CSS ≤ 8 KB, JS ≤ 4 KB, no external requests;
  - offer a keyboard path for anything interactive (focus and keydown);
  - call `window.ddIxFail('<slot>')` in the catch block, which removes the attribute and restores the default.
- **Must not**:
  - set transform, translate, scale, rotate, filter, backdrop-filter, perspective, animation or will-change on `.card .grid .ed .ed-lead .ed-side .ed-more .module .seen main` (or design-daily's `.grid .card`). Layout reflow and FLIP belong to the site;
  - add features (search, new buttons or new data). A variant only restyles, relayouts or adds motion;
  - change text or ARIA semantics (overlays use `aria-hidden`).
- **Selected state** (chips): `chips/direction` reads only `aria-pressed=true`. `chips/direction2` (2026-10-19) also reads `aria-checked=true` on `role=radio` chips (a `role=radiogroup` row, as on design-daily's favourites sort), and adds arrow / Home / End selection inside a radiogroup by calling `.click()` on the next radio, so the site's own handler still owns the state and ARIA. If the site already handles those keys and calls `preventDefault()`, direction2 stays out of the way. `direction` is unchanged, so pinned pages and W44 keep their hash.
- **Tests**: `tests/invariants.mjs` lints every variant and runs it on the news site. It also runs a fixture page for `chips/direction2` (a radiogroup with aria-checked, an aria-pressed row, and `html.dd-rm`). `tests/editions.mjs` runs the full suite once per variant. Chrome is started by `scripts/chrome.mjs`. By default it uses a pipe and opens no TCP port. `NEWS_CDP_PORT=<port>` (news uses 9563; `1` means 9563) switches to CDP on that port. Never use 9553, which design-daily's `DD_CDP_PORT` default owns on the shared box.
- **Lint**: `node scripts/ix.mjs` (news) and `scripts/validate.mjs` (design). Both have to pass before a variant is listed.
