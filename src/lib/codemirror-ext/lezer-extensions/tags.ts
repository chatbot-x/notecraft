/**
 * Lezer grammar extension for Obsidian-style inline tags: #tag, #nested/tag
 *
 * Adds `Tag`, `TagMark`, and `TagName` nodes to the syntax tree so that
 * decoration plugins can use tree-based scanning instead of regex.
 *
 * ## Disambiguation from ATX Headings
 *
 * The `#` character is overloaded in Markdown:
 * - `# heading` → ATX Heading (standard Markdown)
 * - `#tag` → Obsidian Tag
 *
 * Resolution rules (matching Obsidian behavior):
 * 1. After `#`, if the next char is a space, tab, or end-of-line → it's a heading
 * 2. After `#`, if the next char is a letter, `_`, or digit → it's a tag
 * 3. A tag can contain letters, digits, `_`, `-`, and `/` (for nested tags)
 * 4. A tag ends at whitespace, punctuation (other than `/` and `-`), or end of line
 *
 * ## Inline Parser Design
 *
 * - Runs `before: "Escape"` to intercept `#` before any other inline parser
 * - Checks preceding context: tag must be preceded by whitespace, line start,
 *   or certain punctuation characters (not alphanumeric)
 * - If the `#` is followed by a space or is at line start + space → let
 *   the heading parser handle it (return -1)
 *
 * ## Preceding Context Check
 *
 * A tag is valid only when the `#` is preceded by:
 * - Start of the inline section (offset)
 * - Whitespace (space, tab, newline)
 * - Certain punctuation: `(`, `[`, `{`, `>`, `"`, `'`, `,`, `;`, `:`, `~`
 *
 * This prevents matching `#` inside URLs, email addresses, or code.
 */

import type { MarkdownConfig, InlineParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Character Helpers ────────────────────────────────────────────────────────

const TAG_CHARS = new Set([
  95, /* '_' */
  45, /* '-' */
  47, /* '/' */
])

function isTagBodyChar(ch: number): boolean {
  return (
    (ch >= 48 && ch <= 57) /* 0-9 */ ||
    (ch >= 65 && ch <= 90) /* A-Z */ ||
    (ch >= 97 && ch <= 122) /* a-z */ ||
    TAG_CHARS.has(ch)
  )
}

function isTagStartChar(ch: number): boolean {
  // Tag must start with a letter, underscore, or digit
  return (
    (ch >= 65 && ch <= 90) /* A-Z */ ||
    (ch >= 97 && ch <= 122) /* a-z */ ||
    ch === 95 /* '_' */ ||
    (ch >= 48 && ch <= 57) /* 0-9 */
  )
}

/** Characters that are valid preceding context for a tag */
const VALID_PRECEDING = new Set([
  32, /* ' ' */
  9,  /* '\t' */
  10, /* '\n' */
  13, /* '\r' */
  40, /* '(' */
  91, /* '[' */
  123,/* '{' */
  62, /* '>' */
  34, /* '"' */
  39, /* '\'' */
  44, /* ',' */
  59, /* ';' */
  58, /* ':' */
  126,/* '~' */
])

// ─── Tag Inline Parser ────────────────────────────────────────────────────────

const tagParser: InlineParser = {
  name: 'Tag',
  before: 'Escape',

  parse(cx, next, pos) {
    // Must see #
    if (next !== 35 /* '#' */) return -1

    // Next char after # must be a valid tag start character
    const afterHash = cx.char(pos + 1)
    if (!isTagStartChar(afterHash)) return -1

    // Check preceding context — # must not be preceded by an alphanumeric
    // (to avoid matching inside words like "issue#123" or URLs)
    if (pos > cx.offset) {
      const prevCh = cx.char(pos - 1)
      if (
        (prevCh >= 48 && prevCh <= 57) /* 0-9 */ ||
        (prevCh >= 65 && prevCh <= 90) /* A-Z */ ||
        (prevCh >= 97 && prevCh <= 122) /* a-z */ ||
        prevCh === 95 /* '_' */
      ) {
        return -1
      }
      // Also reject if preceded by another # (heading markers)
      if (prevCh === 35 /* '#' */) return -1
    }

    // Scan forward to find the end of the tag name
    let endPos = pos + 1
    while (endPos < cx.end && isTagBodyChar(cx.char(endPos))) {
      endPos++
    }

    // Tag must have at least one character after #
    if (endPos === pos + 1) return -1

    // A trailing slash or dash is not part of the tag (Obsidian behavior)
    // But internal slashes and dashes are fine
    let tagEnd = endPos
    const lastChar = cx.char(tagEnd - 1)
    if (lastChar === 47 /* '/' */ || lastChar === 45 /* '-' */) {
      tagEnd--
      // Keep trimming trailing slashes/dashes
      while (tagEnd > pos + 1) {
        const ch = cx.char(tagEnd - 1)
        if (ch === 47 || ch === 45) {
          tagEnd--
        } else {
          break
        }
      }
    }

    // Must still have at least one character after trimming
    if (tagEnd <= pos + 1) return -1

    // Build: TagMark(#) + TagName
    const children = [
      cx.elt('TagMark', pos, pos + 1),
      cx.elt('TagName', pos + 1, tagEnd),
    ]
    return cx.addElement(cx.elt('Tag', pos, tagEnd, children))
  },
}

// ─── Tag Extension ────────────────────────────────────────────────────────────

export const tagExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Tag',
      style: { 'Tag/...': tags.labelName },
    },
    {
      name: 'TagMark',
      style: tags.processingInstruction,
    },
    {
      name: 'TagName',
      style: tags.labelName,
    },
  ],
  parseInline: [tagParser],
}
