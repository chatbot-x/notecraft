/**
 * Footnotes decoration plugin — Enhanced Edition.
 *
 * Renders markdown footnotes with visual enhancements.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSource()` and `shouldShowSourceForLine()` for consistent
 * cursor-awareness.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { collectSkipRanges, isInRangeList } from './shared'
import { shouldShowSource, shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const FOOTNOTE_REF_RE = /\[\^([a-zA-Z0-9_-]+)\]/g
const FOOTNOTE_DEF_RE = /^\[\^([a-zA-Z0-9_-]+)\]:\s*/gm
const INLINE_FOOTNOTE_RE = /\^\[([^\]]+)\]/g

// ─── Widget: Footnote Definition Indicator ───────────────────────────────────

class FootnoteDefWidget extends WidgetType {
  constructor(readonly id: string) { super() }

  eq(other: FootnoteDefWidget) {
    return this.id === other.id
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = 'cm-hybrid-footnote-def'
    container.textContent = this.id
    return container
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Build Decorations ───────────────────────────────────────────────────────

function buildFootnoteDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  // Try tree-based scanning first
  const tree = syntaxTree(state)
  let usedTree = false

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Footnote' || node.name === 'FootnoteRef') {
          usedTree = true
          if (shouldShowSource(state, node.from, node.to)) return

          ranges.push(
            Decoration.mark({
              class: 'cm-hybrid-footnote-ref',
            }).range(node.from, node.to)
          )
        }

        if (node.name === 'FootnoteDef' || node.name === 'FootnoteDefinition') {
          usedTree = true
          const line = doc.lineAt(node.from)
          if (shouldShowSourceForLine(state, line.from, line.to)) return

          ranges.push(
            Decoration.line({
              class: 'cm-hybrid-footnote-def-line',
            }).range(line.from)
          )
        }
      },
    })
  }

  if (usedTree && ranges.length > 0) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    // Footnote references: [^1]
    FOOTNOTE_REF_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = FOOTNOTE_REF_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue
      if (shouldShowSource(state, start, end)) continue

      ranges.push(
        Decoration.mark({
          class: 'cm-hybrid-footnote-ref',
        }).range(start, end)
      )
    }

    // Inline footnotes: ^[text]
    INLINE_FOOTNOTE_RE.lastIndex = 0
    while ((match = INLINE_FOOTNOTE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue
      if (shouldShowSource(state, start, end)) continue

      ranges.push(
        Decoration.mark({
          class: 'cm-hybrid-footnote-inline-bracket',
        }).range(start, start + 2)
      )
      ranges.push(
        Decoration.mark({
          class: 'cm-hybrid-footnote-inline-bracket',
        }).range(end - 1, end)
      )
      ranges.push(
        Decoration.mark({
          class: 'cm-hybrid-footnote-inline-content',
        }).range(start + 2, end - 1)
      )
    }

    // Footnote definitions: [^1]: text
    FOOTNOTE_DEF_RE.lastIndex = 0
    while ((match = FOOTNOTE_DEF_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const line = doc.lineAt(start)

      if (shouldShowSourceForLine(state, line.from, line.to)) continue

      ranges.push(
        Decoration.line({
          class: 'cm-hybrid-footnote-def-line',
        }).range(line.from)
      )

      const defPrefixEnd = start + match[0].length
      ranges.push(
        Decoration.mark({
          class: 'cm-hybrid-footnote-def-prefix',
        }).range(start, defPrefixEnd)
      )
    }
  }

  return Decoration.set(ranges, true)
}

export const footnotesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildFootnoteDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildFootnoteDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
