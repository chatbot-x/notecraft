/**
 * Atomic ranges for hybrid rendering.
 *
 * This is a FALLBACK atomic ranges extension. Most decoration plugins now
 * provide their own atomic ranges via the `provide` pattern on their
 * ViewPlugin definition (e.g., wikilinksPlugin, tagsPlugin, linksPlugin).
 *
 * This extension handles any remaining decoration types that need atomic
 * ranges but don't self-provide (e.g., embed transclusions from the
 * embed-transclusions plugin).
 *
 * Atomic ranges make decorated ranges cursor-proof: the cursor treats them
 * as single units, jumping over them instead of entering the middle of the
 * decorated content. When the cursor does enter a range (via arrow keys),
 * the decoration is suppressed by the cursor-awareness check.
 */

import { EditorView, Decoration } from '@codemirror/view'
import { RangeSetBuilder, RangeValue } from '@codemirror/state'
import {
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
    const visibleText = doc.sliceString(from, to)

    // ── Embed images ![[...]] ────────────────────────────────
    EMBED_IMAGE_RE.lastIndex = 0
    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (!isCursorInRange(state, start, end)) {
        ranges.push({ from: start, to: end })
      }
    }

    // ── Tags #tag ────────────────────────────────────────────
    TAG_RE.lastIndex = 0
    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const precedingLen = match[0].length - 1 - match[1].length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + match[1].length
      if (!isCursorInRange(state, hashPos, tagEnd)) {
        ranges.push({ from: hashPos, to: tagEnd })
      }
    }
  }

  return ranges
}

/**
 * The atomic ranges extension.
 *
 * Note: The tags, links, and embedImages plugins now self-provide atomic ranges
 * via the `provide` pattern. This extension serves as a safety net for any
 * ranges that might be missed (e.g., if the plugin-provided ranges don't
 * cover all cases).
 */
export const atomicRangesExt = EditorView.atomicRanges.of((view) => {
  const ranges = buildAtomicRanges(view)
  if (ranges.length === 0) {
    return new RangeSetBuilder<AtomicValue>().finish()
  }

  ranges.sort((a, b) => a.from - b.from)

  const builder = new RangeSetBuilder<AtomicValue>()
  for (const r of ranges) {
    builder.add(r.from, r.to, AtomicValue.instance)
  }
  return builder.finish()
})
