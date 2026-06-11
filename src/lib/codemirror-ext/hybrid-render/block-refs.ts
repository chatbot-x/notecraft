/**
 * Block references decoration plugin.
 *
 * Handles Obsidian-style block references: ^block-id at the end of a line.
 *
 * In Live Preview, block reference IDs are styled as subtle clickable indicators.
 * The `^` prefix is faded and the ID is styled as a small badge, matching
 * Obsidian's behavior where block refs are visible but unobtrusive.
 *
 * When the cursor is on the line, the raw ^id is shown normally.
 *
 * Uses regex scanning since the lezer parser doesn't understand ^block-id syntax.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import {
  blockRefMark,
  fadedMark,
  isCursorOnLine,
  BLOCK_REF_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildBlockRefDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    BLOCK_REF_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = BLOCK_REF_RE.exec(visibleText)) !== null) {
      const blockId = match[1]
      // Calculate the position of the ^ character
      // match[0] may include a leading space/newline
      const leadingLen = match[0].length - 1 - blockId.length
      const caretPos = from + match.index + leadingLen
      const idEnd = caretPos + 1 + blockId.length // includes the ^

      // Skip if inside code block or inline code
      if (isInRangeList(caretPos, idEnd, skipRanges)) continue

      const line = doc.lineAt(caretPos)

      // Skip if cursor is on this line (show raw syntax)
      if (isCursorOnLine(state, line.from, line.to)) continue

      // Style the ^ as faded, and the block-id as a badge
      ranges.push(fadedMark.range(caretPos, caretPos + 1))
      ranges.push(blockRefMark.range(caretPos + 1, idEnd))
    }
  }

  return Decoration.set(ranges, true)
}

export const blockRefsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildBlockRefDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildBlockRefDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
