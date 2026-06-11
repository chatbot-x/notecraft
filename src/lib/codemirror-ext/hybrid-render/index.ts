/**
 * Hybrid Markdown Rendering — CodeMirror 6 Decoration Extension
 *
 * Provides Obsidian-style Live Preview by layering decorations on top of
 * the raw Markdown source in the editor. This is the orchestrator module
 * that combines all feature plugins, atomic ranges, and the unified theme.
 *
 * ## Architecture
 *
 * Each feature is a separate ViewPlugin or StateField in its own module:
 *
 * ### Inline Features (ViewPlugin)
 * - `heading-marks.ts`    — Hide `#` on headings + heading size styling
 * - `emphasis-marks.ts`   — Hide `**`, `*`, `_`, `__`, `~~` delimiters
 * - `wikilinks.ts`        — Style [[wikilinks]], self-provides atomic ranges
 * - `links.ts`            — Style [links](url) and ![images](url)
 * - `checkboxes.ts`       — Interactive checkbox widgets
 * - `inline-code.ts`      — Inline code background + hide backticks
 * - `tags.ts`             — Obsidian #tag badge styling, self-provides atomic ranges
 * - `callouts.ts`         — Callout line decorations > [!note]
 * - `code-blocks.ts`      — Fence hiding, language badge
 * - `blockquote-marks.ts` — Fade `>` blockquote markers
 * - `comments.ts`         — Hide %%comments%%
 * - `block-refs.ts`       — Style ^block-id as clickable badge
 * - `embed-transclusions.ts` — ![[note]] transclusion widgets
 * - `admonitions.ts`      — ~~~ad-note code-block callouts
 *
 * ### Block Features (StateField — required for layout-changing decorations)
 * - `hr.ts`               — Visual horizontal rule widget (block replace)
 * - `math.ts`             — Display math $$...$$ rendering (block replace)
 * - `frontmatter.ts`      — YAML frontmatter collapsed toggle
 *
 * ### Cross-cutting
 * - `shared.ts`           — Cursor checks, regex patterns, reusable decorations
 * - `atomic-ranges.ts`    — Fallback atomic ranges for decorations
 * - `drag-state.ts`       — Mouse-drag suppression to prevent flicker
 * - `theme.ts`            — Unified theme with dark mode overrides
 *
 * ## Feature Flags
 *
 * Every feature can be toggled on/off:
 * ```ts
 * hybridRender({ tags: true, callouts: false, comments: true })
 * ```
 *
 * ## Cursor Awareness
 *
 * All decorations are cursor-aware: when the cursor enters a decorated range,
 * the raw Markdown syntax is shown. This is the defining characteristic of
 * Obsidian's "Live Preview" mode — you always see the raw source when editing,
 * but see the rendered form when reading.
 *
 * ## Drag Suppression
 *
 * During mouse-drag selection, decoration rebuilds are suppressed to prevent
 * flickering (via the `dragSelectingField` StateField and `checkUpdateAction`
 * helper). When the drag ends, decorations are rebuilt with the final state.
 */

import type { Extension } from '@codemirror/state'
import type { HybridRenderOptions } from './shared'

// Feature plugins — ViewPlugin-based (inline decorations)
import { headingMarksPlugin } from './heading-marks'
import { emphasisMarksPlugin } from './emphasis-marks'
import { wikilinksPlugin } from './wikilinks'
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

// Feature plugins — StateField-based (block-level decorations)
import { hrField } from './hr'
import { displayMathField } from './math'
import { frontmatterPlugin } from './frontmatter'

// Cross-cutting concerns
import { atomicRangesExt } from './atomic-ranges'
import { dragSelectingField, dragSelectHandlers } from './drag-state'
import { hybridRenderTheme } from './theme'

// Re-export the options type for convenience
export type { HybridRenderOptions }

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
 * ```
 */
export function hybridRender(opts: HybridRenderOptions = {}): Extension {
  const features = {
    // Original features
    wikilinks: opts.wikilinks ?? true,
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
  }

  const extensions: Extension[] = [hybridRenderTheme]

  // ── Drag suppression (always included) ──────────────────────────────────
  extensions.push(dragSelectingField, dragSelectHandlers)

  // ── Core features (always recommended) ──────────────────────────────────
  if (features.checkboxes) extensions.push(checkboxesPlugin)
  if (features.wikilinks || features.embedImages) extensions.push(wikilinksPlugin)
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

  // ── Fallback atomic ranges ──────────────────────────────────────────────
  // Most plugins now self-provide atomic ranges via the `provide` pattern.
  // This is kept as a safety net.
  if (
    features.wikilinks || features.embedImages || features.images ||
    features.tags || features.links || features.comments ||
    features.embedTransclusions
  ) {
    extensions.push(atomicRangesExt)
  }

  return extensions
}
