/**
 * Drag-selection state tracking for hybrid rendering.
 *
 * When the user is mouse-dragging to select text, decoration rebuilds triggered
 * by `selectionSet` cause visible flickering (raw syntax flashes briefly before
 * the new decorations settle). This module provides a StateField that tracks
 * whether a drag-selection is in progress, plus a `checkUpdateAction` helper
 * that all hybrid-render ViewPlugins use to decide whether to rebuild.
 *
 * ## How it works
 *
 * 1. `dragSelectingField` is a boolean StateField, updated via StateEffects.
 * 2. DOM event handlers dispatch `startDragSelect` / `endDragSelect` effects
 *    on mousedown / mouseup.
 * 3. Each ViewPlugin's `update()` calls `checkUpdateAction()` instead of
 *    manually checking `docChanged || viewportChanged || selectionSet`.
 * 4. During a drag, `checkUpdateAction` returns `'skip'`, preventing
 *    decoration rebuilds. When the drag ends, it returns `'rebuild'` so
 *    decorations catch up.
 *
 * This pattern is borrowed from `codemirror-live-markdown`, the reference
 * Obsidian-style Live Preview implementation.
 */

import { StateEffect, StateField } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import { EditorView } from '@codemirror/view'

// ─── State Effects ──────────────────────────────────────────────────────────────

/** Dispatched on mousedown to signal the start of a drag selection. */
export const startDragSelect = StateEffect.define<void>()

/** Dispatched on mouseup to signal the end of a drag selection. */
export const endDragSelect = StateEffect.define<void>()

// ─── State Field ────────────────────────────────────────────────────────────────

/**
 * Boolean StateField that is `true` while the user is mouse-dragging.
 *
 * Use `checkUpdateAction()` in ViewPlugin `update()` methods to respect this.
 */
export const dragSelectingField = StateField.define<boolean>({
  create() {
    return false
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(startDragSelect)) return true
      if (effect.is(endDragSelect)) return false
    }
    return value
  },
})

// ─── DOM Event Handlers ─────────────────────────────────────────────────────────

/**
 * Extension that wires mousedown/mouseup to the drag-selecting field.
 *
 * Must be included in the extension set for `dragSelectingField` to work.
 * Only tracks primary-button drags (button === 0) to avoid interfering with
 * context menus.
 */
export const dragSelectHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button === 0) {
      view.dispatch({ effects: startDragSelect.of(undefined) })
    }
  },
  mouseup(event, view) {
    if (event.button === 0) {
      view.dispatch({ effects: endDragSelect.of(undefined) })
    }
  },
})

// ─── Update Action Helper ───────────────────────────────────────────────────────

/**
 * Categorize a ViewUpdate to decide whether decorations should be rebuilt,
 * skipped, or left alone.
 *
 * | Return     | Meaning                                         |
 * |------------|-------------------------------------------------|
 * | `'rebuild'`| Document/viewport changed, or drag just ended   |
 * | `'skip'`   | Currently dragging — suppress rebuild            |
 * | `'none'`   | Nothing relevant changed — keep existing decos  |
 *
 * ### Usage
 *
 * ```ts
 * update(update: ViewUpdate) {
 *   const action = checkUpdateAction(update)
 *   if (action === 'rebuild') {
 *     this.decorations = build(update.view)
 *   }
 *   // 'skip' and 'none' → don't touch decorations
 * }
 * ```
 */
export function checkUpdateAction(update: ViewUpdate): 'rebuild' | 'skip' | 'none' {
  // Structural changes always require a rebuild
  if (update.docChanged || update.viewportChanged) {
    return 'rebuild'
  }

  // Check drag-selecting state
  const isDragging = update.state.field(dragSelectingField, false)
  const wasDragging = update.startState.field(dragSelectingField, false)

  if (isDragging) {
    // During drag, suppress rebuilds to prevent flicker
    if (wasDragging) return 'skip'
    // Just started dragging — but a selection may have already occurred.
    // Rebuild one last time to show the raw syntax at the current position.
    return 'rebuild'
  }

  if (wasDragging && !isDragging) {
    // Drag just ended — rebuild to apply decorations to the final selection
    return 'rebuild'
  }

  // Selection changed (not from drag) — rebuild for cursor-awareness
  if (update.selectionSet) {
    return 'rebuild'
  }

  return 'none'
}
