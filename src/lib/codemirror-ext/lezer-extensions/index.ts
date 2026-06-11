/**
 * Lezer grammar extensions for Obsidian-flavored Markdown.
 *
 * This module provides custom syntax tree nodes for Obsidian-specific
 * syntax that the standard Lezer Markdown parser doesn't understand:
 *
 * - `%%comments%%`      → Comment, CommentMark, CommentContent
 * - `#tags`             → Tag, TagMark, TagName
 * - `^block-refs`       → BlockRef, BlockRefMark, BlockRefId
 * - `[[wikilinks]]`     → Wikilink, WikilinkMark, WikilinkTarget, WikilinkAlias
 * - `![[embeds]]`       → Embed, EmbedMark, EmbedTarget
 * - `---frontmatter---` → Frontmatter, FrontmatterMark, FrontmatterContent
 * - `> [!callouts]`     → Callout, CalloutMark, CalloutType, CalloutFoldMark
 *
 * ## Usage
 *
 * ```ts
 * import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
 * import { obsidianExtensions } from '@/lib/codemirror-ext/lezer-extensions'
 *
 * const mdLang = markdown({
 *   base: markdownLanguage,
 *   extensions: [obsidianExtensions],
 * })
 * ```
 *
 * ## Parser Precedence Chain
 *
 * The inline parsers are ordered as follows (first match wins):
 *
 * ```
 * Comment  → before → Escape        (captures %% before escape)
 * Tag      → before → ATXHeading    (captures #tag before # heading)
 * Embed    → before → Wikilink      (captures ![[ before [[)
 * Wikilink → before → Link          (captures [[ before [)
 * Callout  → before → Link          (captures [! before [)
 * BlockRef → after  → Escape        (late, after most inline parsing)
 * ```
 *
 * Block parser precedence:
 *
 * ```
 * Frontmatter → before → HorizontalRule  (--- at pos 0 is frontmatter, not HR)
 * ```
 *
 * ## Level 1 → Level 2 Migration
 *
 * With these extensions, the Level 1 decoration plugins can switch from
 * regex-based scanning to syntax-tree-based scanning. This provides:
 *
 * - No false positives in code blocks (tree already excludes them)
 * - Incremental parsing (only re-parses changed regions)
 * - Structural navigation and selection
 * - Future: code folding, autocomplete, diagnostics
 */

import type { MarkdownExtension } from '@lezer/markdown'
import { commentExtension } from './comments'
import { tagExtension } from './tags'
import { blockRefExtension } from './block-refs'
import { wikilinkExtension } from './wikilinks'
import { embedExtension } from './embeds'
import { frontmatterExtension } from './frontmatter'
import { calloutExtension } from './callouts'

/**
 * Combined Obsidian-flavored Markdown extensions for the Lezer parser.
 *
 * Pass this to `markdown({ extensions: obsidianExtensions })` to enable
 * all Obsidian syntax nodes in the syntax tree.
 */
export const obsidianExtensions: MarkdownExtension = [
  // Phase A: Foundation
  commentExtension,
  tagExtension,
  blockRefExtension,

  // Phase B: Core Obsidian syntax
  wikilinkExtension,
  embedExtension,
  frontmatterExtension,

  // Phase C: Composite blocks
  calloutExtension,
]

// Re-export individual extensions for selective use
export {
  commentExtension,
  tagExtension,
  blockRefExtension,
  wikilinkExtension,
  embedExtension,
  frontmatterExtension,
  calloutExtension,
}
