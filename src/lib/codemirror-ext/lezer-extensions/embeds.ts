/**
 * Lezer grammar extension for Obsidian-style embed transclusions: ![[note]], ![[note#heading]], ![[note#^block-id]]
 *
 * Adds `Embed`, `EmbedMark`, and `EmbedTarget` nodes to the syntax tree
 * so that decoration plugins can use tree-based scanning instead of regex.
 *
 * ## Syntax
 *
 * - `![[note]]` — embed entire note
 * - `![[note#heading]]` — embed note section
 * - `![[note#^block-id]]` — embed specific block
 * - `![[#heading]]` — embed heading in current note
 * - `![[image.png]]` — embed image (same syntax, different rendering)
 * - `![[image.png|300]]` — embed image with size
 * - `![[note|label]]` — embed with display label (Obsidian 1.x+)
 *
 * The embed syntax is `![[...]]` — the `!` prefix followed by double brackets
 * uniquely identifies it. This is a standalone parser.
 *
 * ## Inline Parser Design
 *
 * - Runs `before: "Link"` to intercept `![[` before the Link parser.
 * - On seeing `!` at pos, checks if followed by `[[`
 * - Scans forward to find `]]`
 * - Produces an Embed element with EmbedMark children for `![[` and `]]`
 *   and an EmbedTarget child for the content between them
 *
 * ## Image vs Non-Image Distinction
 *
 * The Lezer extension does NOT distinguish between image embeds and note embeds.
 * That distinction is made by the decoration plugin, which checks the file
 * extension against a list of known image types. This keeps the grammar simpler
 * and avoids duplicating extension lists in the parser.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Embed Inline Parser ─────────────────────────────────────────────────────

const embedParser: InlineParser = {
  name: 'Embed',
  before: 'Link',

  parse(cx, next, pos) {
    // Must see ! followed by [[
    if (next !== 33 /* '!' */ || cx.char(pos + 1) !== 91 /* '[' */ || cx.char(pos + 2) !== 91) {
      return -1
    }

    // Scan forward for ]]
    let searchPos = pos + 3

    while (searchPos < cx.end - 1) {
      const ch = cx.char(searchPos)
      if (ch === 93 /* ']' */ && cx.char(searchPos + 1) === 93) {
        // Found closing ]]
        const contentStart = pos + 3
        const contentEnd = searchPos
        const closeEnd = searchPos + 2

        const children = [
          cx.elt('EmbedMark', pos, pos + 3), // ![[
          cx.elt('EmbedTarget', contentStart, contentEnd),
          cx.elt('EmbedMark', searchPos, closeEnd), // ]]
        ]

        return cx.addElement(cx.elt('Embed', pos, closeEnd, children))
      }

      // Don't allow newlines in embed targets (Obsidian behavior)
      if (ch === 10 /* '\n' */) return -1

      searchPos++
    }

    // No closing ]] found
    return -1
  },
}

// ─── Embed Extension ─────────────────────────────────────────────────────────

export const embedExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Embed',
      style: { 'Embed/...': tags.link },
    },
    {
      name: 'EmbedMark',
      style: tags.processingInstruction,
    },
    {
      name: 'EmbedTarget',
      style: tags.labelName,
    },
  ],
  parseInline: [embedParser],
}
