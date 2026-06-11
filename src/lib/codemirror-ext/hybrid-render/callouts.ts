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
import { checkUpdateAction } from './drag-state'

// ─── Callout Type Colors ──────────────────────────────────────────────────────

const CALLOUT_TYPES: Record<string, { color: string; icon: string }> = {
  note:      { color: '#448aff', icon: '\u270E' },
  info:      { color: '#448aff', icon: '\u2139' },
  tip:       { color: '#00c853', icon: '\u261D' },
  success:   { color: '#00c853', icon: '\u2714' },
  question:  { color: '#ffab00', icon: '?' },
  warning:   { color: '#ff9100', icon: '\u26A0' },
  failure:   { color: '#ff5252', icon: '\u2718' },
  danger:    { color: '#ff1744', icon: '\u26D4' },
  bug:       { color: '#e040fb', icon: '\uD83D\uDC1B' },
  example:   { color: '#7c4dff', icon: '\uD83D\uDCCB' },
  quote:     { color: '#9e9e9e', icon: '\u275D' },
  abstract:  { color: '#00b8d4', icon: '\uD83D\uDCD1' },
  todo:      { color: '#448aff', icon: '\uD83D\uDCDD' },
  important: { color: '#ff9100', icon: '\uD83D\uDD25' },
}

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

      const resolvedType = TYPE_ALIASES[rawType] ?? rawType
      const typeInfo = CALLOUT_TYPES[resolvedType] ?? CALLOUT_TYPES.note

      const headerLineFrom = lineOffset
      const headerLineTo = lineOffset + line.length

      if (!isCursorOnLine(state, headerLineFrom, headerLineTo)) {
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

        const markerStart = lineOffset + prefixLen
        const markerEnd = markerStart + `[!${calloutMatch[2]}]`.length

        ranges.push(
          Decoration.mark({
            class: `cm-hybrid-callout-marker cm-hybrid-callout-marker-${resolvedType}`,
            attributes: { 'data-callout-type': resolvedType },
          }).range(markerStart, markerEnd)
        )

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
        if (!nextLine.match(/^\s*>\s/)) break

        const nextLineFrom = lineOffset + line.length + 1
        const nextLineTo = nextLineFrom + nextLine.length

        if (!isCursorOnLine(state, nextLineFrom, nextLineTo)) {
          ranges.push(
            Decoration.line({
              class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType} cm-hybrid-callout-body`,
              attributes: { 'data-callout': resolvedType },
            }).range(doc.lineAt(nextLineFrom).from)
          )

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
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildCalloutDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
