/**
 * Math decoration plugin.
 *
 * Handles inline ($...$) and display ($$...$$) math with KaTeX rendering.
 *
 * Key improvement over the previous implementation:
 * - Uses katex.renderToString() synchronously in toDOM() instead of the
 *   fragile setTimeout + DOM-patching approach
 * - Falls back to styled raw LaTeX if KaTeX fails to load
 * - Lazy-loads KaTeX on first use, then caches the module
 *
 * For display math: Decoration.replace with MathPreviewWidget
 * For inline math: Decoration.mark to hide $ delimiters, style content
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
  hiddenMark,
  activeMark,
  mathMark,
  isCursorInRange,
  INLINE_MATH_RE,
  DISPLAY_MATH_RE,
} from './shared'

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

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildMathDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    // ── Display math $$...$$ ────────────────────────────────────
    DISPLAY_MATH_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = DISPLAY_MATH_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const latex = match[1]

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      ranges.push(
        Decoration.replace({
          widget: new MathPreviewWidget(latex, true),
        }).range(start, end)
      )
    }

    // ── Inline math $...$ ───────────────────────────────────────
    INLINE_MATH_RE.lastIndex = 0

    while ((match = INLINE_MATH_RE.exec(visibleText)) !== null) {
      // The regex includes the preceding non-$ char, so we need to adjust
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

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    private katexLoaded = false

    constructor(view: EditorView) {
      this.decorations = buildMathDecorations(view)
      // Trigger KaTeX load on first render
      this.ensureKaTeX()
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildMathDecorations(update.view)
        // If KaTeX was loaded after initial render, force a re-render
        // so math widgets get the pretty rendering
        if (!this.katexLoaded && katexModule) {
          this.katexLoaded = true
          this.decorations = buildMathDecorations(update.view)
        }
      }
    }

    private async ensureKaTeX() {
      const katex = await getKaTeX()
      if (katex && !this.katexLoaded) {
        this.katexLoaded = true
        // Force re-render with KaTeX available
        // We can't directly access the view here, but the next update will
        // use the cached katexModule
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
