/**
 * Emphasis marks decoration plugin.
 *
 * Hides the `*`, `**`, `_`, `__` delimiters around bold and italic text
 * when the cursor is not inside the emphasized range. This mirrors Obsidian's
 * Live Preview where emphasis markers fade away in reading mode.
 *
 * Also handles ~~ strikethrough delimiters.
 *
 * Uses the lezer syntax tree to find EmphasisMark and StrikethroughMark nodes.
 *
 * ## Performance optimization (v2)
 *
 * Instead of the previous approach of calling `findParentRange()` which
 * re-scanned the tree for each EmphasisMark node, this version uses a
 * two-pass approach:
 * 1. First pass: collect all emphasis/strikethrough parent ranges
 * 2. Second pass: iterate EmphasisMark/StrikethroughMark and check against
 *    the collected parent ranges
 *
 * This reduces tree traversals from O(n*m) to O(n+m) where n is the number
 * of mark nodes and m is the number of emphasis nodes in the viewport.
 * Inspired by Atomic Editor's batch-decoration pattern.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { emphasisMarkHidden, strikethroughMarkHidden, isCursorInRange } from './shared'
import { checkUpdateAction } from './drag-state'

/** Names of emphasis parent nodes */
const EMPHASIS_PARENT_NAMES = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough'])

function buildEmphasisMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state

  for (const { from, to } of view.visibleRanges) {
    // ── Pass 1: Collect parent ranges ────────────────────────────────────
    // Build a map of parent emphasis ranges so we can quickly look up
    // which parent contains each mark node without re-scanning the tree.
    const parentRanges: Array<{ from: number; to: number }> = []
    const markNodes: Array<{ from: number; to: number; isStrike: boolean }> = []

    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (EMPHASIS_PARENT_NAMES.has(node.name)) {
          parentRanges.push({ from: node.from, to: node.to })
        }
        if (node.name === 'EmphasisMark') {
          markNodes.push({ from: node.from, to: node.to, isStrike: false })
        }
        if (node.name === 'StrikethroughMark') {
          markNodes.push({ from: node.from, to: node.to, isStrike: true })
        }
      },
    })

    // ── Pass 2: Apply decorations to mark nodes ──────────────────────────
    for (const mark of markNodes) {
      // Find the parent that contains this mark
      const parent = parentRanges.find(
        (p) => p.from <= mark.from && p.to >= mark.to
      )

      // If cursor is inside the parent emphasis range, show raw syntax
      if (parent && isCursorInRange(state, parent.from, parent.to)) {
        continue
      }

      ranges.push(
        (mark.isStrike ? strikethroughMarkHidden : emphasisMarkHidden).range(mark.from, mark.to)
      )
    }
  }

  return Decoration.set(ranges, true)
}

export const emphasisMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildEmphasisMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildEmphasisMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
