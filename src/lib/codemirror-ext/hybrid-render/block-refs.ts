/**
 * Block references decoration plugin — Enhanced Edition.
 *
 * Handles Obsidian-style block references: ^block-id at the end of a line.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSourceForLine()` for consistent cursor-awareness.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  blockRefMark,
  fadedMark,
  BLOCK_REF_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

function buildBlockRefDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state

  // Try tree-based scanning first
  const tree = syntaxTree(state)
  let usedTree = false

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'BlockRef') {
          usedTree = true
          const start = node.from
          const end = node.to

          const line = state.doc.lineAt(start)

          if (shouldShowSourceForLine(state, line.from, line.to)) return

          let markFrom = start
          let markTo = start + 1
          let idFrom = start + 1
          let idTo = end

          node.node.cursor().iterate((child) => {
            if (child.name === 'BlockRefMark') {
              markFrom = child.from
              markTo = child.to
            }
            if (child.name === 'BlockRefId') {
              idFrom = child.from
              idTo = child.to
            }
            return false
          })

          ranges.push(fadedMark.range(markFrom, markTo))
          ranges.push(blockRefMark.range(idFrom, idTo))
        }
      },
    })
  }

  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
  const doc = state.doc
  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    BLOCK_REF_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = BLOCK_REF_RE.exec(visibleText)) !== null) {
      const blockId = match[1]
      const leadingLen = match[0].length - 1 - blockId.length
      const caretPos = from + match.index + leadingLen
      const idEnd = caretPos + 1 + blockId.length

      if (isInRangeList(caretPos, idEnd, skipRanges)) continue

      const line = doc.lineAt(caretPos)
      if (shouldShowSourceForLine(state, line.from, line.to)) continue

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
