/**
 * Hybrid Markdown Rendering — CodeMirror 6 Decoration Extension
 *
 * Provides Obsidian-style Live Preview by layering decorations on top of
 * the raw Markdown source in the editor. Features:
 *
 * 1. **Interactive checkboxes** — Replace `- [x]` / `- [ ]` with clickable
 *    checkboxes that toggle the underlying Markdown.
 *
 * 2. **Wikilinks** — Style `[[link]]` and `[[target|label]]` with clickable
 *    underlined text. Hide `[[`, `]]`, and the target part of `[[target|label]]`
 *    when the cursor is not inside the link. Show raw syntax when cursor enters.
 *
 * 3. **Image thumbnails** — Replace `![](url)` and `![alt](url)` with inline
 *    thumbnail previews. Click to see full size. Show raw syntax on cursor.
 *
 * 4. **Inline math preview** — Render `$E=mc^2$` with KaTeX inline when cursor
 *    is outside. Show raw syntax when cursor is inside.
 *
 * 5. **Link styling** — Make `[label](url)` links visually distinct with
 *    underlined label, faded URL markers.
 *
 * Architecture:
 * - Uses ViewPlugin (viewport-optimized, best for inline decorations)
 * - Combines lezer syntax tree nodes (for standard MD) and regex scanning
 *   (for custom syntax like wikilinks)
 * - Cursor-aware: shows raw Markdown when cursor is inside a decorated range
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  RangeSetBuilder,
} from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'

// ─── Reusable Decoration Objects ──────────────────────────────────────────────

/** Hide text (font-size: 0) — used for [[, ]], and URL parts of links */
const hiddenMark = Decoration.mark({ class: 'cm-hybrid-hidden' })

/** Active state — show raw syntax with subtle highlight when cursor is inside */
const activeMark = Decoration.mark({ class: 'cm-hybrid-active' })

/** Wikilink label styling */
const wikilinkLabelMark = Decoration.mark({ class: 'cm-hybrid-wikilink-label' })

/** Link label styling */
const linkLabelMark = Decoration.mark({ class: 'cm-hybrid-link-label' })

/** Link URL markers (brackets, parens) — faded */
const linkFadedMark = Decoration.mark({ class: 'cm-hybrid-link-faded' })

/** Math expression styling */
const mathMark = Decoration.mark({ class: 'cm-hybrid-math' })

// ─── Widget: Checkbox ─────────────────────────────────────────────────────────

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super() }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos
  }

  toDOM() {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-hybrid-checkbox'
    input.setAttribute('aria-label', this.checked ? 'Checked' : 'Unchecked')
    return input
  }

  ignoreEvent(event: Event): boolean {
    // Allow click events for toggling
    if (event instanceof MouseEvent) return false
    return true
  }
}

// ─── Widget: Image Thumbnail ──────────────────────────────────────────────────

class ImageThumbnailWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) { super() }

  eq(other: ImageThumbnailWidget) {
    return this.url === other.url && this.alt === other.alt
  }

  toDOM() {
    const container = document.createElement('span')
    container.className = 'cm-hybrid-image-container'

    const img = document.createElement('img')
    img.src = this.url
    img.alt = this.alt
    img.className = 'cm-hybrid-image-thumb'
    img.loading = 'lazy'

    // Handle load errors
    img.onerror = () => {
      container.classList.add('cm-hybrid-image-error')
      img.alt = this.alt || 'Image not found'
    }

    container.appendChild(img)
    return container
  }

  ignoreEvent(): boolean {
    return false // Allow click for zoom
  }
}

// ─── Widget: Math Preview (KaTeX) ────────────────────────────────────────────

class MathPreviewWidget extends WidgetType {
  constructor(readonly latex: string, readonly displayMode: boolean) { super() }

  eq(other: MathPreviewWidget) {
    return this.latex === other.latex && this.displayMode === other.displayMode
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = this.displayMode
      ? 'cm-hybrid-math-display'
      : 'cm-hybrid-math-inline'
    container.dataset.latex = this.latex

    // We'll render KaTeX asynchronously in the component
    // For now, show the raw latex as placeholder
    container.textContent = this.latex

    return container
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Helper: Cursor Range Check ───────────────────────────────────────────────

function isCursorInRange(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => {
    const selFrom = Math.min(r.from, r.to)
    const selTo = Math.max(r.from, r.to)
    return selFrom < to && selTo > from
  })
}

function isCursorAtPosition(state: EditorState, pos: number): boolean {
  return state.selection.ranges.some((r) => r.from === pos || r.to === pos)
}

// ─── Regex Patterns ───────────────────────────────────────────────────────────

/** Match [[wikilink]] or [[target|label]] */
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

/** Match ![](url) or ![alt](url) */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

/** Match $...$ (inline math, not $$) */
const INLINE_MATH_RE = /(?<!\$)\$(?!\$)([^\$]+?)(?<!\$)\$(?!\$)/g

/** Match $$...$$ (display math) */
const DISPLAY_MATH_RE = /\$\$([^\$]+?)\$\$/g

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const state = view.state
  const doc = state.doc
  const ranges: Range<Decoration>[] = []

  // 1. Walk the lezer syntax tree for standard markdown features
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // ── Task checkboxes ──────────────────────────────────────
        if (node.name === 'TaskMarker') {
          const text = doc.sliceString(node.from, node.to)
          const checked = text === '[x]' || text === '[X]'
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(checked, node.from),
            }).range(node.from, node.to)
          )
        }

        // ── Links [label](url) ──────────────────────────────────
        if (node.name === 'Link') {
          // Don't decorate if cursor is inside
          if (isCursorInRange(state, node.from, node.to)) return

          const text = doc.sliceString(node.from, node.to)

          // Skip image links (handled separately)
          if (text.startsWith('!')) return

          // Parse [label](url)
          const linkMatch = text.match(/^\[(.+?)\]\((.+?)\)$/)
          if (!linkMatch) return

          const labelLen = linkMatch[1].length
          const labelStart = node.from + 1 // after [
          const labelEnd = labelStart + labelLen
          const urlStart = labelEnd + 2 // after ](
          const urlEnd = node.to - 1 // before )

          // Style the label
          ranges.push(linkLabelMark.range(labelStart, labelEnd))
          // Fade the brackets and URL
          ranges.push(linkFadedMark.range(node.from, labelStart))
          ranges.push(linkFadedMark.range(labelEnd, urlStart))
          ranges.push(linkFadedMark.range(urlEnd, node.to))
        }

        // ── Inline code — add subtle background ──────────────────
        if (node.name === 'InlineCode') {
          // The CodeMark children are the backticks
          // Just add a class to the whole inline code
          ranges.push(
            Decoration.mark({ class: 'cm-hybrid-inline-code' }).range(node.from, node.to)
          )
        }
      },
    })
  }

  // 2. Scan with regex for custom syntax (wikilinks, images, math)
  //    We scan only the visible ranges for performance.
  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    // ── Wikilinks ─────────────────────────────────────────────
    WIKILINK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKILINK_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const target = match[1]
      const label = match[2]

      if (isCursorInRange(state, start, end)) {
        // Cursor is inside — show raw syntax with subtle highlight
        ranges.push(activeMark.range(start, end))
        continue
      }

      if (label) {
        // [[target|label]] — hide [[target|, show label, hide ]]
        const labelStart = start + 2 + target.length + 1 // after [[target|
        const labelEnd = end - 2 // before ]]

        ranges.push(hiddenMark.range(start, labelStart))
        ranges.push(wikilinkLabelMark.range(labelStart, labelEnd))
        ranges.push(hiddenMark.range(labelEnd, end))
      } else {
        // [[target]] — hide [[, show target styled, hide ]]
        const targetStart = start + 2
        const targetEnd = end - 2

        ranges.push(hiddenMark.range(start, targetStart))
        ranges.push(wikilinkLabelMark.range(targetStart, targetEnd))
        ranges.push(hiddenMark.range(targetEnd, end))
      }
    }

    // ── Image thumbnails ──────────────────────────────────────
    IMAGE_RE.lastIndex = 0
    while ((match = IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const alt = match[1]
      const url = match[2]

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      // Replace the whole image syntax with a thumbnail widget
      ranges.push(
        Decoration.replace({
          widget: new ImageThumbnailWidget(url, alt),
        }).range(start, end)
      )
    }

    // ── Display math $$...$$ ─────────────────────────────────
    DISPLAY_MATH_RE.lastIndex = 0
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

    // ── Inline math $...$ ────────────────────────────────────
    INLINE_MATH_RE.lastIndex = 0
    while ((match = INLINE_MATH_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
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

  // Sort and build the decoration set
  return Decoration.set(ranges, true)
}

// ─── Checkbox Click Handler ───────────────────────────────────────────────────

/** Global click handler for checkbox widgets in the editor */
function handleCheckboxClick(view: EditorView, pos: number): boolean {
  // Find the TaskMarker node at this position
  let nodeAtPos: { from: number; to: number; name: string } | null = null

  syntaxTree(view.state).iterate({
    from: Math.max(0, pos - 5),
    to: Math.min(view.state.doc.length, pos + 5),
    enter(node) {
      if (node.name === 'TaskMarker') {
        nodeAtPos = { from: node.from, to: node.to, name: node.name }
      }
    },
  })

  if (!nodeAtPos) return false

  const text = view.state.doc.sliceString(nodeAtPos.from, nodeAtPos.to)
  const newText = text === '[x]' || text === '[X]' ? '[ ]' : '[x]'

  view.dispatch({
    changes: { from: nodeAtPos.from, to: nodeAtPos.to, insert: newText },
  })

  return true
}

// ─── KaTeX Async Renderer ─────────────────────────────────────────────────────

let katexLoaded = false
let katexModule: any = null

async function loadAndRenderKatex(view: EditorView) {
  if (!katexLoaded) {
    try {
      katexModule = (await import('katex')).default
      katexLoaded = true
    } catch {
      return
    }
  }

  if (!katexModule) return

  // Find all math preview widgets in the DOM and render them
  const mathElements = view.dom.querySelectorAll('.cm-hybrid-math-inline, .cm-hybrid-math-display')
  for (const el of mathElements) {
    const latex = (el as HTMLElement).dataset.latex
    if (!latex) continue

    const isDisplay = el.classList.contains('cm-hybrid-math-display')

    try {
      katexModule.render(latex, el as HTMLElement, {
        throwOnError: false,
        displayMode: isDisplay,
      })
    } catch {
      // Leave the raw latex as fallback
    }
  }
}

// ─── ViewPlugin ───────────────────────────────────────────────────────────────

const hybridRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
      // Render KaTeX after decorations are applied
      setTimeout(() => loadAndRenderKatex(view), 50)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildDecorations(update.view)
        // Re-render KaTeX after updates
        if (update.docChanged || update.selectionSet) {
          setTimeout(() => loadAndRenderKatex(update.view), 50)
        }
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(view, event) {
        const target = event.target as HTMLElement

        // Handle checkbox clicks
        if (target.classList.contains('cm-hybrid-checkbox')) {
          const pos = view.posAtDOM(target)
          return handleCheckboxClick(view, pos)
        }

        // Handle image clicks — just let it through for now
        // (medium-zoom could be added here in the future)

        return false
      },
    },
  }
)

// ─── Theme ────────────────────────────────────────────────────────────────────

const hybridRenderTheme = EditorView.baseTheme({
  // Hidden text (wikilink brackets, math delimiters)
  '.cm-hybrid-hidden': {
    fontSize: '0',
    lineHeight: '0',
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    verticalAlign: 'middle',
    position: 'absolute',
    pointerEvents: 'none',
  },

  // Active state — show raw syntax with subtle background
  '.cm-hybrid-active': {
    backgroundColor: 'rgba(100, 140, 220, 0.08)',
    borderRadius: '3px',
  },

  // Wikilink label
  '.cm-hybrid-wikilink-label': {
    color: '#7c5cfc',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },

  // Link label
  '.cm-hybrid-link-label': {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },

  // Link faded (brackets, URL)
  '.cm-hybrid-link-faded': {
    opacity: '0.35',
    fontSize: '0.85em',
  },

  // Math expression
  '.cm-hybrid-math': {
    color: '#b45309',
    fontFamily: 'var(--font-geist-mono), monospace',
    fontSize: '0.9em',
  },

  // Math preview widgets
  '.cm-hybrid-math-inline': {
    display: 'inline',
  },
  '.cm-hybrid-math-display': {
    display: 'block',
    textAlign: 'center' as string,
    margin: '0.5em 0',
  },

  // Checkbox widget
  '.cm-hybrid-checkbox': {
    appearance: 'none',
    WebkitAppearance: 'none',
    width: '1em',
    height: '1em',
    border: '2px solid #94a3b8',
    borderRadius: '3px',
    cursor: 'pointer',
    verticalAlign: 'middle',
    position: 'relative',
    background: 'transparent',
    transition: 'all 0.15s',
    margin: '0 0.3em 0 0',
    display: 'inline-block',
  },
  '.cm-hybrid-checkbox:checked': {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  '.cm-hybrid-checkbox:checked::after': {
    content: '""',
    position: 'absolute' as string,
    top: '1px',
    left: '3px',
    width: '5px',
    height: '9px',
    border: 'solid white',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)',
  },
  '.cm-hybrid-checkbox:hover': {
    borderColor: '#3b82f6',
  },

  // Image thumbnail
  '.cm-hybrid-image-container': {
    display: 'inline-block',
    maxWidth: '200px',
    maxHeight: '150px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.1)',
    verticalAlign: 'middle',
    margin: '0 0.2em',
    cursor: 'zoom-in',
    transition: 'box-shadow 0.2s, border-color 0.2s',
  },
  '.cm-hybrid-image-container:hover': {
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    borderColor: 'rgba(0,0,0,0.2)',
  },
  '.cm-hybrid-image-thumb': {
    maxWidth: '100%',
    maxHeight: '150px',
    objectFit: 'cover' as string,
    display: 'block',
  },
  '.cm-hybrid-image-error .cm-hybrid-image-thumb': {
    minWidth: '80px',
    minHeight: '40px',
    padding: '4px 8px',
    objectFit: 'unset',
    fontSize: '0.8em',
  },

  // Inline code enhancement
  '.cm-hybrid-inline-code': {
    borderRadius: '3px',
    padding: '0 3px',
  },

  // Dark mode overrides
  '&dark .cm-hybrid-wikilink-label': {
    color: '#a78bfa',
  },
  '&dark .cm-hybrid-link-label': {
    color: '#60a5fa',
  },
  '&dark .cm-hybrid-math': {
    color: '#fbbf24',
  },
  '&dark .cm-hybrid-checkbox': {
    borderColor: '#64748b',
  },
  '&dark .cm-hybrid-checkbox:checked': {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  '&dark .cm-hybrid-checkbox:hover': {
    borderColor: '#60a5fa',
  },
  '&dark .cm-hybrid-image-container': {
    borderColor: 'rgba(255,255,255,0.1)',
  },
  '&dark .cm-hybrid-image-container:hover': {
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  '&dark .cm-hybrid-active': {
    backgroundColor: 'rgba(100, 140, 220, 0.12)',
  },
  '&dark .cm-hybrid-link-faded': {
    opacity: '0.4',
  },
})

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Enable hybrid Markdown rendering in the editor.
 * Adds Obsidian-style Live Preview decorations for:
 * - Interactive checkboxes
 * - Wikilinks with hidden syntax
 * - Image thumbnails
 * - Math preview (KaTeX)
 * - Styled links
 *
 * Usage:
 * ```ts
 * import { hybridRender } from '@/lib/codemirror-ext'
 * // Add to extensions array
 * extensions.push(hybridRender())
 * ```
 */
export function hybridRender() {
  return [hybridRenderPlugin, hybridRenderTheme]
}
