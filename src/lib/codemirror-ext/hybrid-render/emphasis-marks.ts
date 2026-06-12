/**
 * Emphasis marks decoration plugin — Enhanced Edition.
 *
 * Hides the `*`, `**`, `_`, `__` delimiters around bold and italic text
 * when the cursor is not inside the emphasized range. Also handles ~~
 * strikethrough delimiters.
 *
 * ## Enhancements over v1
 *
 * 1. **Mid-typing emphasis supplement** — While typing inside `**...**`,
 *    CommonMark's flanking rules mean a trailing space breaks the Lezer parse
 *    → `StrongEmphasis` disappears → bold styling flickers. This version
 *    supplements with its own delimiter matching on the active line, matching
 *    the pattern from Atomic Editor's `supplementMidTypingEmphasis()`.
 *
 * 2. **Centralized cursor-awareness** — Uses `shouldShowSource()` instead of
 *    `isCursorInRange()` for consistent behavior with drag-suppression and
 *    focus awareness.
 *
 * 3. **Two-pass batch collection** — First pass collects parent ranges,
 *    second pass applies decorations. This reduces tree traversals from
 *    O(n*m) to O(n+m). (From v1, retained.)
 *
 * 4. **Nested emphasis support** — When cursor is inside nested emphasis
 *    (e.g., **bold *italic* bold**), ALL parent emphasis ranges are checked.
 *    If any parent is active, the child marks are shown.
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
import { emphasisMarkHidden, strikethroughMarkHidden } from './shared'
import { shouldShowSource, getActiveLines } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Shared Emphasis Decorations ─────────────────────────────────────────────

/** Singleton hidden marks — reused across all emphasis mark decorations */
const EMPHASIS_HIDDEN = emphasisMarkHidden
const STRIKETHROUGH_HIDDEN = strikethroughMarkHidden

/** Active emphasis mark — shows delimiters with subtle styling */
const EMPHASIS_ACTIVE = Decoration.mark({
  class: 'cm-hybrid-emphasis-active',
})

const STRIKETHROUGH_ACTIVE = Decoration.mark({
  class: 'cm-hybrid-strikethrough-active',
})

/** Names of emphasis parent nodes */
const EMPHASIS_PARENT_NAMES = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough'])

// ─── Mid-Typing Emphasis Supplement ─────────────────────────────────────────

/**
 * Delimiter definitions for mid-typing emphasis supplement.
 * Ordered by length (longest first) to match greedily.
 *
 * This pattern is from Atomic Editor's `MID_TYPING_DELIMITERS` array.
 */
const MID_TYPING_DELIMITERS = [
  { delim: '**', contentCls: 'cm-hybrid-strong', delimCls: 'cm-hybrid-emphasis-active' },
  { delim: '__', contentCls: 'cm-hybrid-strong', delimCls: 'cm-hybrid-emphasis-active' },
  { delim: '~~', contentCls: 'cm-hybrid-strike', delimCls: 'cm-hybrid-strikethrough-active' },
  { delim: '*', contentCls: 'cm-hybrid-em', delimCls: 'cm-hybrid-emphasis-active' },
  { delim: '_', contentCls: 'cm-hybrid-em', delimCls: 'cm-hybrid-emphasis-active' },
]

/**
 * Supplement mid-typing emphasis on the active line.
 *
 * When the user is typing inside `**bold**`, CommonMark's flanking rules
 * mean that certain cursor positions cause Lezer to not recognize the
 * StrongEmphasis node (e.g., `**bold |**` has a trailing space before the
 * closing delimiter, which breaks the "right-flanking" rule). This causes
 * the bold styling to flicker on and off during typing.
 *
 * This function scans the active line for unmatched delimiter pairs and
 * adds temporary styling that persists during typing. When Lezer eventually
 * recognizes the node, the tree-based decorations take over.
 *
 * Pattern from Atomic Editor's `supplementMidTypingEmphasis()`.
 */
function supplementMidTypingEmphasis(
  view: EditorView,
  ranges: Range<Decoration>[],
): void {
  const state = view.state
  const activeLines = getActiveLines(state)
  if (activeLines.size === 0) return

  const doc = state.doc
  const processed = new Set<number>() // Track lines we've already supplemented

  for (const lineNum of activeLines) {
    if (processed.has(lineNum)) continue
    processed.add(lineNum)

    const line = doc.line(lineNum)
    const text = line.text
    const lineFrom = line.from

    // Track consumed positions to avoid double-matching
    const consumed = new Uint8Array(text.length)

    for (const { delim, contentCls, delimCls } of MID_TYPING_DELIMITERS) {
      const dLen = delim.length

      // Find matching pairs
      let i = 0
      while (i <= text.length - dLen * 2) {
        // Skip consumed positions
        if (consumed[i]) { i++; continue }

        // Look for opening delimiter
        if (text.slice(i, i + dLen) === delim) {
          // For underscore emphasis, check intra-word guard
          if (delim === '_' && i > 0 && /\w/.test(text[i - 1])) {
            i++
            continue
          }

          // Search for closing delimiter (non-greedy)
          let j = i + dLen
          let foundClose = -1
          while (j <= text.length - dLen) {
            if (text.slice(j, j + dLen) === delim) {
              // For underscore emphasis, check intra-word guard
              if (delim === '_' && j + dLen < text.length && /\w/.test(text[j + dLen])) {
                j++
                continue
              }
              foundClose = j
              break
            }
            j++
          }

          if (foundClose >= 0) {
            // Mark positions as consumed
            for (let k = i; k < i + dLen; k++) consumed[k] = 1
            for (let k = foundClose; k < foundClose + dLen; k++) consumed[k] = 1

            // Only add if cursor is NOT inside this range
            // (if cursor is inside, we want to show raw syntax)
            const rangeFrom = lineFrom + i
            const rangeTo = lineFrom + foundClose + dLen
            if (!shouldShowSource(state, rangeFrom, rangeTo)) {
              // Style the opening delimiter as hidden
              ranges.push(EMPHASIS_HIDDEN.range(lineFrom + i, lineFrom + i + dLen))

              // Style the content
              ranges.push(
                Decoration.mark({ class: contentCls }).range(
                  lineFrom + i + dLen,
                  lineFrom + foundClose
                )
              )

              // Style the closing delimiter as hidden
              ranges.push(EMPHASIS_HIDDEN.range(lineFrom + foundClose, lineFrom + foundClose + dLen))
            } else {
              // Cursor is inside — show active delimiters
              ranges.push(EMPHASIS_ACTIVE.range(lineFrom + i, lineFrom + i + dLen))
              ranges.push(EMPHASIS_ACTIVE.range(lineFrom + foundClose, lineFrom + foundClose + dLen))
            }

            i = foundClose + dLen
          } else {
            i++
          }
        } else {
          i++
        }
      }
    }
  }
}

// ─── Build Decorations ──────────────────────────────────────────────────────

function buildEmphasisMarkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state

  for (const { from, to } of view.visibleRanges) {
    // ── Pass 1: Collect parent ranges ────────────────────────────────────
    const parentRanges: Array<{ from: number; to: number }> = []
    const markNodes: Array<{ from: number; to: number; isStrike: boolean }> = []

    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (EMPHASIS_PARENT_NAMES.has(node.name)) {
          parentRanges.push({ from: node.from, to: node.to })
        }
        if (node.name === 'EmphasisMark') {
          markNodes.push({ from: node.from, to: node.to, isStrike: false })
        }
        if (node.name === 'StrikethroughMark') {
          markNodes.push({ from: node.from, to: node.to, isStrike: true })
        }
      },
    })

    // ── Pass 2: Apply decorations to mark nodes ──────────────────────────
    for (const mark of markNodes) {
      // Find the parent that contains this mark
      const parent = parentRanges.find(
        (p) => p.from <= mark.from && p.to >= mark.to
      )

      // Use centralized shouldShowSource for cursor-awareness
      if (parent && shouldShowSource(state, parent.from, parent.to)) {
        // Cursor is inside — show delimiters with active styling
        ranges.push(
          (mark.isStrike ? STRIKETHROUGH_ACTIVE : EMPHASIS_ACTIVE).range(mark.from, mark.to)
        )
        continue
      }

      // Cursor is outside — hide the delimiter
      ranges.push(
        (mark.isStrike ? STRIKETHROUGH_HIDDEN : EMPHASIS_HIDDEN).range(mark.from, mark.to)
      )
    }
  }

  // ── Supplement mid-typing emphasis on active lines ─────────────────────
  // This catches emphasis that Lezer hasn't recognized yet due to
  // CommonMark flanking rules being broken mid-typing.
  supplementMidTypingEmphasis(view, ranges)

  return Decoration.set(ranges, true)
}

export const emphasisMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildEmphasisMarkDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildEmphasisMarkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
