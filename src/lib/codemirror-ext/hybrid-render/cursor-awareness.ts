/**
 * Cursor Awareness — centralized cursor position tracking and decision system.
 *
 * ## Architecture
 *
 * This module provides a single source of truth for the "should I show source
 * or rendered form?" decision that every hybrid render plugin must make.
 *
 * It combines three patterns from the community:
 *
 * 1. **Pre-computed cursor info** (from previous version): A StateField that
 *    computes active lines and ranges once per update, avoiding repeated
 *    selection reads across 17+ plugins.
 *
 * 2. **`shouldShowSource()` pure function** (from codemirror-live-markdown):
 *    A single composable decision function that all plugins call instead of
 *    ad-hoc cursor checks. This ensures consistent behavior across all plugins.
 *
 * 3. **`focusChangeEffect` pattern** (from codemirror-markdown-hybrid):
 *    A StateEffect that propagates editor focus state to StateFields, which
 *    can't access `view.hasFocus` directly.
 *
 * ## Usage
 *
 * ```ts
 * // Before (each plugin does this independently):
 * import { isCursorInRange } from './shared'
 * if (isCursorInRange(state, from, to)) return
 *
 * // After (using centralized system):
 * import { shouldShowSource } from './cursor-awareness'
 * if (shouldShowSource(state, from, to)) return
 * ```
 *
 * ## Performance Impact
 *
 * In a document with 500+ lines and 17 active plugins, the centralized
 * approach reduces redundant selection reads from ~34 (17 plugins x 2 calls)
 * to 1 per update. The `shouldShowSource` function is O(selectionRanges)
 * which is typically 1 (single cursor) or a small number (multi-cursor).
 */

import { StateField, StateEffect, Facet } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { dragSelectingField } from './drag-state'

// ─── Facet: Enable/Disable Live Preview ──────────────────────────────────────

/**
 * Facet that controls whether the live preview system is active.
 * When set to false, all decorations are suppressed and raw markdown is shown.
 *
 * This is useful for implementing a "Source Mode" toggle like Obsidian has.
 */
export const livePreviewEnabled = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? true,
})

// ─── Focus State ─────────────────────────────────────────────────────────────

/** StateEffect dispatched when the editor gains or loses focus. */
export const focusChangeEffect = StateEffect.define<boolean>()

/**
 * StateField tracking whether the editor is focused.
 *
 * StateFields can't access `view.hasFocus` directly, so this field is updated
 * via `focusChangeEffect` dispatched by the ViewPlugin that monitors focus.
 */
export const editorFocusField = StateField.define<boolean>({
  create() {
    return true // Assume focused on creation
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(focusChangeEffect)) return effect.value
    }
    return value
  },
})

// ─── Cursor Info Pre-computation ─────────────────────────────────────────────

interface CursorInfo {
  /** Normalized selection ranges (from <= to) */
  ranges: Array<{ from: number; to: number }>
  /** Whether a drag selection is in progress */
  isDragging: boolean
  /** Whether the editor has focus */
  isFocused: boolean
  /** Pre-computed: which lines have the cursor on them */
  activeLines: Set<number>
  /** Pre-computed: which ranges are "active" (cursor inside) */
  activeRanges: Array<{ from: number; to: number }>
}

// ─── State Field ─────────────────────────────────────────────────────────────

/**
 * StateField that pre-computes cursor position information.
 *
 * Updated on every transaction that changes the selection or focus.
 * Pre-computes which lines and ranges are "active" so individual plugins
 * don't need to do this work repeatedly.
 */
export const cursorPositionField = StateField.define<CursorInfo>({
  create(state) {
    return computeCursorInfo(state)
  },

  update(value, tr) {
    // Re-compute on selection changes, focus changes, or drag state changes
    if (!tr.selection && !tr.effects.some(e => e.is(focusChangeEffect))) {
      // Check if drag state changed
      const wasDragging = value.isDragging
      const isDragging = tr.state.field(dragSelectingField, false) ?? false
      if (wasDragging === isDragging) return value
    }
    return computeCursorInfo(tr.state)
  },
})

function computeCursorInfo(state: EditorState): CursorInfo {
  const ranges: Array<{ from: number; to: number }> = state.selection.ranges.map(r => ({
    from: Math.min(r.from, r.to),
    to: Math.max(r.from, r.to),
  }))

  const isDragging = state.field(dragSelectingField, false) ?? false
  const isFocused = state.field(editorFocusField, false) ?? true

  // Pre-compute active line numbers
  const activeLines = new Set<number>()
  const doc = state.doc
  for (const r of ranges) {
    const startLine = doc.lineAt(r.from).number
    const endLine = doc.lineAt(r.to).number
    for (let n = startLine; n <= endLine; n++) {
      activeLines.add(n)
    }
  }

  // Pre-compute active ranges (expanded to cover potential emphasis parents)
  // This allows plugins to do a quick check without re-scanning the tree
  const activeRanges = ranges.slice()

  return { ranges, isDragging, isFocused, activeLines, activeRanges }
}

// ─── Core Decision Function ──────────────────────────────────────────────────

/**
 * Get the pre-computed cursor info from the state.
 * Falls back to computing it on-the-fly if the field isn't installed.
 */
function getCursorInfo(state: EditorState): CursorInfo {
  const info = state.field(cursorPositionField, false)
  if (info) return info
  // Fallback: compute on the fly if field isn't installed
  return computeCursorInfo(state)
}

/**
 * Should the raw source be shown instead of the rendered form?
 *
 * This is the PRIMARY decision function for all hybrid render plugins.
 * It combines cursor position, drag state, and focus state into a single
 * boolean answer.
 *
 * Returns `true` when:
 * - The cursor/selection overlaps with [from, to)
 * - The editor is not in a drag-select state (during drag, show rendered form)
 * - The editor has focus (blurred editor shows rendered form)
 * - Live preview is enabled (disabled → always show source)
 *
 * ## Usage Patterns
 *
 * ```ts
 * // For inline decorations (emphasis, links, tags):
 * if (shouldShowSource(state, node.from, node.to)) {
 *   // Show raw syntax, add active styling
 * } else {
 *   // Hide syntax, show rendered form
 * }
 *
 * // For line-level decorations (headings, blockquotes):
 * if (shouldShowSource(state, line.from, line.to)) {
 *   // Don't apply line decoration
 * }
 * ```
 */
export function shouldShowSource(state: EditorState, from: number, to: number): boolean {
  const info = getCursorInfo(state)

  // If live preview is disabled, always show source
  if (!state.facet(livePreviewEnabled)) return true

  // During drag, don't suppress decorations (show rendered form)
  if (info.isDragging) return false

  // If editor is not focused, show rendered form
  if (!info.isFocused) return false

  // Check if any selection range overlaps [from, to)
  for (const r of info.ranges) {
    if (r.from < to && r.to > from) return true
  }
  return false
}

/**
 * Should the raw source be shown for a specific line?
 *
 * This is the line-level equivalent of `shouldShowSource()`.
 * It uses pre-computed active line numbers for better performance
 * on documents with many lines.
 */
export function shouldShowSourceForLine(state: EditorState, lineFrom: number, lineTo: number): boolean {
  const info = getCursorInfo(state)

  // If live preview is disabled, always show source
  if (!state.facet(livePreviewEnabled)) return true

  // During drag, don't suppress decorations
  if (info.isDragging) return false

  // If editor is not focused, show rendered form
  if (!info.isFocused) return false

  // Use pre-computed active lines if available
  if (info.activeLines.size > 0) {
    const doc = state.doc
    const startLine = doc.lineAt(lineFrom).number
    const endLine = doc.lineAt(Math.min(lineTo, doc.length)).number
    for (let n = startLine; n <= endLine; n++) {
      if (info.activeLines.has(n)) return true
    }
    return false
  }

  // Fallback: check ranges directly
  for (const r of info.ranges) {
    if (r.from <= lineTo && r.to >= lineFrom) return true
  }
  return false
}

// ─── Backward-Compatible Helpers ─────────────────────────────────────────────

/**
 * Check if the cursor/selection is within a range [from, to).
 *
 * @deprecated Use `shouldShowSource(state, from, to)` instead for consistent
 * behavior with drag-suppression and focus awareness.
 */
export function isRangeActive(state: EditorState, from: number, to: number): boolean {
  return shouldShowSource(state, from, to)
}

/**
 * Check if the cursor/selection touches a specific line range.
 *
 * @deprecated Use `shouldShowSourceForLine(state, lineFrom, lineTo)` instead
 * for consistent behavior with drag-suppression and focus awareness.
 */
export function isLineActive(state: EditorState, lineFrom: number, lineTo: number): boolean {
  return shouldShowSourceForLine(state, lineFrom, lineTo)
}

/**
 * Get all active (cursor-on) line numbers.
 * Useful for plugins that need to check multiple lines at once.
 */
export function getActiveLines(state: EditorState): Set<number> {
  return getCursorInfo(state).activeLines
}

/**
 * Get the editor focus state.
 * Useful for StateFields that need to know if the editor is focused.
 */
export function isEditorFocused(state: EditorState): boolean {
  return getCursorInfo(state).isFocused
}

// ─── Focus Monitor Plugin ────────────────────────────────────────────────────

/**
 * ViewPlugin that monitors editor focus changes and dispatches
 * `focusChangeEffect` so StateFields can react to focus state.
 *
 * Without this, StateFields (like displayMathField, hrField, frontmatterField)
 * can't access `view.hasFocus` directly. This plugin bridges the gap.
 *
 * Pattern from codemirror-markdown-hybrid's `focusChangeEffect`.
 */
export const focusMonitorPlugin = ViewPlugin.fromClass(
  class {
    private lastFocusState: boolean = true

    update(update: ViewUpdate) {
      const currentFocus = update.view.hasFocus
      if (currentFocus !== this.lastFocusState) {
        this.lastFocusState = currentFocus
        // Dispatch focus change as a StateEffect so StateFields can see it
        // Use setTimeout to avoid dispatching during an ongoing update
        setTimeout(() => {
          try {
            update.view.dispatch({
              effects: focusChangeEffect.of(currentFocus),
            })
          } catch {
            // View may have been destroyed between timeout scheduling and execution
          }
        }, 0)
      }
    }
  },
)
