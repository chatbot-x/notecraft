/**
 * Inline code decoration plugin.
 *
 * Adds a subtle background class to inline code spans (`code`).
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
import { inlineCodeMark } from './shared'

function buildInlineCodeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'InlineCode') {
          ranges.push(inlineCodeMark.range(node.from, node.to))
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
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildInlineCodeDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
