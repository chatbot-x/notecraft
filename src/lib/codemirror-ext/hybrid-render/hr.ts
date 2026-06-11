/**
 * Horizontal rule decoration — StateField implementation.
 *
 * Replaces `---`, `***`, `___` markers with a visual `<hr>` element
 * when the cursor is not on that line.
 *
 * ## Why StateField?
 *
 * This decoration uses `Decoration.replace({ block: true })`, which changes
 * the vertical block structure of the document. Block-changing decorations
 * MUST be provided via StateField (direct provision to EditorView.decorations)
 * because the viewport is computed FROM the block structure. ViewPlugin-provided
 * decorations are computed AFTER the viewport, so they cannot affect it.
 *
 * Uses the lezer syntax tree to find HorizontalRule nodes.
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
import { isCursorOnLine } from './shared'
import { checkUpdateAction, dragSelectingField } from './drag-state'

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

function buildHRDecorations(state: import('@codemirror/state').EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = state.doc

  syntaxTree(state).iterate({
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

  return Decoration.set(ranges, true)
}

// ─── StateField ───────────────────────────────────────────────────────────────

/**
 * StateField for horizontal rule rendering.
 *
 * Provides block-level replace decorations directly to EditorView.decorations.
 * This ensures the viewport is correctly computed with the HR widgets in place.
 */
export const hrField = StateField.define<DecorationSet>({
  create(state) {
    return buildHRDecorations(state)
  },
  update(deco, tr) {
    const action = checkUpdateActionForField(tr)
    if (action === 'rebuild') {
      return buildHRDecorations(tr.state)
    }
    // Map through changes for non-rebuild updates
    if (tr.docChanged) {
      return deco.map(tr.changes)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

/**
 * Simplified update action check for StateField (uses Transaction instead of ViewUpdate).
 */
function checkUpdateActionForField(tr: import('@codemirror/state').Transaction): 'rebuild' | 'skip' | 'none' {
  // Structural changes always rebuild
  if (tr.docChanged) return 'rebuild'

  // Check drag state
  const isDragging = tr.state.field(dragSelectingField, false)
  const wasDragging = tr.startState.field(dragSelectingField, false)

  if (isDragging && wasDragging) return 'skip'
  if (wasDragging && !isDragging) return 'rebuild'
  if (isDragging) return 'rebuild' // Just started

  // Selection changes rebuild (cursor-aware)
  if (tr.selection) return 'rebuild'

  return 'none'
}

/** Legacy export for backward compatibility — proxies to hrField */
export const hrPlugin = hrField
