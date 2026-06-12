/**
 * Cursor Awareness Facet — centralized cursor position tracking for hybrid render plugins.
 *
 * ## Problem
 *
 * Each of the 17+ hybrid render plugins independently checks cursor position
 * via `isCursorInRange()` or `isCursorOnLine()` on every decoration rebuild.
 * This means the same selection ranges are read and compared 17+ times per
 * update cycle.
 *
 * ## Solution
 *
 * This module provides a centralized `cursorPositionField` StateField that
 * computes the current cursor/selection ranges once per update and exposes
 * them via helper functions. Plugins can then use `getCursorRanges()` instead
 * of `state.selection.ranges` for a small but measurable performance gain,
 * especially in documents with many decorations.
 *
 * Additionally, it provides `isLineActive()` and `isRangeActive()` which
 * combine the cursor check with the drag-selecting state — during a drag,
 * these functions return the "pre-drag" result to prevent flicker, without
 * each plugin needing to import and check `dragSelectingField` separately.
 *
 * ## Usage
 *
 * ```ts
 * // Before (each plugin does this independently):
 * import { isCursorOnLine } from './shared'
 * import { checkUpdateAction, dragSelectingField } from './drag-state'
 *
 * if (isCursorOnLine(state, lineFrom, lineTo)) return
 *
 * // After (using centralized facet):
 * import { isLineActive, isRangeActive } from './cursor-awareness'
 *
 * if (isLineActive(state, lineFrom, lineTo)) return
 * ```
 *
 * ## Performance Impact
 *
 * In a document with 500+ lines and 17 active plugins, the centralized
 * approach reduces redundant selection reads from ~34 (17 plugins x 2 calls)
 * to 1 per update. The savings are modest but consistent, especially during
 * rapid typing where decoration rebuilds are frequent.
 */

import { StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { dragSelectingField } from './drag-state'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CursorInfo {
  /** The selection ranges from the current state */
  ranges: Array<{ from: number; to: number }>
  /** Whether a drag selection is in progress */
  isDragging: boolean
  /** Pre-computed: which lines have the cursor on them (for isCursorOnLine checks) */
  activeLines: Set<number>
}

// ─── State Field ──────────────────────────────────────────────────────────────

/**
 * StateField that pre-computes cursor position information.
 *
 * This field is updated on every transaction that changes the selection.
 * It pre-computes which lines are "active" (have the cursor on them) to
 * avoid repeated line-number lookups across plugins.
 */
export const cursorPositionField = StateField.define<CursorInfo>({
  create(state) {
    return computeCursorInfo(state)
  },

  update(value, tr) {
    if (!tr.selection) return value
    return computeCursorInfo(tr.state)
  },
})

function computeCursorInfo(state: EditorState): CursorInfo {
  const ranges: Array<{ from: number; to: number }> = state.selection.ranges.map(r => ({
    from: Math.min(r.from, r.to),
    to: Math.max(r.from, r.to),
  }))

  const isDragging = state.field(dragSelectingField, false) ?? false

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

  return { ranges, isDragging, activeLines }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

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
 * Check if the cursor/selection is within a range [from, to).
 *
 * This is the centralized replacement for `isCursorInRange()`.
 * It respects drag-selecting state: during a drag, it returns false
 * (no cursor in range) to prevent decorations from being suppressed
 * during selection.
 */
export function isRangeActive(state: EditorState, from: number, to: number): boolean {
  const info = getCursorInfo(state)

  // During drag, don't suppress decorations
  if (info.isDragging) return false

  for (const r of info.ranges) {
    if (r.from < to && r.to > from) return true
  }
  return false
}

/**
 * Check if the cursor/selection touches a specific line range.
 *
 * This is the centralized replacement for `isCursorOnLine()`.
 * It uses pre-computed active line numbers for better performance
 * on documents with many lines.
 */
export function isLineActive(state: EditorState, lineFrom: number, lineTo: number): boolean {
  const info = getCursorInfo(state)

  // During drag, don't suppress decorations
  if (info.isDragging) return false

  // Use pre-computed active lines if the field is installed
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

/**
 * Get all active (cursor-on) line numbers.
 * Useful for plugins that need to check multiple lines.
 */
export function getActiveLines(state: EditorState): Set<number> {
  return getCursorInfo(state).activeLines
}
