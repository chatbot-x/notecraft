---
Task ID: 1
Agent: main
Task: Implement Level 1 hybrid rendering (CM6 Decoration API) — Phases 1, 2, and 3

Work Log:
- Read all 16 existing hybrid-render files to understand current architecture (12 ViewPlugins + atomic-ranges + shared + theme)
- Researched CM6 Decoration API best practices, Obsidian Live Preview behavior, and performance patterns
- Defined Level 1 scope: 5 new decoration features + architecture fixes + polish

Phase 1 — Architecture Fixes:
- Created drag-state.ts: mouseSelectingField StateField + dragSelectHandlers + checkUpdateAction helper
- Updated shared.ts: added collectSkipRanges(), isInRangeList(), new regex patterns (COMMENT_RE, BLOCK_REF_RE, EMBED_TRANSCLUDE_RE, FRONTMATTER_RE, ADMONITION_FENCE_RE), new decoration objects (commentMark, blockRefMark, embedMark, frontmatterCollapsedMark), extended HybridRenderOptions with 6 new flags
- Converted hr.ts from ViewPlugin to StateField (block: true replace requires StateField)
- Converted math.ts to dual architecture: displayMathField (StateField) + inlineMathPlugin (ViewPlugin)
- Added provide pattern for atomic ranges on wikilinks.ts, tags.ts, links.ts
- Updated all 12 existing plugins to use checkUpdateAction() for drag suppression
- Added CSS transitions to theme.ts for smooth mark hide/show

Phase 2 — New Decoration Plugins:
- Created comments.ts: %%text%% → Decoration.replace() with CommentIndicatorWidget, cursor-aware, self-provides atomic ranges
- Created block-refs.ts: ^block-id → fadedMark + blockRefMark badges, cursor-aware via isCursorOnLine
- Created embed-transclusions.ts: ![[note]] → EmbedTransclusionWidget with parsed target info, block: true replace, self-provides atomic ranges
- Created frontmatter.ts: YAML frontmatter → collapsed/expanded toggle widget via StateField + toggleFrontmatter StateEffect + click handler
- Created admonitions.ts: ~~~ad-note → detected via FencedCode+CodeInfo, rendered as callout with type badges and line decorations

Phase 3 — Polish:
- Added heading size styling (H1-H6 font sizes and weights) in heading-marks.ts
- Added smooth CSS transitions (opacity, font-size, width) in theme.ts
- Added skip-range handling via collectSkipRanges/isInRangeList in wikilinks.ts, tags.ts, comments.ts, block-refs.ts, embed-transclusions.ts

Updated index.ts orchestrator with:
- All 17 feature plugins (12 original + 5 new)
- 3 StateField-based features (hr, display math, frontmatter)
- Drag suppression infrastructure
- Feature flags for all new features (default: true)

Stage Summary:
- All TypeScript compiles cleanly, Next.js build passes
- 21 files in hybrid-render/ (up from 16): added drag-state.ts, comments.ts, block-refs.ts, embed-transclusions.ts, frontmatter.ts, admonitions.ts
- Hybrid render now covers 17 syntax elements (up from 12)
- Architecture properly separates StateField (block-level) from ViewPlugin (inline) decorations
- Drag suppression prevents flickering during mouse selection
- Atomic ranges are now self-provided by decoration plugins
