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
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { tagMark, hiddenMark, isCursorInRange, TAG_RE } from './shared'

function buildTagDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    TAG_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const tagContent = match[1]
      // The # is at match.index + length of the preceding context
      // match[0] includes the preceding char, match[1] is just the tag name
      const precedingLen = match[0].length - 1 - tagContent.length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + tagContent.length // includes the #

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
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildTagDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
