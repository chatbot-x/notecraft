/**
 * Horizontal rule decoration plugin.
 *
 * Replaces `---`, `***`, `___` markers with a visual `<hr>` element
 * when the cursor is not on that line.
 *
 * Uses the lezer syntax tree to find HorizontalRule nodes.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { isCursorOnLine } from './shared'

// ─── Widget: Horizontal Rule ──────────────────────────────────────────────────

class HorizontalRuleWidget extends WidgetType {
  constructor() { super() }

  eq(_other: HorizontalRuleWidget) {
    return true
  }

  toDOM(): HTMLElement {
    const hr = document.createElement('div')
    hr.className = 'cm-hybrid-hr'
    return hr
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildHRDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'HorizontalRule') return

        const line = doc.lineAt(node.from)

        // Only replace when cursor is not on this line
        if (isCursorOnLine(state, line.from, line.to)) return

        ranges.push(
          Decoration.replace({
            widget: new HorizontalRuleWidget(),
            block: true,
          }).range(node.from, node.to)
        )
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const hrPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHRDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildHRDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
