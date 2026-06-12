/**
 * Hybrid Markdown Rendering — CodeMirror 6 Decoration Extension
 *
 * Provides Obsidian-style Live Preview by layering decorations on top of
 * the raw Markdown source in the editor. This is the orchestrator module
 * that combines all feature plugins, atomic ranges, and the unified theme.
 *
 * ## Architecture (Enhanced v2)
 *
 * Each feature is a separate ViewPlugin or StateField in its own module:
 *
 * ### Inline Features (ViewPlugin)
 * - `heading-marks.ts`    — Hide `#` on headings + heading size styling
 * - `emphasis-marks.ts`   — Hide `**`, `*`, `_`, `__`, `~~` delimiters + mid-typing supplement
 * - `embed-images.ts`    — Style ![[embed images]] with thumbnail widgets
 * - `links.ts`            — Style [links](url) and ![images](url) + image dimension cache
 * - `checkboxes.ts`       — Interactive checkbox widgets
 * - `inline-code.ts`      — Inline code background + hide backticks
 * - `tags.ts`             — Obsidian #tag badge styling
 * - `callouts.ts`         — Callout line decorations > [!note]
 * - `code-blocks.ts`      — Fence hiding, language badge (singleton widgets)
 * - `blockquote-marks.ts` — Fade `>` blockquote markers
 * - `comments.ts`         — Hide %%comments%% (singleton indicator widget)
 * - `block-refs.ts`       — Style ^block-id as clickable badge
 * - `embed-transclusions.ts` — ![[note]] transclusion widgets
 * - `admonitions.ts`      — ~~~ad-note code-block callouts
 * - `tables.ts`           — WYSIWYG table rendering (alignment, header, skip guard)
 * - `footnotes.ts`        — Footnote reference/definition styling
 *
 * ### Block Features (StateField — required for layout-changing decorations)
 * - `hr.ts`               — Visual horizontal rule widget (singleton, block replace)
 * - `math.ts`             — Display math $$...$$ rendering (block replace)
 * - `frontmatter.ts`      — YAML frontmatter collapsed toggle
 *
 * ### Cross-cutting
 * - `shared.ts`           — Cursor checks, regex patterns, reusable decorations
 * - `atomic-ranges.ts`    — Fallback atomic ranges for decorations
 * - `drag-state.ts`       — Mouse-drag suppression to prevent flicker
 * - `cursor-awareness.ts` — Centralized cursor position tracking + `shouldShowSource()`
 * - `theme.ts`            — Unified theme with dark mode overrides
 *
 * ## Key Improvements (v2)
 *
 * 1. **`shouldShowSource()` centralized API** — All plugins now use a single
 *    decision function for cursor-awareness, ensuring consistent behavior
 *    with drag-suppression and focus awareness.
 *
 * 2. **`livePreviewEnabled` Facet** — Global on/off switch for Live Preview
 *    mode, enabling a "Source Mode" toggle like Obsidian.
 *
 * 3. **`editorFocusField`** — Propagates editor focus state to StateFields
 *    that can't access `view.hasFocus` directly.
 *
 * 4. **Enhanced WYSIWYG Tables** — Column alignment detection, header row
 *    styling, self-providing atomic ranges, and `changeAffectsTables` skip guard.
 *
 * 5. **Mid-typing emphasis supplement** — Prevents bold/italic flickering
 *    during active typing due to CommonMark flanking rules.
 *
 * 6. **Singleton widgets** — HR, comment indicator, and language badge widgets
 *    are cached/reused to avoid repeated `toDOM()` calls.
 *
 * 7. **Image dimension cache** — Prevents iOS scroll momentum halt by
 *    pre-sizing remounted image widgets.
 */

import type { Extension } from '@codemirror/state'
import type { HybridRenderOptions } from './shared'

// Feature plugins — ViewPlugin-based (inline decorations)
import { headingMarksPlugin } from './heading-marks'
import { emphasisMarksPlugin } from './emphasis-marks'
import { embedImagesPlugin } from './embed-images'
import { linksPlugin } from './links'
import { checkboxesPlugin } from './checkboxes'
import { inlineMathPlugin } from './math'
import { tagsPlugin } from './tags'
import { calloutsPlugin } from './callouts'
import { codeBlocksPlugin } from './code-blocks'
import { blockquoteMarksPlugin } from './blockquote-marks'
import { inlineCodePlugin } from './inline-code'
import { commentsPlugin } from './comments'
import { blockRefsPlugin } from './block-refs'
import { embedTransclusionsPlugin } from './embed-transclusions'
import { admonitionsPlugin } from './admonitions'
import { tablesPlugin } from './tables'
import { footnotesPlugin } from './footnotes'

// Feature plugins — StateField-based (block-level decorations)
import { hrField } from './hr'
import { displayMathField } from './math'
import { frontmatterPlugin } from './frontmatter'

// Cross-cutting concerns
import { atomicRangesExt } from './atomic-ranges'
import { dragSelectingField, dragSelectHandlers } from './drag-state'
import {
  cursorPositionField,
  editorFocusField,
  focusChangeEffect,
  focusMonitorPlugin,
  livePreviewEnabled,
} from './cursor-awareness'
import { hybridRenderTheme } from './theme'

// Re-export for convenience
export type { HybridRenderOptions }
export { livePreviewEnabled, focusChangeEffect, editorFocusField, focusMonitorPlugin, shouldShowSource, shouldShowSourceForLine } from './cursor-awareness'

/**
 * Enable hybrid Markdown rendering in the editor.
 *
 * Adds Obsidian-style Live Preview decorations. All features are enabled
 * by default; pass options to selectively disable them.
 *
 * @param opts - Feature flags (all default to true)
 *
 * @example
 * ```ts
 * import { hybridRender } from '@/lib/codemirror-ext'
 *
 * // All features enabled
 * extensions.push(hybridRender())
 *
 * // Selective features
 * extensions.push(hybridRender({
 *   callouts: false,
 *   headingMarks: true,
 *   tags: true,
 *   comments: true,
 *   frontmatter: true,
 * }))
 *
 * // Disable Live Preview entirely (Source Mode)
 * extensions.push(hybridRender({ livePreview: false }))
 * ```
 */
export function hybridRender(opts: HybridRenderOptions = {}): Extension {
  const features = {
    // Global toggle
    livePreview: opts.livePreview ?? true,

    // Original features
    embedImages: opts.embedImages ?? true,
    images: opts.images ?? true,
    links: opts.links ?? true,
    checkboxes: opts.checkboxes ?? true,
    math: opts.math ?? true,
    tags: opts.tags ?? true,
    headingMarks: opts.headingMarks ?? true,
    emphasisMarks: opts.emphasisMarks ?? true,
    callouts: opts.callouts ?? true,
    codeBlocks: opts.codeBlocks ?? true,
    blockquoteMarks: opts.blockquoteMarks ?? true,
    horizontalRules: opts.horizontalRules ?? true,
    inlineCode: opts.inlineCode ?? true,

    // Level 1 new features
    comments: opts.comments ?? true,
    blockRefs: opts.blockRefs ?? true,
    embedTransclusions: opts.embedTransclusions ?? true,
    frontmatter: opts.frontmatter ?? true,
    admonitions: opts.admonitions ?? true,
    headingSizes: opts.headingSizes ?? true,

    // Level 2 new features (community-inspired)
    tables: opts.tables ?? true,
    footnotes: opts.footnotes ?? true,
  }

  const extensions: Extension[] = [hybridRenderTheme]

  // ── Global Live Preview toggle ──────────────────────────────────────────
  extensions.push(livePreviewEnabled.of(features.livePreview))

  // ── Drag suppression (always included) ──────────────────────────────────
  extensions.push(dragSelectingField, dragSelectHandlers)

  // ── Centralized cursor awareness (performance optimization) ────────────
  extensions.push(cursorPositionField, editorFocusField, focusMonitorPlugin)

  // ── Core features (always recommended) ──────────────────────────────────
  if (features.checkboxes) extensions.push(checkboxesPlugin)
  if (features.embedImages) extensions.push(embedImagesPlugin)
  if (features.links || features.images) extensions.push(linksPlugin)
  if (features.math) {
    extensions.push(displayMathField)  // StateField for block math
    extensions.push(inlineMathPlugin)  // ViewPlugin for inline math
  }

  // ── Syntax marker hiding ────────────────────────────────────────────────
  if (features.headingMarks) extensions.push(headingMarksPlugin)
  if (features.emphasisMarks) extensions.push(emphasisMarksPlugin)
  if (features.blockquoteMarks) extensions.push(blockquoteMarksPlugin)

  // ── Obsidian-specific features ──────────────────────────────────────────
  if (features.tags) extensions.push(tagsPlugin)
  if (features.callouts) extensions.push(calloutsPlugin)
  if (features.comments) extensions.push(commentsPlugin)
  if (features.blockRefs) extensions.push(blockRefsPlugin)
  if (features.embedTransclusions) extensions.push(embedTransclusionsPlugin)

  // ── Block-level features (StateField) ───────────────────────────────────
  if (features.horizontalRules) extensions.push(hrField)
  if (features.frontmatter) extensions.push(frontmatterPlugin)

  // ── Block-level features (ViewPlugin with line decorations) ─────────────
  if (features.codeBlocks) extensions.push(codeBlocksPlugin)
  if (features.inlineCode) extensions.push(inlineCodePlugin)
  if (features.admonitions) extensions.push(admonitionsPlugin)

  // ── Community-inspired features ────────────────────────────────────────
  if (features.tables) extensions.push(tablesPlugin)
  if (features.footnotes) extensions.push(footnotesPlugin)

  // ── Fallback atomic ranges ──────────────────────────────────────────────
  // Most plugins now self-provide atomic ranges via the `provide` pattern.
  // This is kept as a safety net.
  if (
    features.embedImages || features.images ||
    features.tags || features.links || features.comments ||
    features.embedTransclusions
  ) {
    extensions.push(atomicRangesExt)
  }

  return extensions
}
