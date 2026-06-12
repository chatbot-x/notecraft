/**
 * Lezer grammar extension for Obsidian-style callout blocks: > [!type]
 *
 * Adds `Callout`, `CalloutMark`, `CalloutType`, `CalloutFoldMark` nodes
 * to the syntax tree so that decoration plugins can use tree-based scanning
 * instead of regex.
 *
 * ## Syntax
 *
 * ```markdown
 * > [!note] Optional title
 * > Callout body content
 * > More body content
 * ```
 *
 * The callout header line is `> [!type]` or `> [!type]+` (expandable) or
 * `> [!type]-` (collapsible). Subsequent `>` lines are the callout body.
 *
 * ## Design Decision: Composite Block vs Leaf Block
 *
 * Callouts are essentially blockquotes with special first-line syntax. There
 * are two possible approaches:
 *
 * 1. **Composite block parser** — Replace Blockquote parsing for `> [!` lines
 *    with a custom composite block. This would produce a `Callout` node that
 *    wraps all the `>` lines. However, this is extremely complex because it
 *    requires reimplementing the blockquote composite handler.
 *
 * 2. **Inline parser on blockquote content** — Let the standard Blockquote
 *    parser handle the `>` lines, and add an inline parser that recognizes
 *    `[!type]` at the start of a blockquote's first inline content. This is
 *    simpler and composes naturally with the existing blockquote infrastructure.
 *
 * We choose **approach 2** because it's much simpler and doesn't require
 * fighting the blockquote composite block handler. The `Callout` node will
 * be produced as an inline element inside the first blockquote paragraph,
 * and decoration plugins can detect it by checking for a Callout node inside
 * a Blockquote parent.
 *
 * ## Inline Parser Design
 *
 * - Runs `before: "Link"` to intercept `[!` before the Link parser sees `[`
 * - On seeing `[` at pos, checks if next char is `!`
 * - Scans forward for the callout type name and closing `]`
 * - Checks for optional fold marker `+` or `-` after `]`
 * - Produces a `Callout` element with:
 *   - `CalloutMark` for `[!` and `]`
 *   - `CalloutType` for the type name
 *   - Optional `CalloutFoldMark` for `+` or `-`
 *
 * ## Limitations of Approach 2
 *
 * - The `Callout` node only covers the header line, not the body lines.
 *   Decoration plugins need to scan subsequent blockquote lines to apply
 *   body decorations (same as current regex approach).
 * - The parser cannot distinguish `[!note]` inside a blockquote from one
 *   in a regular paragraph. Decoration plugins should check the parent
 *   tree context (is there a Blockquote ancestor?) to avoid false matches.
 *   In practice, `[!note]` is rare in non-blockquote contexts.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Callout Inline Parser ───────────────────────────────────────────────────

const calloutParser: InlineParser = {
  name: 'Callout',
  before: 'Link',

  parse(cx, next, pos) {
    // Must see [ followed by !
    if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 33 /* '!' */) {
      return -1
    }

    // Scan forward for the type name and closing ]
    let scanPos = pos + 2 // after [!

    // Type name: one or more word characters (letters, digits, underscore, hyphen)
    let typeStart = scanPos
    let typeEnd = -1

    while (scanPos < cx.end) {
      const ch = cx.char(scanPos)
      if (
        (ch >= 48 && ch <= 57) /* 0-9 */ ||
        (ch >= 65 && ch <= 90) /* A-Z */ ||
        (ch >= 97 && ch <= 122) /* a-z */ ||
        ch === 95 /* '_' */ ||
        ch === 45 /* '-' */
      ) {
        scanPos++
      } else {
        break
      }
    }

    typeEnd = scanPos

    // Must have at least one character for the type name
    if (typeEnd === typeStart) return -1

    // Must be followed by ]
    if (cx.char(scanPos) !== 93 /* ']' */) return -1

    const closeBracketEnd = scanPos + 1

    // Check for optional fold marker: + or -
    let foldMarkEnd = -1
    const afterClose = cx.char(closeBracketEnd)
    if (afterClose === 43 /* '+' */ || afterClose === 45 /* '-' */) {
      foldMarkEnd = closeBracketEnd + 1
    }

    // Build children
    const children = [
      cx.elt('CalloutMark', pos, pos + 2), // [!
      cx.elt('CalloutType', typeStart, typeEnd), // type name
      cx.elt('CalloutMark', scanPos, closeBracketEnd), // ]
    ]

    if (foldMarkEnd > -1) {
      children.push(cx.elt('CalloutFoldMark', closeBracketEnd, foldMarkEnd))
    }

    const endPos = foldMarkEnd > -1 ? foldMarkEnd : closeBracketEnd

    return cx.addElement(cx.elt('Callout', pos, endPos, children))
  },
}

// ─── Callout Extension ───────────────────────────────────────────────────────

export const calloutExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Callout',
      style: { 'Callout/...': tags.strikethrough },
    },
    {
      name: 'CalloutMark',
      style: tags.processingInstruction,
    },
    {
      name: 'CalloutType',
      style: tags.labelName,
    },
    {
      name: 'CalloutFoldMark',
      style: tags.processingInstruction,
    },
  ],
  parseInline: [calloutParser],
}
