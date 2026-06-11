/**
 * Wikilinks and embed-images decoration plugin.
 *
 * Handles two Obsidian-specific syntaxes:
 *
 * 1. [[wikilinks]] / [[target|label]] — Style the label, hide brackets.
 *    When cursor enters the wikilink, raw syntax is shown.
 *
 * 2. ![[image.png]] / ![[image.png|300]] / ![[image.png|300x200]] — Replace
 *    the entire embed syntax with an inline image thumbnail widget.
 *    When cursor enters, raw syntax is shown.
 *
 * Uses regex scanning since the lezer parser doesn't understand [[...]] syntax.
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
  wikilinkLabelMark,
  isCursorInRange,
  WIKILINK_RE,
  EMBED_IMAGE_RE,
} from './shared'

// ─── Image Extensions ─────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.bmp', '.ico', '.avif', '.tiff', '.tif',
])

function isImagePath(filename: string): boolean {
  const lower = filename.toLowerCase()
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

// ─── Widget: Embed Image Thumbnail ───────────────────────────────────────────

class EmbedImageWidget extends WidgetType {
  constructor(
    readonly filename: string,
    readonly width?: number,
    readonly height?: number,
  ) { super() }

  eq(other: EmbedImageWidget) {
    return this.filename === other.filename &&
      this.width === other.width &&
      this.height === other.height
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = 'cm-hybrid-image-container'
    container.setAttribute('data-embed-image', this.filename)

    const img = document.createElement('img')
    // For local storage, images are stored as data URLs in the note content
    // The URL will be resolved client-side. For now, use a placeholder approach.
    img.alt = this.filename
    img.className = 'cm-hybrid-image-thumb'
    img.loading = 'lazy'

    if (this.width) {
      img.width = this.width
    }
    if (this.height) {
      img.height = this.height
    }

    // Try to use the filename as a path for local resolution
    // If it's a data URL already, use it directly
    if (this.filename.startsWith('data:')) {
      img.src = this.filename
    } else {
      // Mark for client-side resolution
      img.dataset.embedSrc = this.filename
      // Show filename as placeholder until resolved
      container.classList.add('cm-hybrid-image-pending')
      img.src = ''  // Will be populated by client-side handler
    }

    img.onerror = () => {
      container.classList.add('cm-hybrid-image-error')
      container.classList.remove('cm-hybrid-image-pending')
      img.alt = this.filename
    }

    container.appendChild(img)
    return container
  }

  ignoreEvent(): boolean {
    return false // Allow click for zoom
  }
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildWikilinkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    // ── Embed images: ![[image.png|300]] ────────────────────────
    // Must be scanned BEFORE wikilinks since ![[...]] is a superset
    EMBED_IMAGE_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const filename = match[1]
      const sizeSpec = match[2]

      // Only handle image files; non-image ![[embeds]] stay as wikilinks
      if (!isImagePath(filename)) continue

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      // Parse size spec: "300" or "300x200"
      let width: number | undefined
      let height: number | undefined
      if (sizeSpec) {
        const sizeMatch = sizeSpec.match(/^(\d+)(?:x(\d+))?$/)
        if (sizeMatch) {
          width = parseInt(sizeMatch[1], 10)
          if (sizeMatch[2]) height = parseInt(sizeMatch[2], 10)
        }
      }

      ranges.push(
        Decoration.replace({
          widget: new EmbedImageWidget(filename, width, height),
        }).range(start, end)
      )
    }

    // ── Wikilinks: [[target]] / [[target|label]] ────────────────
    WIKILINK_RE.lastIndex = 0

    while ((match = WIKILINK_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const target = match[1]
      const label = match[2]

      // Skip if this is an embed image (already handled above)
      if (start > 0 && doc.sliceString(start - 1, start) === '!') {
        continue
      }

      if (isCursorInRange(state, start, end)) {
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
  }

  return Decoration.set(ranges, true)
}

export const wikilinksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildWikilinkDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildWikilinkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
