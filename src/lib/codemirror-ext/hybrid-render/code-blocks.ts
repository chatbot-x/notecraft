/**
 * Code blocks decoration plugin — Enhanced Edition.
 *
 * Applies line decorations to fenced code blocks:
 * - Subtle background for all code block lines
 * - Language badge at the top
 * - Hides fence markers when cursor is outside
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
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { hiddenMark } from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Language Badge (Singleton per language) ─────────────────────────

/**
 * Cache of language badge widgets. Since badges are stateless (just display
 * the language name), we reuse instances. (Pattern from Atomic Editor.)
 */
const badgeCache = new Map<string, LangBadgeWidget>()

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

function getLangBadge(lang: string): LangBadgeWidget {
  let badge = badgeCache.get(lang)
  if (!badge) {
    badge = new LangBadgeWidget(lang)
    badgeCache.set(lang, badge)
    if (badgeCache.size > 100) {
      const firstKey = badgeCache.keys().next().value
      if (firstKey !== undefined) badgeCache.delete(firstKey)
    }
  }
  return badge
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

        let langInfo = ''

        const cursor = node.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'CodeInfo') {
              langInfo = doc.sliceString(cursor.from, cursor.to).trim()
            }
          } while (cursor.nextSibling())
        }

        const cursorInBlock = shouldShowSource(state, blockFrom, blockTo)

        // Line decorations for all lines in the code block
        for (let pos = firstLine.from; pos <= lastLine.from; ) {
          const line = doc.lineAt(pos)
          ranges.push(
            Decoration.line({
              class: 'cm-hybrid-code-block-line',
            }).range(line.from)
          )
          pos = line.to + 1
        }

        // Hide fence markers when cursor is outside
        if (!cursorInBlock) {
          const firstLineText = doc.sliceString(firstLine.from, firstLine.to)
          const fenceMatch = firstLineText.match(/^(~~~+|```+)/)
          if (fenceMatch) {
            const fenceEnd = firstLine.from + fenceMatch[0].length
            ranges.push(hiddenMark.range(firstLine.from, fenceEnd))

            if (langInfo) {
              ranges.push(
                Decoration.widget({
                  widget: getLangBadge(langInfo),
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
