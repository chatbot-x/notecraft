/**
 * Atomic ranges for hybrid rendering — Enhanced Edition.
 *
 * This is a FALLBACK atomic ranges extension. Most decoration plugins now
 * provide their own atomic ranges via the `provide` pattern on their
 * ViewPlugin definition.
 *
 * This extension handles any remaining decoration types that need atomic
 * ranges but don't self-provide.
 *
 * ## Enhancement
 *
 * Uses `shouldShowSource()` for consistent cursor-awareness.
 * Reduced scope — most plugins now self-provide, so this only handles
 * the few remaining cases.
 */

import { EditorView, Decoration } from '@codemirror/view'
import { RangeSetBuilder, RangeValue } from '@codemirror/state'
import {
  EMBED_IMAGE_RE,
  TAG_RE,
} from './shared'
import { shouldShowSource } from './cursor-awareness'

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
    let match: RegExpExecArray | null
    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (!shouldShowSource(state, start, end)) {
        ranges.push({ from: start, to: end })
      }
    }

    // ── Tags #tag ────────────────────────────────────────────
    TAG_RE.lastIndex = 0
    while ((match = TAG_RE.exec(visibleText)) !== null) {
      const precedingLen = match[0].length - 1 - match[1].length
      const hashPos = from + match.index + precedingLen
      const tagEnd = hashPos + 1 + match[1].length
      if (!shouldShowSource(state, hashPos, tagEnd)) {
        ranges.push({ from: hashPos, to: tagEnd })
      }
    }
  }

  return ranges
}

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
