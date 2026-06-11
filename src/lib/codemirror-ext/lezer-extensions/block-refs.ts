/**
 * Lezer grammar extension for Obsidian-style block references: ^block-id
 *
 * Adds `BlockRef`, `BlockRefMark`, and `BlockRefId` nodes to the syntax tree
 * so that decoration plugins can use tree-based scanning instead of regex.
 *
 * ## Syntax Rules (matching Obsidian)
 *
 * - A block reference is `^` followed by one or more alphanumeric characters,
 *   underscores, or hyphens: `^[a-zA-Z0-9_-]+`
 * - It must appear at the END of a line (before optional trailing whitespace)
 * - It must be preceded by a space, tab, or start of line
 * - It does NOT match inside code blocks or inline code (the lezer parser
 *   naturally handles this since block refs appear in inline content)
 *
 * ## Inline Parser Design
 *
 * - Runs `after: "Escape"` — late in the inline parser order, after most
 *   other inline constructs have been resolved
 * - Checks if the `^` is at a valid position (preceded by whitespace/line-start)
 * - Verifies that only whitespace follows the ID (end-of-line check)
 * - Produces a `BlockRef` element with `BlockRefMark` for `^` and `BlockRefId`
 *   for the identifier
 *
 * ## End-of-line detection
 *
 * The inline parser operates on a section of text (the inline content of a
 * block). We need to verify that the block-ref is at the end of a line.
 * After scanning the ID characters, we check that the remaining content
 * (until end of inline section or the next newline) is only whitespace.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Block Reference Inline Parser ────────────────────────────────────────────

const blockRefParser: InlineParser = {
  name: 'BlockRef',
  after: 'Escape',

  parse(cx, next, pos) {
    // Must see ^
    if (next !== 94 /* '^' */) return -1

    // Check preceding character — must be whitespace, line start, or start of inline section
    if (pos > cx.offset) {
      const prevCh = cx.char(pos - 1)
      if (prevCh !== 32 /* ' ' */ && prevCh !== 9 /* '\t' */) {
        return -1
      }
    }

    // Scan forward to find the end of the block ID
    let endPos = pos + 1
    while (endPos < cx.end) {
      const ch = cx.char(endPos)
      if (
        (ch >= 48 && ch <= 57) /* 0-9 */ ||
        (ch >= 65 && ch <= 90) /* A-Z */ ||
        (ch >= 97 && ch <= 122) /* a-z */ ||
        ch === 95 /* '_' */ ||
        ch === 45 /* '-' */
      ) {
        endPos++
      } else {
        break
      }
    }

    // Must have at least one character after ^
    if (endPos === pos + 1) return -1

    // Verify end-of-line: only whitespace can follow until end of inline section or newline
    let afterId = endPos
    while (afterId < cx.end) {
      const ch = cx.char(afterId)
      if (ch === 10 /* '\n' */ || afterId === cx.end) {
        break
      }
      if (ch !== 32 /* ' ' */ && ch !== 9 /* '\t' */) {
        // Non-whitespace after the ID — not a block reference
        return -1
      }
      afterId++
    }

    // Build: BlockRefMark(^) + BlockRefId
    const children = [
      cx.elt('BlockRefMark', pos, pos + 1),
      cx.elt('BlockRefId', pos + 1, endPos),
    ]
    return cx.addElement(cx.elt('BlockRef', pos, endPos, children))
  },
}

// ─── Block Reference Extension ────────────────────────────────────────────────

export const blockRefExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'BlockRef',
      style: { 'BlockRef/...': tags.labelName },
    },
    {
      name: 'BlockRefMark',
      style: tags.processingInstruction,
    },
    {
      name: 'BlockRefId',
      style: tags.labelName,
    },
  ],
  parseInline: [blockRefParser],
}
