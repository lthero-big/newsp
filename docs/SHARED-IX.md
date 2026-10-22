# Proposal: one ix variant library for news-daily and design-daily (v1, 2026-10-19)

**Goal.** Both sites are redesigned on the same Sunday and share **the same slot/variant code**. A variant is written once and loaded by both sites. news-daily does not edit design-daily: this document is the proposal, and design-daily's agent decides how to adopt it.

## 1. Contract (already compatible)
- design-daily's `assets/ix/registry.json` format is unchanged. news only adds optional fields: `contract:1`, plus per-variant `sites`, `kind` and `pair`.
- Activation is `html[data-ix-<slot>="<name>"]`, the fallback is `ddIxFail(slot)`, the record is `__ddIx`, and reduced motion uses `prefers-reduced-motion` and `html.dd-rm`. These are exactly design-daily's current conventions.
- Variants never use site classes. They use only hooks (`[data-ixh~=…]`) and `--ix-*` variables, so each site maps its own DOM once.

## 2. What design-daily needs to add (one small change)
1. **Hooks**:
   - `data-ixh="topbar"` on the top bar, `nav` on the navigation, `chips` on the filter row, `chip` on each filter chip, and `num` on the counters;
   - `toast` on toasts, and `tabbar`/`tab` for the mobile bottom tab bar if there is one;
   - on press buttons, `aria-pressed` (already present).
2. **Variables**: one `site-design.css` mapping `:root{--ix-bg:var(--bg);--ix-surface:…;--ix-ink:…;--ix-muted:…;--ix-line:…;--ix-accent:…;--ix-on-accent:…;--ix-radius:…;--ix-font-d:…;--ix-font:…}`.
3. **Loader**: keep the existing ix-pick, but only consider variants whose `sites` is missing or includes `design`.

## 3. Shared directory and sync
- **Canonical source**: news-daily `site/assets/ix/` for now, since it is the newer superset. It currently contains the existing `press/elastic`, now compatible with `aria-pressed` and `.like`. Long term, it could move to a separate repo or directory (`ix-shared/`) that both sites vendor.
- **Sync**: copy one way (news → design). A script (to be written on the design side) checks the hash of each `<slot>/<name>.{css,js}` and the `registry.json` entries, and copies only variants whose `sites` includes `design`. **Files are immutable**: a change means adding `<name>2`. Neither side deletes old files, because old pages are pinned to them.
- **Shared variants on both sides** (`sites` includes design): topbar/catalog, topbar/dock, toast/island, chips/direction, chips/direction2 (also `aria-checked` / `role=radio`, with arrow keys inside a radiogroup), press/elastic, numbers/rolling, transition/book. The news-only ones (layout/*, skin/catalog, sechead/*, tabbar/dock) depend on the news DOM.
- **Same Sunday, same slots**: the news composer (`scripts/compose-edition.mjs`) writes the motion slots it picks for that week into `editions/<week>.json`. design-daily's Sunday redesign can read that file (raw GitHub, read-only) and use the same variants. The reverse also works: when news finds `design.lthero.com/assets/ix/registry.json` already has a variant of the same name, it does not fork its own copy.

## 4. Lint (both sides)
The rules are equivalent: news `scripts/ix.mjs` and design `validate.mjs` both forbid transforms, filters and animation on cards and grids. They also require the variant scope, a reduced-motion branch, the size caps, a `ddIxFail` call, and `inspiredBy` set to a favourite rated ≥4★.

## 5. Notes (2026-10-19)
- **chips/direction2**: design's chip row is a `role=radiogroup` using `aria-checked`, which `chips/direction` (aria-pressed only) never matches. `direction2` matches both. `direction` stays byte-identical.
- **press/elastic**: the canonical copy is news `site/assets/ix/press/elastic.{css,js}` (§3). It is design's original from e57772e plus `aria-pressed` and `.like` support and comment edits, so the hashes differ by design. On design's markup the behaviour is the same. The file header still says "identical file", but files are immutable, so that comment is not edited.
- **Shared box, Chrome ports**: design's theme tests use CDP on `DD_CDP_PORT` (default 9553). News tests use `scripts/chrome.mjs`, which by default uses a pipe and opens no port. `NEWS_CDP_PORT` opts into CDP; the reserved port is 9563.
