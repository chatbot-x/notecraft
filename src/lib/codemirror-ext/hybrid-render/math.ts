/**
 * Math decoration plugin — Enhanced Edition.
 *
 * Handles inline ($...$) and display ($$...$$) math with KaTeX rendering.
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
import { StateField, type Range, type Transaction } from '@codemirror/state'
import {
  hiddenMark,
  mathMark,
  INLINE_MATH_RE,
  DISPLAY_MATH_RE,
} from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction, dragSelectingField } from './drag-state'

// ─── KaTeX Module Cache ───────────────────────────────────────────────────────

let katexModule: any = null
let katexLoadPromise: Promise<any> | null = null

async function getKaTeX(): Promise<any> {
  if (katexModule) return katexModule
  if (katexLoadPromise) return katexLoadPromise

  katexLoadPromise = import('katex').then((mod) => {
    katexModule = mod.default
    return katexModule
  }).catch(() => {
    katexLoadPromise = null
    return null
  })

  return katexLoadPromise
}

// ─── Widget: Math Preview ─────────────────────────────────────────────────────

class MathPreviewWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly displayMode: boolean,
  ) { super() }

  eq(other: MathPreviewWidget) {
    return this.latex === other.latex && this.displayMode === other.displayMode
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = this.displayMode
      ? 'cm-hybrid-math-display'
      : 'cm-hybrid-math-inline'

    if (katexModule) {
      try {
        container.innerHTML = katexModule.renderToString(this.latex, {
          throwOnError: false,
          displayMode: this.displayMode,
        })
        return container
      } catch {
        // Fall through to raw LaTeX display
      }
    }

    container.textContent = this.latex
    container.classList.add('cm-hybrid-math-raw')

    getKaTeX()

    return container
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Display Math: StateField ─────────────────────────────────────────────────

function buildDisplayMathDecorations(state: import('@codemirror/state').EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = state.doc

  DISPLAY_MATH_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = DISPLAY_MATH_RE.exec(doc.toString())) !== null) {
    const start = match.index
    const end = start + match[0].length
    const latex = match[1]

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
        widget: new MathPreviewWidget(latex, true),
        block: true,
      }).range(start, end)
    )
  }

  return Decoration.set(ranges, true)
}

function checkFieldAction(tr: Transaction): 'rebuild' | 'skip' | 'none' {
  if (tr.docChanged) return 'rebuild'

  const isDragging = tr.state.field(dragSelectingField, false)
  const wasDragging = tr.startState.field(dragSelectingField, false)

  if (isDragging && wasDragging) return 'skip'
  if (wasDragging && !isDragging) return 'rebuild'
  if (isDragging) return 'rebuild'

  if (tr.selection) return 'rebuild'

  return 'none'
}

export const displayMathField = StateField.define<DecorationSet>({
  create(state) {
    return buildDisplayMathDecorations(state)
  },
  update(deco, tr) {
    const action = checkFieldAction(tr)
    if (action === 'rebuild') {
      return buildDisplayMathDecorations(tr.state)
    }
    if (tr.docChanged) {
      return deco.map(tr.changes)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

// ─── Inline Math: ViewPlugin ──────────────────────────────────────────────────

function buildInlineMathDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    INLINE_MATH_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = INLINE_MATH_RE.exec(visibleText)) !== null) {
      const fullMatch = match[0]
      const precedingChar = fullMatch[0] !== '$' ? fullMatch[0] : ''
      const start = from + match.index + precedingChar.length
      const end = start + fullMatch.length - precedingChar.length
      const latex = match[1]

      if (shouldShowSource(state, start, end)) {
        ranges.push(
          Decoration.mark({
            class: 'cm-hybrid-active',
          }).range(start, end)
        )
        continue
      }

      ranges.push(hiddenMark.range(start, start + 1))
      ranges.push(mathMark.range(start + 1, end - 1))
      ranges.push(hiddenMark.range(end - 1, end))
    }
  }

  return Decoration.set(ranges, true)
}

export const inlineMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildInlineMathDecorations(view)
      this.ensureKaTeX()
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildInlineMathDecorations(update.view)
      }
      if (!this.katexLoaded && katexModule) {
        this.katexLoaded = true
        this.decorations = buildInlineMathDecorations(update.view)
      }
    }

    private katexLoaded = false

    private async ensureKaTeX() {
      const katex = await getKaTeX()
      if (katex && !this.katexLoaded) {
        this.katexLoaded = true
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

export const mathPlugin: import('@codemirror/state').Extension[] = [
  displayMathField,
  inlineMathPlugin,
]
