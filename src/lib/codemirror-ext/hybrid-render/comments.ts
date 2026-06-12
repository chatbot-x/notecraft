/**
 * Comments decoration plugin — Enhanced Edition.
 *
 * Handles Obsidian-style inline comments: %%comment text%%
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
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  COMMENT_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Comment Indicator ────────────────────────────────────────────────

/**
 * A tiny dot widget shown at the position of a hidden comment.
 * Singleton pattern — only one instance needed since it's stateless.
 */
class CommentIndicatorWidget extends WidgetType {
  constructor() { super() }

  eq(_other: CommentIndicatorWidget) {
    return true
  }

  toDOM(): HTMLElement {
    const dot = document.createElement('span')
    dot.className = 'cm-hybrid-comment-indicator'
    dot.setAttribute('aria-label', 'Hidden comment')
    dot.textContent = '\u00B7' // Middle dot
    return dot
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Singleton instance — reused across all comment decorations */
const COMMENT_INDICATOR = new CommentIndicatorWidget()

// ─── Build Decorations ───────────────────────────────────────────────────────

function buildCommentDecorations(view: EditorView): DecorationSet {
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
        if (node.name === 'Comment') {
          usedTree = true
          const start = node.from
          const end = node.to

          if (shouldShowSource(state, start, end)) {
            // Cursor inside — show raw syntax with active highlighting
            ranges.push(
              Decoration.mark({
                class: 'cm-hybrid-active',
              }).range(start, end)
            )
          } else {
            // Hide the entire %%...%% and show a subtle indicator dot
            ranges.push(
              Decoration.replace({
                widget: COMMENT_INDICATOR,
              }).range(start, end)
            )
          }
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

    COMMENT_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = COMMENT_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue

      if (shouldShowSource(state, start, end)) {
        ranges.push(
          Decoration.mark({
            class: 'cm-hybrid-active',
          }).range(start, end)
        )
        continue
      }

      ranges.push(
        Decoration.replace({
          widget: COMMENT_INDICATOR,
        }).range(start, end)
      )
    }
  }

  return Decoration.set(ranges, true)
}

export const commentsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCommentDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildCommentDecorations(update.view)
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
