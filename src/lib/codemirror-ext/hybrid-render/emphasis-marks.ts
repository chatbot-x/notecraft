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
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import { emphasisMarkHidden, strikethroughMarkHidden, isCursorInRange } from './shared'
import { checkUpdateAction } from './drag-state'

function buildEmphasisMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // ── Emphasis marks: *, **, _, __ ────────────────────────
        if (node.name === 'EmphasisMark') {
          const parentRange = findParentRange(state, node.from, node.to)

          if (parentRange && isCursorInRange(state, parentRange.from, parentRange.to)) {
            return
          }

          ranges.push(emphasisMarkHidden.range(node.from, node.to))
        }

        // ── Strikethrough marks: ~~ ────────────────────────────
        if (node.name === 'StrikethroughMark') {
          const parentRange = findParentRange(state, node.from, node.to)

          if (parentRange && isCursorInRange(state, parentRange.from, parentRange.to)) {
            return
          }

          ranges.push(strikethroughMarkHidden.range(node.from, node.to))
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

/**
 * Find the parent node (Emphasis, StrongEmphasis, or Strikethrough)
 * that contains the given range.
 */
function findParentRange(
  state: EditorState,
  markFrom: number,
  markTo: number
): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null

  syntaxTree(state).iterate({
    from: markFrom,
    to: markTo,
    enter(node) {
      if (
        (node.name === 'Emphasis' || node.name === 'StrongEmphasis' || node.name === 'Strikethrough') &&
        node.from <= markFrom &&
        node.to >= markTo
      ) {
        result = { from: node.from, to: node.to }
      }
    },
  })

  return result
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
