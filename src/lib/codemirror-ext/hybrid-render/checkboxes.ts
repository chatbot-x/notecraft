/**
 * Checkboxes decoration plugin.
 *
 * Replaces `- [x]` / `- [ ]` task markers with interactive checkbox widgets.
 * Clicking the checkbox toggles the underlying Markdown.
 *
 * Uses the lezer syntax tree to find TaskMarker nodes.
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

// ─── Widget: Checkbox ─────────────────────────────────────────────────────────

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super() }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos
  }

  toDOM(): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-hybrid-checkbox'
    input.setAttribute('aria-label', this.checked ? 'Checked' : 'Unchecked')
    return input
  }

  ignoreEvent(event: Event): boolean {
    // Allow click events for toggling
    if (event instanceof MouseEvent) return false
    return true
  }
}

// ─── Checkbox Click Handler ───────────────────────────────────────────────────

/** Handle checkbox clicks by finding the TaskMarker and toggling it */
function handleCheckboxClick(view: EditorView, pos: number): boolean {
  let foundFrom = -1
  let foundTo = -1

  syntaxTree(view.state).iterate({
    from: Math.max(0, pos - 5),
    to: Math.min(view.state.doc.length, pos + 5),
    enter(node) {
      if (node.name === 'TaskMarker') {
        foundFrom = node.from
        foundTo = node.to
      }
    },
  })

  if (foundFrom === -1) return false

  const text = view.state.doc.sliceString(foundFrom, foundTo)
  const newText = text === '[x]' || text === '[X]' ? '[ ]' : '[x]'

  view.dispatch({
    changes: { from: foundFrom, to: foundTo, insert: newText },
  })

  return true
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildCheckboxDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'TaskMarker') {
          const text = doc.sliceString(node.from, node.to)
          const checked = text === '[x]' || text === '[X]'
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(checked, node.from),
            }).range(node.from, node.to)
          )
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const checkboxesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCheckboxDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCheckboxDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event: MouseEvent, view: EditorView) {
        const target = event.target as HTMLElement
        if (target.classList.contains('cm-hybrid-checkbox')) {
          const pos = view.posAtDOM(target)
          return handleCheckboxClick(view, pos)
        }
        return false
      },
    },
  }
)
