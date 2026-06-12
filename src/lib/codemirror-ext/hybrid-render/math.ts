/**
 * Math decoration plugin — dual architecture.
 *
 * Handles inline ($...$) and display ($$...$$) math with KaTeX rendering.
 *
 * ## Architecture
 *
 * - **Inline math** uses a ViewPlugin with `Decoration.mark()` to hide `$`
 *   delimiters and style the content. This is fine as a ViewPlugin because
 *   it doesn't change the block structure.
 *
 * - **Display math** uses a StateField with `Decoration.replace({ block: true })`.
 *   Display math can span multiple lines and introduces block-level widgets,
 *   so it MUST be provided via StateField for correct viewport computation.
 *
 * ## KaTeX Loading
 *
 * KaTeX is lazy-loaded on first use. The first render shows styled raw LaTeX,
 * then triggers an async import. On the next rebuild, the cached module is
 * available and KaTeX renders the pretty output.
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
  activeMark,
  mathMark,
  isCursorInRange,
  INLINE_MATH_RE,
  DISPLAY_MATH_RE,
} from './shared'
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
    katexLoadPromise = null // Allow retry
    return null
  })

  return katexLoadPromise
}

// ─── Widget: Math Preview (for display math) ──────────────────────────────────

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

    // Try synchronous KaTeX rendering
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

    // KaTeX not loaded yet or failed — show styled raw LaTeX
    container.textContent = this.latex
    container.classList.add('cm-hybrid-math-raw')

    // Trigger async KaTeX load so next render will be pretty
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

  // Display math can appear anywhere in the document
  DISPLAY_MATH_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = DISPLAY_MATH_RE.exec(doc.toString())) !== null) {
    const start = match.index
    const end = start + match[0].length
    const latex = match[1]

    if (isCursorInRange(state, start, end)) {
      ranges.push(activeMark.range(start, end))
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

/**
 * StateField for display math ($$...$$) rendering.
 *
 * Uses block-level replace decorations, so must be a StateField.
 */
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

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      // Hide the $ delimiters, style the content
      ranges.push(hiddenMark.range(start, start + 1))
      ranges.push(mathMark.range(start + 1, end - 1))
      ranges.push(hiddenMark.range(end - 1, end))
    }
  }

  return Decoration.set(ranges, true)
}

/**
 * ViewPlugin for inline math ($...$) rendering.
 *
 * Uses mark decorations only, so ViewPlugin is fine.
 */
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
      // If KaTeX was loaded after initial render, force a re-render
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

/**
 * Combined math plugin array — for backward compatibility and simpler registration.
 * Returns both the display math StateField and the inline math ViewPlugin.
 */
export const mathPlugin: import('@codemirror/state').Extension[] = [
  displayMathField,
  inlineMathPlugin,
]
