/**
 * Comments decoration plugin.
 *
 * Handles Obsidian-style inline comments: %%comment text%%
 *
 * In Live Preview, comments are fully hidden (replaced with nothing) when the
 * cursor is not inside them. When the cursor enters the comment range, the raw
 * syntax is shown so the user can edit it.
 *
 * Optionally shows a subtle indicator dot at the comment position so the user
 * knows something is there (matching Obsidian's behavior).
 *
 * Uses regex scanning since the lezer parser doesn't understand %%...%% syntax.
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
import {
  activeMark,
  isCursorInRange,
  COMMENT_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Comment Indicator ────────────────────────────────────────────────

/**
 * A tiny dot widget shown at the position of a hidden comment,
 * so the user knows something is there without seeing the full text.
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

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildCommentDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    COMMENT_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = COMMENT_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      // Skip if inside code block or inline code
      if (isInRangeList(start, end, skipRanges)) continue

      if (isCursorInRange(state, start, end)) {
        // Cursor inside — show raw syntax with active highlighting
        ranges.push(activeMark.range(start, end))
        continue
      }

      // Hide the entire %%...%% and show a subtle indicator dot
      ranges.push(
        Decoration.replace({
          widget: new CommentIndicatorWidget(),
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
    // Provide atomic ranges so cursor jumps over hidden comments
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
