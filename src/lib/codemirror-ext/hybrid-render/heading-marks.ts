/**
 * Heading marks decoration plugin — Enhanced Edition.
 *
 * Hides the `#` marks on ATX headings when the cursor is not on that line.
 * This mirrors Obsidian's Live Preview behavior where heading markers are
 * invisible in reading mode but revealed when you navigate to that line.
 *
 * Also applies heading size styling (H1–H6) when headingSizes is enabled.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSourceForLine()` for consistent cursor-awareness with
 * drag-suppression and focus awareness.
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
import { hiddenMark } from './shared'
import { shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Heading Size Classes ─────────────────────────────────────────────────────

/** Maps heading level to CSS class for size styling */
const HEADING_CLASSES: Record<number, string> = {
  1: 'cm-hybrid-h1',
  2: 'cm-hybrid-h2',
  3: 'cm-hybrid-h3',
  4: 'cm-hybrid-h4',
  5: 'cm-hybrid-h5',
  6: 'cm-hybrid-h6',
}

/** Parse heading level from ATXHeading node name (e.g., "ATXHeading3" → 3) */
function headingLevel(name: string): number {
  const match = name.match(/ATXHeading(\d)/)
  return match ? parseInt(match[1], 10) : 0
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildHeadingMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // ── Heading mark hiding ──────────────────────────────────
        if (node.name === 'HeaderMark') {
          const line = doc.lineAt(node.from)
          const lineFrom = line.from
          const lineTo = line.to

          // Use centralized shouldShowSourceForLine
          if (shouldShowSourceForLine(state, lineFrom, lineTo)) return

          // Also hide the space after the # marks
          let markEnd = node.to
          if (markEnd < lineTo && doc.sliceString(markEnd, markEnd + 1) === ' ') {
            markEnd++
          }

          ranges.push(hiddenMark.range(node.from, markEnd))
        }

        // ── Heading size styling ─────────────────────────────────
        if (node.name.startsWith('ATXHeading')) {
          const level = headingLevel(node.name)
          if (level > 0 && HEADING_CLASSES[level]) {
            const line = doc.lineAt(node.from)
            ranges.push(
              Decoration.line({
                class: HEADING_CLASSES[level],
              }).range(line.from)
            )
          }
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const headingMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHeadingMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildHeadingMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
