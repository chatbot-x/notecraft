/**
 * Tags decoration plugin.
 *
 * Renders Obsidian-style inline tags (#tag, #nested/tag) as styled badges
 * in the editor, matching the visual appearance of the read-mode tag rendering.
 * Tags must start with a letter or underscore after #, and can contain
 * letters, digits, underscores, hyphens, and forward slashes.
 *
 * Distinguishes from heading # markers by requiring valid preceding context
 * (whitespace, start of string, or certain punctuation).
 *
 * Provides atomic ranges so the cursor treats tags as single units.
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
  tagMark,
  isCursorInRange,
  TAG_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

function buildTagDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    TAG_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const tagContent = match[1]
      const precedingLen = match[0].length - 1 - tagContent.length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + tagContent.length // includes the #

      // Skip if inside code block or inline code
      if (isInRangeList(hashPos, tagEnd, skipRanges)) continue

      // Skip if the # is at the start of a line followed by a space (heading)
      const line = doc.lineAt(hashPos)
      if (hashPos === line.from && doc.sliceString(hashPos + 1, hashPos + 2) === ' ') {
        continue
      }

      // Skip if cursor is inside the tag
      if (isCursorInRange(state, hashPos, tagEnd)) continue

      // Style the entire #tag as a badge
      ranges.push(tagMark.range(hashPos, tagEnd))
    }
  }

  return Decoration.set(ranges, true)
}

export const tagsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTagDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildTagDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Provide atomic ranges so cursor jumps over tags
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
