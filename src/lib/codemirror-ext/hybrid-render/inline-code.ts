/**
 * Inline code decoration plugin.
 *
 * Adds a subtle background class to inline code spans (`code`).
 * Hides backtick delimiters when cursor is outside the code span.
 *
 * Uses the lezer syntax tree to find InlineCode nodes.
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
import { inlineCodeMark, hiddenMark, isCursorInRange } from './shared'
import { checkUpdateAction } from './drag-state'

function buildInlineCodeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'InlineCode') {
          const state = view.state
          const codeFrom = node.from
          const codeTo = node.to

          if (isCursorInRange(state, codeFrom, codeTo)) {
            // Cursor inside — just style, don't hide backticks
            ranges.push(inlineCodeMark.range(codeFrom, codeTo))
            return
          }

          // Style the whole span
          ranges.push(inlineCodeMark.range(codeFrom, codeTo))

          // Hide opening backtick(s)
          const text = state.doc.sliceString(codeFrom, codeTo)
          const openMatch = text.match(/^`+/)
          if (openMatch) {
            ranges.push(hiddenMark.range(codeFrom, codeFrom + openMatch[0].length))
          }

          // Hide closing backtick(s)
          const closeMatch = text.match(/`+$/)
          if (closeMatch) {
            ranges.push(hiddenMark.range(codeTo - closeMatch[0].length, codeTo))
          }
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const inlineCodePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildInlineCodeDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildInlineCodeDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
