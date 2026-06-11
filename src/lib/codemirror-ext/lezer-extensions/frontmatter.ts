/**
 * Lezer grammar extension for YAML frontmatter: ---\\nyaml\\n---
 *
 * Adds `Frontmatter`, `FrontmatterMark`, and `FrontmatterContent` nodes
 * to the syntax tree so that decoration plugins can use tree-based scanning
 * instead of regex.
 *
 * ## Syntax
 *
 * YAML frontmatter appears at the very beginning of a document, delimited by
 * `---` on its own line:
 *
 * ```yaml
 * ---
 * title: My Note
 * tags: [important, draft]
 * ---
 * ```
 *
 * ## Block Parser Design
 *
 * Uses a LeafBlockParser (like Table and TaskList) because frontmatter
 * spans multiple lines. The `leaf()` method is called for paragraph-like
 * blocks; we check if the content starts with `---` and we're at position 0.
 *
 * The `nextLine()` method scans forward for the closing `---` delimiter.
 * The `finish()` method assembles the tree structure:
 *
 * ```
 * Frontmatter
 * ├── FrontmatterMark  (opening ---)
 * ├── FrontmatterContent (YAML between delimiters)
 * └── FrontmatterMark  (closing ---)
 * ```
 *
 * Runs `before: "HorizontalRule"` because `---` at position 0 is also
 * valid HR syntax — frontmatter takes precedence at doc start.
 */

import type { MarkdownConfig, BlockParser } from '@lezer/markdown'
import { tags } from '@lezer/highlight'

// ─── Frontmatter Leaf Block Parser ───────────────────────────────────────────

class FrontmatterParser {
  /** Whether we found the closing --- */
  foundClose = false
  /** Start position of the closing --- line */
  closeLineStart = -1
  /** Start position of the opening --- line (i.e., the leaf start) */
  openStart: number

  constructor(openStart: number) {
    this.openStart = openStart
  }

  nextLine(_cx: any, line: any): boolean {
    // Check if this line is the closing ---
    const trimmed = line.text.trimEnd()
    if (trimmed === '---') {
      this.foundClose = true
      this.closeLineStart = _cx.lineStart
      return true // done — consumed up to closing delimiter
    }

    // Continue accumulating — look at next line
    // Safety: don't scan more than 100 lines
    return false
  }

  finish(cx: any, leaf: any): boolean {
    if (!this.foundClose) return false

    // Calculate positions
    const openStart = this.openStart
    const openMarkEnd = openStart + 3 // after opening ---
    const closeStart = this.closeLineStart
    const closeMarkEnd = closeStart + 3 // after closing ---

    const children = [
      cx.elt('FrontmatterMark', openStart, openMarkEnd),
      cx.elt('FrontmatterContent', openMarkEnd, closeStart),
      cx.elt('FrontmatterMark', closeStart, closeMarkEnd),
    ]

    cx.addLeafElement(
      leaf,
      cx.elt('Frontmatter', openStart, closeMarkEnd, children)
    )
    return true
  }
}

const frontmatterBlockParser: BlockParser = {
  name: 'Frontmatter',
  before: 'HorizontalRule',

  leaf(cx: any, leaf: any) {
    // Only match at the very start of the document
    if (cx.parsedPos > 0) return null

    // First line must be exactly ---
    const trimmed = leaf.content.trimEnd()
    if (trimmed !== '---') return null

    return new FrontmatterParser(leaf.start) as any
  },
}

// ─── Frontmatter Extension ───────────────────────────────────────────────────

export const frontmatterExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: 'Frontmatter',
      block: true,
      style: { 'Frontmatter/...': tags.meta },
    },
    {
      name: 'FrontmatterMark',
      style: tags.processingInstruction,
    },
    {
      name: 'FrontmatterContent',
      style: tags.meta,
    },
  ],
  parseBlock: [frontmatterBlockParser],
}
