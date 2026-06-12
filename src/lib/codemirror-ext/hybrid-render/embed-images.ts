/**
 * Embed images decoration plugin — Enhanced Edition.
 *
 * Handles Obsidian-style image embeds:
 * - ![[image.png]] / ![[image.png|300]] / ![[image.png|300x200]]
 *
 * ## Enhancements
 *
 * 1. Uses `shouldShowSource()` for consistent cursor-awareness
 * 2. Image dimension caching for smooth remount behavior
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
import { syntaxTree } from '@codemirror/language'
import {
  hiddenMark,
  embedLabelMark,
  isImagePath,
  EMBED_IMAGE_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { shouldShowSource } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

// ─── Image Dimension Cache (shared with links.ts) ────────────────────────────

const dimensionCache = new Map<string, { w: number; h: number }>()

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
    img.alt = this.filename
    img.className = 'cm-hybrid-image-thumb'
    img.loading = 'lazy'

    if (this.width) {
      img.width = this.width
    }
    if (this.height) {
      img.height = this.height
    }

    if (this.filename.startsWith('data:')) {
      img.src = this.filename
    } else {
      // Pre-set dimensions from cache
      const cached = dimensionCache.get(this.filename)
      if (cached && !this.width) {
        img.width = cached.w
        img.height = cached.h
      }
      img.dataset.embedSrc = this.filename
      container.classList.add('cm-hybrid-image-pending')
      img.src = ''
    }

    img.onload = () => {
      if (!this.filename.startsWith('data:')) {
        dimensionCache.set(this.filename, { w: img.naturalWidth, h: img.naturalHeight })
      }
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

// ─── Build Decorations (Tree-based) ──────────────────────────────────────────

function buildEmbedImageDecorations(view: EditorView): DecorationSet {
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
        if (node.name === 'Embed') {
          usedTree = true
          const start = node.from
          const end = node.to

          if (shouldShowSource(state, start, end)) {
            ranges.push(
              Decoration.mark({
                class: 'cm-hybrid-active',
              }).range(start, end)
            )
            return
          }

          // Extract the target text from EmbedTarget child
          let targetText = ''
          node.node.cursor().iterate((child) => {
            if (child.name === 'EmbedTarget') {
              targetText = state.doc.sliceString(child.from, child.to)
            }
            return false
          })

          const pipeIdx = targetText.indexOf('|')
          const filePath = pipeIdx > -1 ? targetText.slice(0, pipeIdx) : targetText
          const sizeSpec = pipeIdx > -1 ? targetText.slice(pipeIdx + 1) : undefined

          if (isImagePath(filePath)) {
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
                widget: new EmbedImageWidget(filePath, width, height),
              }).range(start, end)
            )
          } else {
            // Non-image embed — show as styled link
            node.node.cursor().iterate((child) => {
              if (child.name === 'EmbedMark') {
                ranges.push(hiddenMark.range(child.from, child.to))
              }
              if (child.name === 'EmbedTarget') {
                if (pipeIdx > -1) {
                  ranges.push(embedLabelMark.range(child.from, child.from + filePath.length))
                  ranges.push(hiddenMark.range(child.from + filePath.length, child.to))
                } else {
                  ranges.push(embedLabelMark.range(child.from, child.to))
                }
              }
              return false
            })
          }
          return
        }
      },
    })
  }

  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
  const doc = state.doc
  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    EMBED_IMAGE_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue

      const filename = match[1]
      const sizeSpec = match[2]

      if (!isImagePath(filename)) continue

      if (shouldShowSource(state, start, end)) {
        ranges.push(
          Decoration.mark({
            class: 'cm-hybrid-active',
          }).range(start, end)
        )
        continue
      }

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
  }

  return Decoration.set(ranges, true)
}

export const embedImagesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildEmbedImageDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildEmbedImageDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
