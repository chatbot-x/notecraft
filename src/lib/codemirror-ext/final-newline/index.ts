/**
 * codemirror-ext: Final Newline Module
 *
 * Ensures the document always ends with a trailing newline.
 * Based on yeliex/codemirror-final-newline with enhancements:
 * - Configurable enable/disable
 * - Configurable trigger (on focus change only, or always)
 * - Respects existing selection (doesn't move cursor when user has selection)
 *
 * This is a tiny editing utility — no rendering engine.
 */

import { Text, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type PluginValue, ViewUpdate } from '@codemirror/view'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FinalNewlineOptions {
  /** Enable the extension (default: true) */
  enabled?: boolean
  /** Only add newline on focus change, not on every update (default: true) */
  onFocusOnly?: boolean
}

// ─── Plugin ────────────────────────────────────────────────────────────────────

class FinalNewLinePlugin implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly onFocusOnly: boolean,
  ) {
    if (!onFocusOnly) {
      // Ensure newline on init
      setTimeout(() => this.ensureFinalNewLine(), 0)
    }
  }

  private ensureFinalNewLine() {
    const endLine = this.view.state.doc.line(this.view.state.doc.lines)
    if (!endLine.length) return // Already ends with empty line

    const hasSelection = this.view.state.selection.ranges.some(
      (range) => range.from !== range.to
    )

    this.view.dispatch({
      changes: {
        from: endLine.to,
        insert: Text.of(['', '']),
      },
      selection: hasSelection
        ? undefined
        : { anchor: endLine.to + 1, head: endLine.to + 1 },
    })
  }

  update(update: ViewUpdate) {
    if (update.focusChanged) {
      setTimeout(() => this.ensureFinalNewLine(), 0)
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Create the final newline extension for CodeMirror 6.
 *
 * Usage:
 * ```ts
 * import { finalNewline } from '@/lib/codemirror-ext'
 *
 * const extensions = [
 *   finalNewline({ enabled: true, onFocusOnly: true }),
 * ]
 * ```
 */
export function finalNewline(options?: FinalNewlineOptions): Extension {
  const { enabled = true, onFocusOnly = true } = options ?? {}

  if (!enabled) return []

  return ViewPlugin.fromClass(
    class extends FinalNewLinePlugin {
      constructor(view: EditorView) {
        super(view, onFocusOnly)
      }
    },
  )
}
