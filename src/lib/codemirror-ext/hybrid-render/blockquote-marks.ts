/**
 * Blockquote marks decoration plugin.
 *
 * Fades the `>` markers on blockquote lines when the cursor is not on that line.
 * This mirrors Obsidian's Live Preview where blockquote markers are subtle.
 *
 * Note: Callout blocks (> [!note]) are handled by the callouts plugin with
 * their own styling. This plugin only handles regular blockquotes.
 *
 * Uses the lezer syntax tree to find QuoteMark nodes.
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

function buildBlockquoteMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'QuoteMark') return

        const line = doc.lineAt(node.from)

        // Skip callout headers — they have their own styling from the callouts plugin
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
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildBlockquoteMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
