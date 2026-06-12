# NoteCraft Worklog

---
Task ID: 1
Agent: Super Z (main)
Task: Merge 6 core markdown-it rules into a single obsidian-transforms pipeline

Work Log:
- Read all 6 core-rule plugins (comment, wikilink, embed, tag, callout, block-ref) and the renderer index.ts
- Identified that all 6 use `md.core.ruler.after('inline', ...)` which caused incorrect execution order
- Discovered critical bug: `ruler.after('inline', ...)` inserts right after 'inline', so the LAST registered rule runs FIRST
- Original execution order was: inline → block_refs → tags → embeds → wikilinks → callout → comment (reverse of registration!)
- This meant embeds ran BEFORE wikilinks (broken), tags ran BEFORE wikilinks (broken), block_refs ran BEFORE wikilinks (broken)
- Created `/home/z/my-project/src/lib/renderer/callout-types.ts` — shared CALLOUT_TYPES, CALLOUT_ALIASES, DEFAULT_CALLOUT_ICON
- Created `/home/z/my-project/src/lib/renderer/obsidian-transforms.ts` — merged core rule with:
  - Phase 1: Single inline walk with 4 ordered sub-passes (comment → wikilink → embed → tag)
  - Phase 2: Block-level transforms (callout → block-ref)
  - All renderer rules registered together
  - Feature flags preserved for each sub-transform
- Updated `/home/z/my-project/src/lib/renderer/index.ts` — replaced 6 separate `md.use()` calls with single `md.use(obsidianTransforms, ...)`
- Updated `/home/z/my-project/src/lib/renderer/admonition-plugin.ts` — imports shared callout types
- Wrote integration test (40/40 pass) and regression test (27 identical, 8 bug fixes, 0 regressions)
- Next.js build succeeds

Stage Summary:
- 6 core rules → 1 merged `obsidian_transforms` core rule
- 3 full state.tokens iterations eliminated (4 inline walks → 1)
- Fixed 3 latent bugs in original pipeline:
  1. Embeds now work (![[note]] transforms correctly)
  2. [[#heading]] current-note wikilinks no longer broken by tag matching
  3. [[Note#^blockid]] no longer corrupted by block-ref matching
- Performance: 2.09ms avg for long document (well under 16ms frame budget)
- Original plugin files preserved as reference (comment-plugin.ts, wikilink-plugin.ts, etc.)

---
Task ID: 2
Agent: Deployment Fix Agent
Task: Fix Cloudflare Pages 404 deployment

Work Log:
- Inspected project structure: Next.js 16.2.9, App Router, `@opennextjs/cloudflare` 1.19.11
- Verified `scripts/prepare-pages.sh` exists — it creates `_worker.js` and `_routes.json`
- Ran `npx @opennextjs/cloudflare build` — build succeeds without errors
- Inspected `.open-next/` output: `worker.js`, `assets/` (containing `_next/`, `logo.svg`, `robots.txt`, `BUILD_ID`), `server-functions/`, `cloudflare/`, `middleware/`, `cache/`, etc.
- **Root cause identified**: `@opennextjs/cloudflare` places static assets inside `.open-next/assets/` subdirectory, but Cloudflare Pages expects them at the **root** of the deploy directory. When `wrangler pages deploy .open-next` uploads the directory, a request for `/_next/static/chunks/xxx.js` looks for `.open-next/_next/static/chunks/xxx.js` but the file is actually at `.open-next/assets/_next/static/chunks/xxx.js`. Since `_routes.json` excludes `/_next/static/*` from the Worker (expecting CF Pages to serve them as static files), CF Pages returns 404 for every static asset, causing the entire site to fail.
- Verified `wrangler.toml` configuration: `pages_build_output_dir = ".open-next"` is correct, `compatibility_flags = ["nodejs_compat"]` is appropriate
- Verified `open-next.config.ts` uses `defineCloudflareConfig({})` — correct default
- Checked for Node.js-specific API usage: `db.ts` uses `PrismaClient` but is never imported (dead module), DOMPurify uses `require('dompurify')` but only in client-side code (`ssr: false`), `sharp` is a dependency but not used in any runtime code
- Verified the API route at `src/app/api/route.ts` uses `export const runtime = 'edge'` — correct for CF Workers
- Confirmed the entire UI is client-only (`'use client'` + `ssr: false` dynamic import) — no SSR edge runtime issues
- **Fixed `scripts/prepare-pages.sh`**: Added asset promotion logic that moves contents of `.open-next/assets/` to the root of `.open-next/` before creating `_routes.json`. Handles directory merging (e.g., `_next/`) and file conflicts gracefully.
- Tested full `npm run cf:build` — build + prepare-pages.sh succeeds, static assets now at correct paths:
  - `.open-next/_next/static/chunks/` ✓ (was at `.open-next/assets/_next/static/chunks/`)
  - `.open-next/logo.svg` ✓ (was at `.open-next/assets/logo.svg`)
  - `.open-next/robots.txt` ✓ (was at `.open-next/assets/robots.txt`)
  - `.open-next/BUILD_ID` ✓ (was at `.open-next/assets/BUILD_ID`)
  - `.open-next/assets/` directory removed after promotion ✓

Stage Summary:
- **Root cause**: Static assets were nested in `.open-next/assets/` instead of `.open-next/` root. Cloudflare Pages serves static files based on their path in the deploy directory, so `/_next/static/*` URLs could not resolve, causing 404s for all JS/CSS assets and making the site unreachable.
- **Fix applied**: Updated `scripts/prepare-pages.sh` to promote `assets/` contents to the `.open-next/` root after the OpenNext build, before creating `_routes.json`.
- **No other issues found**: `wrangler.toml` config is correct, `open-next.config.ts` is correct, no incompatible Node.js APIs in server-side code, DOMPurify is client-only, Prisma is unused/dead code, the `@opennextjs/cloudflare` build succeeds cleanly.
- **Next action**: Deploy with `npm run cf:deploy` (or `wrangler pages deploy .open-next`) to push the fixed build to Cloudflare Pages.

---
Task ID: 3
Agent: Super Z (main)
Task: Rip out markdown-it-wikilinks + re-implement wikilinks as standalone transform

Work Log:
- Verified `markdown-it-wikilinks` was already removed from code imports (Task 1 merged it away) but still referenced in README
- Added native wikilink sub-pass (sub-pass 3) to obsidian-transforms.ts pipeline
- Implemented `WIKILINK_RE` regex with negative lookbehind for `!` to avoid matching embeds
- Implemented `parseWikilinkTarget()` supporting all Obsidian syntaxes:
  - [[note]] → basic wikilink
  - [[note#heading]] → heading reference with data-wikilink-heading
  - [[note#^blockid]] → block reference with data-wikilink-block
  - [[note|alias]] → alias display (alias shown, note as href)
  - [[#heading]] → same-note heading reference
  - [[#^blockid]] → same-note block reference
- Updated pipeline ordering: comment → embed → wikilink → tag
  - Embeds must run before wikilinks (![[...]] consumed first)
  - Wikilinks must run before tags ([[#heading]] not mis-parsed as tag)
- Added wikilink_open/wikilink_close token renderers
- Added wikilinks feature flag to ObsidianTransformsOptions and RenderOptions
- Added data-wikilink-page, data-wikilink-heading, data-wikilink-block to DOMPurify allowlist
- Added wikilink click handling in markdown-preview.tsx (onWikilinkClick prop)
- Added wikilink navigation in note-app.tsx (finds matching note by title)
- Added Obsidian wikilink CSS styling in globals.css (light + dark themes)
- Build passes cleanly

Stage Summary:
- `markdown-it-wikilinks` npm dependency fully replaced by native implementation
- Wikilinks now rendered as proper `<a>` tokens with data attributes (not raw HTML)
- Full Obsidian wikilink compatibility: basic, heading refs, block refs, aliases, same-note refs
- Wikilink click navigation wired up (searches existing notes by title)
- Pipeline ordering enforced: embeds → wikilinks → tags

---
Task ID: 4
Agent: Super Z (main)
Task: Thorough source code cleanup — remove dead deps, stale files, unused imports

Work Log:
- Ran comprehensive audit of all npm dependencies against actual source imports
- Removed 25+ unused npm dependencies from package.json:
  - @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
  - @tanstack/react-query, @tanstack/react-table
  - @hookform/resolvers, react-hook-form
  - @prisma/client, prisma
  - next-auth, next-intl
  - remark-gfm, markdown-it-container, sharp
  - isomorphic-dompurify, uuid
  - z-ai-web-dev-sdk, @reactuses/core
  - recharts, react-day-picker, embla-carousel-react
  - input-otp, vaul, sonner, cmdk
  - react-resizable-panels
  - 20+ unused @radix-ui packages
- Deleted 32 unused shadcn/ui component files (accordion, alert, avatar, badge, breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, form, hover-card, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group)
- Kept only 8 active UI components: button, input, scroll-area, alert-dialog, tooltip, dropdown-menu, toast, toaster
- Deleted dead application code: src/lib/db.ts (Prisma, never imported), src/hooks/use-mobile.ts (only used by deleted ui/sidebar.tsx)
- Deleted prisma/ directory (schema.prisma, unused)
- Deleted stale research artifacts: download/cm6-research-{1..10}.json
- Cleaned .env file (removed DATABASE_URL, added comment about localStorage-only)
- Removed db:push, db:generate, db:migrate, db:reset scripts from package.json
- Removed unused imports in note-app.tsx (Search, ChevronDown from lucide-react)
- npm install removed 222 packages from node_modules
- Final build passes cleanly

Stage Summary:
- 25+ npm dependencies removed (significant node_modules size reduction)
- 32 dead UI component files deleted (~2000+ lines removed)
- 10 research JSON files deleted
- Prisma/DB layer completely removed (app is purely client-side)
- Clean dependency tree: only packages actually used by the codebase remain
- Build compiles and runs successfully
