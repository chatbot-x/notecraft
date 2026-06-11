/**
 * Lezer grammar extension for Obsidian-style wikilinks: [[target]] / [[target|label]]
 *
 * Adds `Wikilink`, `WikilinkMark`, `WikilinkTarget`, and `WikilinkAlias`
 * nodes to the syntax tree so that decoration plugins can use tree-based
 * scanning instead of regex.
 *
 * ## Syntax
 *
 * - `[[note name]]` — basic wikilink, target = "note name"
 * - `[[note name|display label]]` — aliased wikilink, target = "note name", alias = "display label"
 * - The target can contain any characters except `|`, `]`, and newlines
 * - The alias can contain any characters except `]` and newlines
 *
 * ## Inline Parser Design
 *
 * - Runs `before: "Link"` to intercept `[[` before the standard Link parser
 *   sees the `[` character
 * - On seeing `[` at pos, checks if next char is also `[`
 * - Scans forward to find `]]`
 * - If `|` is found inside, splits into WikilinkTarget + WikilinkAlias
 * - Produces a Wikilink element with children for marks, target, and optional alias
 *
 * ## Interaction with Embed Extension
 *
 * The Embed extension (for `![[...]]`) runs `before: "Wikilink"` so that
 * `![[...]]` is captured before `[[...]]`. The wikilink parser does NOT need
 * to handle the `!` prefix — if it sees `[[` at pos and the preceding char
 * is `!`, the embed parser should have already consumed it.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Wikilink Inline Parser ──────────────────────────────────────────────────

const wikilinkParser: InlineParser = {
  name: 'Wikilink',
  before: 'Link',

  parse(cx, next, pos) {
    // Must see [ followed by another [
    if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 91) return -1

    // Scan forward for ]]
    let searchPos = pos + 2
    let pipePos = -1

    while (searchPos < cx.end - 1) {
      const ch = cx.char(searchPos)
      if (ch === 93 /* ']' */ && cx.char(searchPos + 1) === 93) {
        // Found closing ]]
        const contentStart = pos + 2
        const contentEnd = searchPos
        const closeEnd = searchPos + 2

        const children = [
          cx.elt('WikilinkMark', pos, pos + 2), // [[
        ]

        if (pipePos > -1) {
          // [[target|label]]
          children.push(cx.elt('WikilinkTarget', contentStart, pipePos))
          children.push(cx.elt('WikilinkAlias', pipePos + 1, contentEnd))
        } else {
          // [[target]]
          children.push(cx.elt('WikilinkTarget', contentStart, contentEnd))
        }

        children.push(cx.elt('WikilinkMark', searchPos, closeEnd)) // ]]

        return cx.addElement(cx.elt('Wikilink', pos, closeEnd, children))
      }

      // Track the first | for alias splitting
      if (ch === 124 /* '|' */ && pipePos === -1) {
        pipePos = searchPos
      }

      // Don't allow newlines in wikilinks (Obsidian behavior)
      if (ch === 10 /* '\n' */) return -1

      searchPos++
    }

    // No closing ]] found
    return -1
  },
}

// ─── Wikilink Extension ──────────────────────────────────────────────────────

export const wikilinkExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Wikilink',
      style: { 'Wikilink/...': tags.link },
    },
    {
      name: 'WikilinkMark',
      style: tags.processingInstruction,
    },
    {
      name: 'WikilinkTarget',
      style: tags.labelName,
    },
    {
      name: 'WikilinkAlias',
      style: tags.link,
    },
  ],
  parseInline: [wikilinkParser],
}
