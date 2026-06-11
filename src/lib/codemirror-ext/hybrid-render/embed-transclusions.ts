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
 * Uses regex scanning since the lezer parser doesn't understand ![[...]] syntax.
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
  activeMark,
  EMBED_TRANSCLUDE_RE,
  isCursorInRange,
  collectSkipRanges,
  isInRangeList,
} from './shared'
import { checkUpdateAction } from './drag-state'

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

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildEmbedTransclusionDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
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

      // Skip if inside code block or inline code
      if (isInRangeList(start, end, skipRanges)) continue

      // Skip image embeds — handled by wikilinks plugin
      if (isImagePath(target)) continue

      if (isCursorInRange(state, start, end)) {
        ranges.push(activeMark.range(start, end))
        continue
      }

      // Replace the embed syntax with a transclusion widget
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
