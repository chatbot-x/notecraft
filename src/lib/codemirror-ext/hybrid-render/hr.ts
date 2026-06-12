/**
 * Horizontal rule decoration — Enhanced Edition.
 *
 * Replaces `---`, `***`, `___` markers with a visual `<hr>` element.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSourceForLine()` for consistent cursor-awareness.
 * Singleton HR widget (from Atomic Editor pattern) — since all HRs look
 * the same, we reuse one widget instance.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { StateField } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction, dragSelectingField } from './drag-state'

// ─── Widget: Horizontal Rule (Singleton) ──────────────────────────────────────

class HorizontalRuleWidget extends WidgetType {
  constructor() { super() }

  eq(_other: HorizontalRuleWidget) {
    return true // All HRs are identical — always reuse DOM
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

/** Singleton instance — reused for all HR decorations (Atomic Editor pattern) */
const HR_WIDGET = new HorizontalRuleWidget()

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildHRDecorations(state: import('@codemirror/state').EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = state.doc

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'HorizontalRule') return

      const line = doc.lineAt(node.from)

      if (shouldShowSourceForLine(state, line.from, line.to)) return

      ranges.push(
        Decoration.replace({
          widget: HR_WIDGET,
          block: true,
        }).range(node.from, node.to)
      )
    },
  })

  return Decoration.set(ranges, true)
}

// ─── StateField ───────────────────────────────────────────────────────────────

export const hrField = StateField.define<DecorationSet>({
  create(state) {
    return buildHRDecorations(state)
  },
  update(deco, tr) {
    const action = checkUpdateActionForField(tr)
    if (action === 'rebuild') {
      return buildHRDecorations(tr.state)
    }
    if (tr.docChanged) {
      return deco.map(tr.changes)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

function checkUpdateActionForField(tr: import('@codemirror/state').Transaction): 'rebuild' | 'skip' | 'none' {
  if (tr.docChanged) return 'rebuild'

  const isDragging = tr.state.field(dragSelectingField, false)
  const wasDragging = tr.startState.field(dragSelectingField, false)

  if (isDragging && wasDragging) return 'skip'
  if (wasDragging && !isDragging) return 'rebuild'
  if (isDragging) return 'rebuild'

  if (tr.selection) return 'rebuild'

  return 'none'
}

export const hrPlugin = hrField
