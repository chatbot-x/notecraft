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
