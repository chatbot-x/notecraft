/**
 * Links and image thumbnails decoration plugin.
 *
 * Handles standard markdown syntax:
 * - [label](url) — Underline the label, fade brackets and URL
 * - ![alt](url) — Replace entire image syntax with thumbnail widget
 *
 * Uses the lezer syntax tree for Link and Image nodes.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import {
  linkLabelMark,
  linkFadedMark,
  activeMark,
  isCursorInRange,
} from './shared'

// ─── Widget: Image Thumbnail ──────────────────────────────────────────────────

class ImageThumbnailWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) { super() }

  eq(other: ImageThumbnailWidget) {
    return this.url === other.url && this.alt === other.alt
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = 'cm-hybrid-image-container'

    const img = document.createElement('img')
    img.src = this.url
    img.alt = this.alt
    img.className = 'cm-hybrid-image-thumb'
    img.loading = 'lazy'

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

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildLinkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // ── Images: ![alt](url) ────────────────────────────────
        if (node.name === 'Image') {
          if (isCursorInRange(state, node.from, node.to)) {
            ranges.push(activeMark.range(node.from, node.to))
            return
          }

          const text = doc.sliceString(node.from, node.to)
          // Parse ![alt](url)
          const imgMatch = text.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
          if (!imgMatch) return

          const alt = imgMatch[1]
          const url = imgMatch[2]

          ranges.push(
            Decoration.replace({
              widget: new ImageThumbnailWidget(url, alt),
            }).range(node.from, node.to)
          )
          return
        }

        // ── Links: [label](url) ────────────────────────────────
        if (node.name === 'Link') {
          // Skip if cursor is inside
          if (isCursorInRange(state, node.from, node.to)) return

          const text = doc.sliceString(node.from, node.to)

          // Skip image links (handled above via Image node)
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
      },
    })
  }

  return Decoration.set(ranges, true)
}

export const linksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildLinkDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildLinkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
