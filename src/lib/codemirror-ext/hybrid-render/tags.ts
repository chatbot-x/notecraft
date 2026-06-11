/**
 * Tags decoration plugin.
 *
 * Renders Obsidian-style inline tags (#tag, #nested/tag) as styled badges
 * in the editor, matching the visual appearance of the read-mode tag rendering.
 * Tags must start with a letter or underscore after #, and can contain
 * letters, digits, underscores, hyphens, and forward slashes.
 *
 * Provides atomic ranges so the cursor treats tags as single units.
 *
 * ## Level 2: Tree-based scanning
 *
 * With the Lezer Tag extension active, the syntax tree contains `Tag`,
 * `TagMark`, and `TagName` nodes. This plugin now scans the tree instead
 * of using regex, which:
 * - Eliminates the #tag vs #heading disambiguation problem
 * - Removes the need for skip-range checks (code blocks are not in the tree)
 * - Provides incremental parsing benefits
 *
 * Falls back to regex scanning if the tree doesn't contain Tag nodes.
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
  isCursorInRange,
  TAG_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Build Decorations (Tree-based) ──────────────────────────────────────────

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

          // Skip if cursor is inside the tag
          if (isCursorInRange(state, start, end)) return

          // Style the entire #tag as a badge
          ranges.push(tagMark.range(start, end))
        }
      },
    })
  }

  // If tree had Tag nodes, we're done
  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning (if Lezer extension not loaded) ─────────────
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

      if (isCursorInRange(state, hashPos, tagEnd)) continue

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
