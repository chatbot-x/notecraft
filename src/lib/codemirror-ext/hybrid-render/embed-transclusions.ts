/**
 * Embed transclusions decoration plugin.
 *
 * Handles Obsidian-style non-image embeds:
 * - ![[note]]           — Embed entire note
 * - ![[note#heading]]   — Embed note section
 * - ![[note#^block-id]] — Embed specific block
 * - ![[#heading]]       — Embed heading in current note
 *
 * In Live Preview, non-image embeds are replaced with a placeholder widget
 * that shows the embed target and a "Loading embed..." indicator. When the
 * cursor enters the embed range, the raw syntax is shown.
 *
 * Image embeds (![[image.png|300]]) are handled by the wikilinks plugin.
 *
 * ## Level 2: Tree-based scanning
 *
 * With the Lezer Embed extension active, the syntax tree contains `Embed`,
 * `EmbedMark`, and `EmbedTarget` nodes. This plugin now scans the tree
 * for Embed nodes where the target is NOT an image path, and replaces them
 * with transclusion widgets.
 *
 * Falls back to regex scanning if the tree doesn't contain Embed nodes.
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
  activeMark,
  isImagePath,
  EMBED_TRANSCLUDE_RE,
  isCursorInRange,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Embed Transclusion ───────────────────────────────────────────────

class EmbedTransclusionWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly label?: string,
  ) { super() }

  eq(other: EmbedTransclusionWidget) {
    return this.target === other.target && this.label === other.label
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-hybrid-embed-transclusion'
    container.setAttribute('data-embed-src', this.target)

    // Parse the target for display
    const { noteName, heading, blockId } = parseEmbedTarget(this.target)

    // Header with embed icon and target name
    const header = document.createElement('div')
    header.className = 'cm-hybrid-embed-header'

    const icon = document.createElement('span')
    icon.className = 'cm-hybrid-embed-icon'
    icon.textContent = '\u2197' // ↗

    const name = document.createElement('span')
    name.className = 'cm-hybrid-embed-name'
    name.textContent = this.label || noteName || this.target

    header.appendChild(icon)
    header.appendChild(name)

    if (heading) {
      const headingEl = document.createElement('span')
      headingEl.className = 'cm-hybrid-embed-heading'
      headingEl.textContent = ` > ${heading}`
      header.appendChild(headingEl)
    }

    if (blockId) {
      const blockEl = document.createElement('span')
      blockEl.className = 'cm-hybrid-embed-block'
      blockEl.textContent = ` ^${blockId}`
      header.appendChild(blockEl)
    }

    container.appendChild(header)

    // Placeholder content area (to be filled by client-side handler)
    const content = document.createElement('div')
    content.className = 'cm-hybrid-embed-content'
    content.textContent = 'Loading embed\u2026'
    container.appendChild(content)

    return container
  }

  ignoreEvent(): boolean {
    return false // Allow click for navigation
  }
}

// ─── Embed Target Parser ──────────────────────────────────────────────────────

interface EmbedTarget {
  noteName: string
  heading?: string
  blockId?: string
}

function parseEmbedTarget(target: string): EmbedTarget {
  // Handle ![[#heading]] (same-file heading reference)
  if (target.startsWith('#')) {
    const rest = target.slice(1)
    if (rest.startsWith('^')) {
      return { noteName: '', blockId: rest.slice(1) }
    }
    return { noteName: '', heading: rest }
  }

  // Handle ![[note#^block-id]]
  const blockMatch = target.match(/^(.+?)#(\^[a-zA-Z0-9_-]+)$/)
  if (blockMatch) {
    return { noteName: blockMatch[1], blockId: blockMatch[2].slice(1) }
  }

  // Handle ![[note#heading]]
  const headingMatch = target.match(/^(.+?)#(.+)$/)
  if (headingMatch) {
    return { noteName: headingMatch[1], heading: headingMatch[2] }
  }

  return { noteName: target }
}

// ─── Build Decorations (Tree-based) ──────────────────────────────────────────

function buildEmbedTransclusionDecorations(view: EditorView): DecorationSet {
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
          // Extract the target text from EmbedTarget child
          let targetText = ''
          node.node.cursor().iterate((child) => {
            if (child.name === 'EmbedTarget') {
              targetText = state.doc.sliceString(child.from, child.to)
            }
            return false
          })

          // Parse the | separator for label/size
          const pipeIdx = targetText.indexOf('|')
          const filePath = pipeIdx > -1 ? targetText.slice(0, pipeIdx) : targetText
          const label = pipeIdx > -1 ? targetText.slice(pipeIdx + 1) : undefined

          // Skip image embeds — handled by wikilinks plugin
          if (isImagePath(filePath)) return

          usedTree = true
          const start = node.from
          const end = node.to

          if (isCursorInRange(state, start, end)) {
            ranges.push(activeMark.range(start, end))
            return
          }

          // Replace the embed syntax with a transclusion widget
          ranges.push(
            Decoration.replace({
              widget: new EmbedTransclusionWidget(filePath, label),
              block: true,
            }).range(start, end)
          )
        }
      },
    })
  }

  // If tree had Embed nodes, we're done
  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning (if Lezer extension not loaded) ─────────────
  const doc = state.doc
  for (const { from, to } of view.visibleRanges) {
    const skipRanges = collectSkipRanges(state, from, to)
    const visibleText = doc.sliceString(from, to)

    EMBED_TRANSCLUDE_RE.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = EMBED_TRANSCLUDE_RE.exec(visibleText)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const target = match[1]
      const label = match[2]

      if (isInRangeList(start, end, skipRanges)) continue

      if (isImagePath(target)) continue

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      ranges.push(
        Decoration.replace({
          widget: new EmbedTransclusionWidget(target, label),
          block: true,
        }).range(start, end)
      )
    }
  }

  return Decoration.set(ranges, true)
}

export const embedTransclusionsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildEmbedTransclusionDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildEmbedTransclusionDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Provide atomic ranges so cursor jumps over embed widgets
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
