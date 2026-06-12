/**
 * Embed transclusions decoration plugin — Enhanced Edition.
 *
 * Handles Obsidian-style non-image embeds:
 * - ![[note]] / ![[note#heading]] / ![[note#^block-id]] / ![[#heading]]
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
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  isImagePath,
  EMBED_TRANSCLUDE_RE,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { shouldShowSource } from './cursor-awareness'
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

    const { noteName, heading, blockId } = parseEmbedTarget(this.target)

    const header = document.createElement('div')
    header.className = 'cm-hybrid-embed-header'

    const icon = document.createElement('span')
    icon.className = 'cm-hybrid-embed-icon'
    icon.textContent = '\u2197'

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

    const content = document.createElement('div')
    content.className = 'cm-hybrid-embed-content'
    content.textContent = 'Loading embed\u2026'
    container.appendChild(content)

    return container
  }

  ignoreEvent(): boolean {
    return false
  }
}

// ─── Embed Target Parser ──────────────────────────────────────────────────────

interface EmbedTarget {
  noteName: string
  heading?: string
  blockId?: string
}

function parseEmbedTarget(target: string): EmbedTarget {
  if (target.startsWith('#')) {
    const rest = target.slice(1)
    if (rest.startsWith('^')) {
      return { noteName: '', blockId: rest.slice(1) }
    }
    return { noteName: '', heading: rest }
  }

  const blockMatch = target.match(/^(.+?)#(\^[a-zA-Z0-9_-]+)$/)
  if (blockMatch) {
    return { noteName: blockMatch[1], blockId: blockMatch[2].slice(1) }
  }

  const headingMatch = target.match(/^(.+?)#(.+)$/)
  if (headingMatch) {
    return { noteName: headingMatch[1], heading: headingMatch[2] }
  }

  return { noteName: target }
}

// ─── Build Decorations ───────────────────────────────────────────────────────

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
          let targetText = ''
          node.node.cursor().iterate((child) => {
            if (child.name === 'EmbedTarget') {
              targetText = state.doc.sliceString(child.from, child.to)
            }
            return false
          })

          const pipeIdx = targetText.indexOf('|')
          const filePath = pipeIdx > -1 ? targetText.slice(0, pipeIdx) : targetText
          const label = pipeIdx > -1 ? targetText.slice(pipeIdx + 1) : undefined

          if (isImagePath(filePath)) return

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

  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
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
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations || Decoration.none
      }),
  }
)
