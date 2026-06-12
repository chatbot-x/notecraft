/**
 * Blockquote marks decoration plugin.
 *
 * Fades the `>` markers on blockquote lines when the cursor is not on that line.
 * This mirrors Obsidian's Live Preview where blockquote markers are subtle.
 *
 * Note: Callout blocks (> [!note]) are handled by the callouts plugin with
 * their own styling. This plugin only handles regular blockquotes.
 *
 * ## Level 2: Tree-aware callout skipping
 *
 * With the Lezer Callout extension active, this plugin can detect callout
 * lines by checking for `Callout` sibling nodes, rather than using a regex
 * check on the line text. Falls back to regex if no Callout nodes are found.
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
import { quoteMarkFaded, isCursorOnLine } from './shared'
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

        // Fallback: skip callout headers via regex (for when Lezer extension not loaded)
        const line = doc.lineAt(node.from)
        const lineText = doc.sliceString(line.from, line.to)
        if (lineText.match(/^\s*>\s*\[!/)) return

        // Only fade when cursor is not on this line
        if (isCursorOnLine(state, line.from, line.to)) return

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
