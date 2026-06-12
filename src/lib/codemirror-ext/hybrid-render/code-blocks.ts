/**
 * Code blocks decoration plugin.
 *
 * Applies line decorations to fenced code blocks:
 * - Adds a subtle background to all code block lines
 * - Adds a language badge at the top of the code block
 * - Hides the fence markers (```) when cursor is outside the code block
 *
 * Uses the lezer syntax tree to find FencedCode nodes.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { hiddenMark, isCursorInRange } from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Language Badge ───────────────────────────────────────────────────

class LangBadgeWidget extends WidgetType {
  constructor(readonly lang: string) { super() }

  eq(other: LangBadgeWidget) {
    return this.lang === other.lang
  }

  toDOM(): HTMLElement {
    const badge = document.createElement('span')
    badge.className = 'cm-hybrid-code-lang-badge'
    badge.textContent = this.lang
    return badge
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildCodeBlockDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return

        const blockFrom = node.from
        const blockTo = node.to
        const firstLine = doc.lineAt(blockFrom)
        const lastLine = doc.lineAt(blockTo)

        // Find the language info (CodeInfo child node)
        let langInfo = ''

        const cursor = node.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'CodeInfo') {
              langInfo = doc.sliceString(cursor.from, cursor.to).trim()
            }
          } while (cursor.nextSibling())
        }

        // Check if cursor is anywhere inside the code block
        const cursorInBlock = isCursorInRange(state, blockFrom, blockTo)

        // ── Line decorations for all lines in the code block ────
        for (let pos = firstLine.from; pos <= lastLine.from; ) {
          const line = doc.lineAt(pos)
          ranges.push(
            Decoration.line({
              class: 'cm-hybrid-code-block-line',
            }).range(line.from)
          )
          pos = line.to + 1
        }

        // ── Hide fence markers when cursor is outside ───────────
        if (!cursorInBlock) {
          const firstLineText = doc.sliceString(firstLine.from, firstLine.to)
          const fenceMatch = firstLineText.match(/^(~~~+|```+)/)
          if (fenceMatch) {
            const fenceEnd = firstLine.from + fenceMatch[0].length
            ranges.push(hiddenMark.range(firstLine.from, fenceEnd))

            if (langInfo) {
              ranges.push(
                Decoration.widget({
                  widget: new LangBadgeWidget(langInfo),
                  side: 1,
                }).range(firstLine.from)
              )
            }
          }

          const lastLineText = doc.sliceString(lastLine.from, lastLine.to)
          const closingFenceMatch = lastLineText.match(/^(~~~+|```+)/)
          if (closingFenceMatch) {
            ranges.push(hiddenMark.range(lastLine.from, lastLine.from + closingFenceMatch[0].length))
          }
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const codeBlocksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCodeBlockDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildCodeBlockDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
