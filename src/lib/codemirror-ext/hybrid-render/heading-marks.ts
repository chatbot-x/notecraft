/**
 * Heading marks decoration plugin.
 *
 * Hides the `#` marks on ATX headings when the cursor is not on that line.
 * This mirrors Obsidian's Live Preview behavior where heading markers are
 * invisible in reading mode but revealed when you navigate to that line.
 *
 * Uses the lezer syntax tree to find HeaderMark nodes.
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
import { hiddenMark, isCursorOnLine } from './shared'

function buildHeadingMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'HeaderMark') return

        // Find the line this header mark is on
        const line = doc.lineAt(node.from)
        const lineFrom = line.from
        const lineTo = line.to

        // Only hide marks when cursor is NOT on this line
        if (isCursorOnLine(state, lineFrom, lineTo)) return

        // Also hide the space after the # marks
        // HeaderMark covers "###" but the space after is not part of the node
        let markEnd = node.to
        // Check if there's a space right after the marks
        if (markEnd < lineTo && doc.sliceString(markEnd, markEnd + 1) === ' ') {
          markEnd++
        }

        ranges.push(hiddenMark.range(node.from, markEnd))
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const headingMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHeadingMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildHeadingMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
