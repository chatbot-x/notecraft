/**
 * Admonitions decoration plugin — Enhanced Edition.
 *
 * Handles code-block-style admonitions (~~~ad-note, ```ad-warning).
 *
 * ## Enhancement
 *
 * Uses `shouldShowSource()` for consistent cursor-awareness.
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
import { hiddenMark, CALLOUT_TYPES, TYPE_ALIASES } from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

function buildAdmonitionDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return

        let codeInfoFrom = -1
        let codeInfoTo = -1
        let adType = ''

        const cursor = node.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'CodeInfo') {
              const info = doc.sliceString(cursor.from, cursor.to).trim()
              if (info.startsWith('ad-')) {
                adType = info.slice(3).toLowerCase()
                codeInfoFrom = cursor.from
                codeInfoTo = cursor.to
              }
            }
          } while (cursor.nextSibling())
        }

        if (!adType) return

        const resolvedType = TYPE_ALIASES[adType] ?? adType
        const typeInfo = CALLOUT_TYPES[resolvedType] ?? CALLOUT_TYPES.note

        const blockFrom = node.from
        const blockTo = node.to
        const firstLine = doc.lineAt(blockFrom)
        const lastLine = doc.lineAt(blockTo)

        const cursorInBlock = shouldShowSource(state, blockFrom, blockTo)

        // Line decorations for all lines
        for (let pos = firstLine.from; pos <= lastLine.from; ) {
          const line = doc.lineAt(pos)
          ranges.push(
            Decoration.line({
              class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType} cm-hybrid-admonition`,
              attributes: { 'data-callout': resolvedType, 'data-admonition': '' },
            }).range(line.from)
          )
          pos = line.to + 1
        }

        if (cursorInBlock) return

        // Hide opening fence and type info
        const firstLineText = doc.sliceString(firstLine.from, firstLine.to)
        const fenceMatch = firstLineText.match(/^(~~~+|```+)/)
        if (fenceMatch) {
          ranges.push(hiddenMark.range(firstLine.from, firstLine.from + fenceMatch[0].length))

          ranges.push(
            Decoration.mark({
              class: `cm-hybrid-callout-marker cm-hybrid-callout-marker-${resolvedType}`,
              attributes: { 'data-callout-type': resolvedType },
            }).range(codeInfoFrom, codeInfoTo)
          )
        }

        // Hide closing fence
        const lastLineText = doc.sliceString(lastLine.from, lastLine.to)
        const closingFenceMatch = lastLineText.match(/^(~~~+|```+)/)
        if (closingFenceMatch) {
          ranges.push(hiddenMark.range(lastLine.from, lastLine.from + closingFenceMatch[0].length))
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const admonitionsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildAdmonitionDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildAdmonitionDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
