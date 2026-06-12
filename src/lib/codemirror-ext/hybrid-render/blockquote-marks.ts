/**
 * Blockquote marks decoration plugin — Enhanced Edition.
 *
 * Fades the `>` markers on blockquote lines when the cursor is not on that line.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSourceForLine()` for consistent cursor-awareness with
 * drag-suppression and focus awareness.
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
import { quoteMarkFaded } from './shared'
import { shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

function buildBlockquoteMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  // Collect positions of Callout nodes to skip their > marks
  const calloutRanges: Array<{ from: number; to: number }> = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Callout') {
          calloutRanges.push({ from: node.from, to: node.to })
        }
      },
    })
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'QuoteMark') return

        // Skip if this > mark is inside a callout range
        const inCallout = calloutRanges.some(
          (cr) => node.from >= cr.from && node.to <= cr.to
        )
        if (inCallout) return

        // Fallback: skip callout headers via regex
        const line = doc.lineAt(node.from)
        const lineText = doc.sliceString(line.from, line.to)
        if (lineText.match(/^\s*>\s*\[!/)) return

        // Use centralized shouldShowSourceForLine
        if (shouldShowSourceForLine(state, line.from, line.to)) return

        ranges.push(quoteMarkFaded.range(node.from, node.to))
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const blockquoteMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildBlockquoteMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildBlockquoteMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
