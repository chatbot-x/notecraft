/**
 * Hybrid Markdown Rendering — CodeMirror 6 Decoration Extension
 *
 * Provides Obsidian-style Live Preview by layering decorations on top of
 * the raw Markdown source in the editor. This is the orchestrator module
 * that combines all feature plugins, atomic ranges, and the unified theme.
 *
 * ## Architecture
 *
 * Each feature is a separate ViewPlugin in its own module:
 * - `heading-marks.ts`    — Hide `#` on headings when cursor is elsewhere
 * - `emphasis-marks.ts`   — Hide `**`, `*`, `_`, `__`, `~~` delimiters
 * - `wikilinks.ts`        — Style [[wikilinks]] and ![[embed-images]]
 * - `links.ts`            — Style [links](url) and ![images](url)
 * - `checkboxes.ts`       — Interactive checkbox widgets
 * - `math.ts`             — KaTeX rendering for $...$ and $$...$$
 * - `tags.ts`             — Obsidian #tag badge styling
 * - `callouts.ts`         — Callout line decorations > [!note]
 * - `code-blocks.ts`      — Fence hiding, language badge
 * - `blockquote-marks.ts` — Fade `>` blockquote markers
 * - `hr.ts`               — Visual horizontal rule widget
 * - `inline-code.ts`      — Inline code background
 *
 * Shared utilities and decoration objects live in `shared.ts`.
 * Atomic ranges (cursor-proofing) live in `atomic-ranges.ts`.
 * The unified theme lives in `theme.ts`.
 *
 * ## Feature Flags
 *
 * Every feature can be toggled on/off:
 * ```ts
 * hybridRender({ tags: true, callouts: false, headingMarks: true })
 * ```
 *
 * ## Cursor Awareness
 *
 * All decorations are cursor-aware: when the cursor enters a decorated range,
 * the raw Markdown syntax is shown. This is the defining characteristic of
 * Obsidian's "Live Preview" mode — you always see the raw source when editing,
 * but see the rendered form when reading.
 */

import type { Extension } from '@codemirror/state'
import type { HybridRenderOptions } from './shared'

// Feature plugins
import { headingMarksPlugin } from './heading-marks'
import { emphasisMarksPlugin } from './emphasis-marks'
import { wikilinksPlugin } from './wikilinks'
import { linksPlugin } from './links'
import { checkboxesPlugin } from './checkboxes'
import { mathPlugin } from './math'
import { tagsPlugin } from './tags'
import { calloutsPlugin } from './callouts'
import { codeBlocksPlugin } from './code-blocks'
import { blockquoteMarksPlugin } from './blockquote-marks'
import { hrPlugin } from './hr'
import { inlineCodePlugin } from './inline-code'

// Cross-cutting concerns
import { atomicRangesExt } from './atomic-ranges'
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
 * }))
 * ```
 */
export function hybridRender(opts: HybridRenderOptions = {}): Extension {
  const features = {
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
  }

  const extensions: Extension[] = [hybridRenderTheme]

  // Core features (always recommended)
  if (features.checkboxes) extensions.push(checkboxesPlugin)
  if (features.wikilinks || features.embedImages) extensions.push(wikilinksPlugin)
  if (features.links || features.images) extensions.push(linksPlugin)
  if (features.math) extensions.push(mathPlugin)

  // Syntax marker hiding
  if (features.headingMarks) extensions.push(headingMarksPlugin)
  if (features.emphasisMarks) extensions.push(emphasisMarksPlugin)
  if (features.blockquoteMarks) extensions.push(blockquoteMarksPlugin)

  // Obsidian-specific features
  if (features.tags) extensions.push(tagsPlugin)
  if (features.callouts) extensions.push(calloutsPlugin)

  // Block-level features
  if (features.codeBlocks) extensions.push(codeBlocksPlugin)
  if (features.horizontalRules) extensions.push(hrPlugin)
  if (features.inlineCode) extensions.push(inlineCodePlugin)

  // Atomic ranges — makes decorated ranges cursor-jumpable
  // Only needed if at least one cursor-aware feature is enabled
  if (
    features.wikilinks || features.embedImages || features.images ||
    features.tags || features.links
  ) {
    extensions.push(atomicRangesExt)
  }

  return extensions
}
