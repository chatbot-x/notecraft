/**
 * Tags decoration plugin — Enhanced Edition.
 *
 * Renders Obsidian-style inline tags (#tag, #nested/tag) as styled badges.
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
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  tagMark,
  TAG_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

function buildTagDecorations(view: EditorView): DecorationSet {
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
        if (node.name === 'Tag') {
          usedTree = true
          const start = node.from
          const end = node.to

          if (shouldShowSource(state, start, end)) return

          ranges.push(tagMark.range(start, end))
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

    TAG_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const tagContent = match[1]
      const precedingLen = match[0].length - 1 - tagContent.length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + tagContent.length

      if (isInRangeList(hashPos, tagEnd, skipRanges)) continue

      const line = doc.lineAt(hashPos)
      if (hashPos === line.from && doc.sliceString(hashPos + 1, hashPos + 2) === ' ') {
        continue
      }

      if (shouldShowSource(state, hashPos, tagEnd)) continue

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
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
