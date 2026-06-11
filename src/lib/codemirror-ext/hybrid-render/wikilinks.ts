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
 * ## Level 2: Tree-based scanning
 *
 * With the Lezer Wikilink and Embed extensions active, the syntax tree contains
 * `Wikilink`, `WikilinkMark`, `WikilinkTarget`, `WikilinkAlias`, `Embed`,
 * `EmbedMark`, and `EmbedTarget` nodes. This plugin now scans the tree
 * instead of using regex, which eliminates false positives inside code blocks
 * and provides incremental parsing benefits.
 *
 * Falls back to regex scanning if the tree doesn't contain these nodes.
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
  activeMark,
  wikilinkLabelMark,
  isCursorInRange,
  isImagePath,
  WIKILINK_RE,
  EMBED_IMAGE_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

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
      img.dataset.embedSrc = this.filename
      container.classList.add('cm-hybrid-image-pending')
      img.src = ''
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

function buildWikilinkDecorations(view: EditorView): DecorationSet {
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
        // ── Embed: ![[image.png|300]] or ![[note#heading]] ──────────────
        if (node.name === 'Embed') {
          usedTree = true
          const start = node.from
          const end = node.to

          if (isCursorInRange(state, start, end)) {
            ranges.push(activeMark.range(start, end))
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

          // Parse target: might be "image.png|300" or "note#heading|label"
          // The | is inside the target text, need to split
          const pipeIdx = targetText.indexOf('|')
          const filePath = pipeIdx > -1 ? targetText.slice(0, pipeIdx) : targetText
          const sizeSpec = pipeIdx > -1 ? targetText.slice(pipeIdx + 1) : undefined

          if (isImagePath(filePath)) {
            // Image embed — replace with thumbnail widget
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
            // Hide the ![[ and ]] marks, show target with wikilink label style
            node.node.cursor().iterate((child) => {
              if (child.name === 'EmbedMark') {
                ranges.push(hiddenMark.range(child.from, child.to))
              }
              if (child.name === 'EmbedTarget') {
                // Show only the file path part (before |)
                if (pipeIdx > -1) {
                  ranges.push(wikilinkLabelMark.range(child.from, child.from + filePath.length))
                  ranges.push(hiddenMark.range(child.from + filePath.length, child.to))
                } else {
                  ranges.push(wikilinkLabelMark.range(child.from, child.to))
                }
              }
              return false
            })
          }
          return
        }

        // ── Wikilink: [[target]] / [[target|label]] ─────────────────────
        if (node.name === 'Wikilink') {
          usedTree = true
          const start = node.from
          const end = node.to

          // Skip if preceded by ! (should have been handled as Embed)
          if (start > 0 && state.doc.sliceString(start - 1, start) === '!') {
            return
          }

          if (isCursorInRange(state, start, end)) {
            ranges.push(activeMark.range(start, end))
            return
          }

          // Iterate children to find marks, target, and optional alias
          let hasAlias = false
          node.node.cursor().iterate((child) => {
            if (child.name === 'WikilinkMark') {
              ranges.push(hiddenMark.range(child.from, child.to))
            }
            if (child.name === 'WikilinkTarget') {
              if (!hasAlias) {
                // No alias — show target as the label
                ranges.push(wikilinkLabelMark.range(child.from, child.to))
              } else {
                // Has alias — hide the target
                ranges.push(hiddenMark.range(child.from, child.to))
              }
            }
            if (child.name === 'WikilinkAlias') {
              hasAlias = true
              ranges.push(wikilinkLabelMark.range(child.from, child.to))
            }
            return false // don't descend further
          })
          return
        }
      },
    })
  }

  // If tree had Wikilink/Embed nodes, we're done
  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning (if Lezer extension not loaded) ─────────────
  const doc = state.doc
  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    // ── Embed images: ![[image.png|300]] ────────────────────────
    EMBED_IMAGE_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = EMBED_IMAGE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue

      const filename = match[1]
      const sizeSpec = match[2]

      if (!isImagePath(filename)) continue

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
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

    // ── Wikilinks: [[target]] / [[target|label]] ────────────────
    WIKILINK_RE.lastIndex = 0

    while ((match = WIKILINK_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length

      if (isInRangeList(start, end, skipRanges)) continue

      const target = match[1]
      const label = match[2]

      if (start > 0 && doc.sliceString(start - 1, start) === '!') {
        continue
      }

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      if (label) {
        const labelStart = start + 2 + target.length + 1
        const labelEnd = end - 2
        ranges.push(hiddenMark.range(start, labelStart))
        ranges.push(wikilinkLabelMark.range(labelStart, labelEnd))
        ranges.push(hiddenMark.range(labelEnd, end))
      } else {
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
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildWikilinkDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Provide atomic ranges so cursor jumps over decorated wikilinks/embeds
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
