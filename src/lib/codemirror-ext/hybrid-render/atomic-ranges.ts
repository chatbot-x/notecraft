/**
 * Atomic ranges for hybrid rendering.
 *
 * Registers decorated ranges (wikilinks, tags, images, etc.) as atomic ranges
 * so the cursor treats them as single units — jumping over them instead of
 * entering the middle of the decorated content.
 *
 * This is a key part of the Obsidian Live Preview feel: you can click on a
 * wikilink to navigate, but the cursor won't land inside the [[...]] syntax.
 *
 * When the cursor does enter a range (e.g., via arrow keys), the decoration
 * is suppressed by the cursor-awareness check, and the raw syntax is shown.
 */

import { EditorView } from '@codemirror/view'
import { RangeSetBuilder, RangeValue } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  WIKILINK_RE,
  EMBED_IMAGE_RE,
  TAG_RE,
  isCursorInRange,
} from './shared'

// Minimal RangeValue implementation for atomic ranges
class AtomicValue extends RangeValue {
  static readonly instance = new AtomicValue()
}

interface AtomicRange {
  from: number
  to: number
}

// ─── Build Atomic Ranges ──────────────────────────────────────────────────────

function buildAtomicRanges(view: EditorView): AtomicRange[] {
  const ranges: AtomicRange[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    // ── Wikilinks [[...]] ────────────────────────────────────────
    const visibleText = doc.sliceString(from, to)

    WIKILINK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKILINK_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (!isCursorInRange(state, start, end)) {
        ranges.push({ from: start, to: end })
      }
    }

    // ── Embed images ![[...]] ────────────────────────────────────
    EMBED_IMAGE_RE.lastIndex = 0
    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (!isCursorInRange(state, start, end)) {
        ranges.push({ from: start, to: end })
      }
    }

    // ── Tags #tag ────────────────────────────────────────────────
    TAG_RE.lastIndex = 0
    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const precedingLen = match[0].length - 1 - match[1].length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + match[1].length
      if (!isCursorInRange(state, hashPos, tagEnd)) {
        ranges.push({ from: hashPos, to: tagEnd })
      }
    }

    // ── Standard images ![alt](url) ──────────────────────────────
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Image') {
          if (!isCursorInRange(state, node.from, node.to)) {
            ranges.push({ from: node.from, to: node.to })
          }
        }
      },
    })
  }

  return ranges
}

/**
 * The atomic ranges extension. This is provided as an `EditorView.atomicRanges`
 * facet so that CM6's cursor movement code treats the decorated ranges as
 * atomic units.
 */
export const atomicRangesExt = EditorView.atomicRanges.of((view) => {
  const ranges = buildAtomicRanges(view)
  if (ranges.length === 0) {
    return new RangeSetBuilder<AtomicValue>().finish()
  }

  // Sort by from position
  ranges.sort((a, b) => a.from - b.from)

  const builder = new RangeSetBuilder<AtomicValue>()
  for (const r of ranges) {
    builder.add(r.from, r.to, AtomicValue.instance)
  }
  return builder.finish()
})
