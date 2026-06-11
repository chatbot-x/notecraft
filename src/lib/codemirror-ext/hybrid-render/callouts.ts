/**
 * Callouts decoration plugin.
 *
 * Applies line decorations to Obsidian-style callout blocks (> [!note], > [!warning]+)
 * in the editor. This adds visual styling (left border, background tint) to callout
 * lines so they stand out even in Live Preview mode.
 *
 * The callout header [!type] is styled as a badge, and foldable indicators (+/-)
 * are visually marked.
 *
 * Uses regex scanning since the lezer parser doesn't understand [!type] syntax.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { isCursorOnLine } from './shared'

// ─── Callout Type Colors ──────────────────────────────────────────────────────

const CALLOUT_TYPES: Record<string, { color: string; icon: string }> = {
  note:      { color: '#448aff', icon: '✎' },
  info:      { color: '#448aff', icon: 'ℹ' },
  tip:       { color: '#00c853', icon: '☝' },
  success:   { color: '#00c853', icon: '✔' },
  question:  { color: '#ffab00', icon: '❓' },
  warning:   { color: '#ff9100', icon: '⚠' },
  failure:   { color: '#ff5252', icon: '✘' },
  danger:    { color: '#ff1744', icon: '⛔' },
  bug:       { color: '#e040fb', icon: '🐛' },
  example:   { color: '#7c4dff', icon: '📋' },
  quote:     { color: '#9e9e9e', icon: '❝' },
  abstract:  { color: '#00b8d4', icon: '📑' },
  todo:      { color: '#448aff', icon: '📝' },
  important: { color: '#ff9100', icon: '🔥' },
}

// Type aliases (same as callout-plugin.ts)
const TYPE_ALIASES: Record<string, string> = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildCalloutDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  for (const { from, to } of view.visibleRanges) {
    const visibleText = doc.sliceString(from, to)

    // Find callout headers: > [!type]+/- Title
    // We need to identify the entire blockquote run that starts with a callout
    const lines = visibleText.split('\n')
    let lineOffset = from

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const calloutMatch = line.match(/^(\s*>\s*)\[!(\w+)\]([+-]?)(?:[ \t]+(.*))?$/)

      if (!calloutMatch) {
        lineOffset += line.length + 1
        continue
      }

      const prefixLen = calloutMatch[1].length
      const rawType = calloutMatch[2].toLowerCase()
      const foldable = calloutMatch[3] === '+' || calloutMatch[3] === '-'
      const defaultOpen = calloutMatch[3] === '+'
      const title = calloutMatch[4] || ''

      // Resolve type alias
      const resolvedType = TYPE_ALIASES[rawType] ?? rawType
      const typeInfo = CALLOUT_TYPES[resolvedType] ?? CALLOUT_TYPES.note

      // Line decoration for the callout header line
      const headerLineFrom = lineOffset
      const headerLineTo = lineOffset + line.length

      // Only apply if cursor is not on this line
      if (!isCursorOnLine(state, headerLineFrom, headerLineTo)) {
        // Add line decoration with callout styling
        ranges.push(
          Decoration.line({
            class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType}`,
            attributes: {
              'data-callout': resolvedType,
              ...(foldable ? { 'data-callout-foldable': '' } : {}),
              ...(foldable && !defaultOpen ? { 'data-callout-collapsed': '' } : {}),
            },
          }).range(doc.lineAt(headerLineFrom).from)
        )

        // Style the [!type] marker as a badge
        const markerStart = lineOffset + prefixLen // start of [
        const markerEnd = markerStart + `[!${calloutMatch[2]}]`.length

        ranges.push(
          Decoration.mark({
            class: `cm-hybrid-callout-marker cm-hybrid-callout-marker-${resolvedType}`,
            attributes: { 'data-callout-type': resolvedType },
          }).range(markerStart, markerEnd)
        )

        // Hide the > prefix on the callout line
        if (prefixLen > 0) {
          ranges.push(
            Decoration.mark({ class: 'cm-hybrid-callout-prefix' }).range(
              lineOffset,
              lineOffset + prefixLen
            )
          )
        }
      }

      // Apply line decorations to subsequent blockquote lines in this callout
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]
        if (!nextLine.match(/^\s*>\s/)) break // No longer a blockquote

        const nextLineFrom = lineOffset + line.length + 1
        const nextLineTo = nextLineFrom + nextLine.length

        if (!isCursorOnLine(state, nextLineFrom, nextLineTo)) {
          ranges.push(
            Decoration.line({
              class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType} cm-hybrid-callout-body`,
              attributes: { 'data-callout': resolvedType },
            }).range(doc.lineAt(nextLineFrom).from)
          )

          // Hide the > prefix on body lines too
          const bodyPrefixMatch = nextLine.match(/^(\s*>\s?)/)
          if (bodyPrefixMatch) {
            ranges.push(
              Decoration.mark({ class: 'cm-hybrid-callout-prefix' }).range(
                nextLineFrom,
                nextLineFrom + bodyPrefixMatch[1].length
              )
            )
          }
        }

        lineOffset += nextLine.length + 1
        j++
      }

      lineOffset += line.length + 1
    }
  }

  return Decoration.set(ranges, true)
}

export const calloutsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCalloutDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildCalloutDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
