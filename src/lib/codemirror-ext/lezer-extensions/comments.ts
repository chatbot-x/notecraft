/**
 * Lezer grammar extension for Obsidian-style inline comments: %%comment text%%
 *
 * Adds `Comment`, `CommentMark`, and `CommentContent` nodes to the syntax tree
 * so that decoration plugins can use tree-based scanning instead of regex.
 *
 * The comment syntax is `%%text%%` where text can span multiple lines.
 * This matches Obsidian's behavior where `%%` delimiters can wrap any content.
 *
 * ## Inline Parser Design
 *
 * - Runs `before: "Escape"` so it captures `%%` before the Escape parser does.
 * - On seeing `%` (char code 37) at pos, checks if next char is also `%`.
 * - Scans forward non-greedily to find closing `%%`.
 * - Produces a `Comment` element with `CommentMark` children for the delimiters
 *   and a `CommentContent` child for the text between them.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Comment Inline Parser ────────────────────────────────────────────────────

const commentParser: InlineParser = {
  name: 'Comment',
  before: 'Escape',

  parse(cx, next, pos) {
    // Must see % followed by another %
    if (next !== 37 /* '%' */ || cx.char(pos + 1) !== 37) return -1

    // Scan forward for closing %%
    // Start after the opening %%
    let searchPos = pos + 2

    while (searchPos < cx.end) {
      const ch = cx.char(searchPos)
      if (ch === 37 /* '%' */ && cx.char(searchPos + 1) === 37) {
        // Found closing %%
        // Build: CommentMark(open) + CommentContent + CommentMark(close)
        const children = [
          cx.elt('CommentMark', pos, pos + 2),
          cx.elt('CommentContent', pos + 2, searchPos),
          cx.elt('CommentMark', searchPos, searchPos + 2),
        ]
        return cx.addElement(cx.elt('Comment', pos, searchPos + 2, children))
      }
      // Skip escaped characters
      if (ch === 92 /* '\\' */) searchPos++
      searchPos++
    }

    // No closing %% found — not a valid comment
    return -1
  },
}

// ─── Comment Extension ────────────────────────────────────────────────────────

export const commentExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Comment',
      style: { 'Comment/...': tags.comment },
    },
    {
      name: 'CommentMark',
      style: tags.processingInstruction,
    },
    {
      name: 'CommentContent',
      style: tags.comment,
    },
  ],
  parseInline: [commentParser],
}
