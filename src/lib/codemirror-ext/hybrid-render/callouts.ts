/**
 * Callouts decoration plugin — Enhanced Edition.
 *
 * Applies line decorations to Obsidian-style callout blocks (> [!note], > [!warning]+)
 *
 * ## Enhancement
 *
 * Uses `shouldShowSourceForLine()` for consistent cursor-awareness.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { CALLOUT_TYPES, TYPE_ALIASES } from './shared'
import { shouldShowSourceForLine } from './cursor-awareness'
import { checkUpdateAction } from './drag-state'

function buildCalloutDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const state = view.state
  const doc = state.doc

  // Try tree-based scanning first
  const tree = syntaxTree(state)
  let usedTree = false

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Callout') {
          usedTree = true

          let typeText = ''
          let hasFold = false
          let foldChar = ''
          let markStart = node.from
          let markEnd = node.from
          let typeFrom = node.from
          let typeTo = node.from

          node.node.cursor().iterate((child) => {
            if (child.name === 'CalloutType') {
              typeText = state.doc.sliceString(child.from, child.to)
              typeFrom = child.from
              typeTo = child.to
            }
            if (child.name === 'CalloutFoldMark') {
              hasFold = true
              foldChar = state.doc.sliceString(child.from, child.to)
            }
            if (child.name === 'CalloutMark') {
              if (markStart === node.from) {
                markStart = child.from
              }
              markEnd = child.to
            }
            return false
          })

          const rawType = typeText.toLowerCase()
          const resolvedType = TYPE_ALIASES[rawType] ?? rawType
          const typeInfo = CALLOUT_TYPES[resolvedType] ?? CALLOUT_TYPES.note

          const line = doc.lineAt(node.from)
          const lineFrom = line.from
          const lineTo = line.to

          if (!shouldShowSourceForLine(state, lineFrom, lineTo)) {
            ranges.push(
              Decoration.line({
                class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType}`,
                attributes: {
                  'data-callout': resolvedType,
                  ...(hasFold ? { 'data-callout-foldable': '' } : {}),
                  ...(hasFold && foldChar === '-' ? { 'data-callout-collapsed': '' } : {}),
                },
              }).range(lineFrom)
            )

            ranges.push(
              Decoration.mark({
                class: `cm-hybrid-callout-marker cm-hybrid-callout-marker-${resolvedType}`,
                attributes: { 'data-callout-type': resolvedType },
              }).range(markStart, markEnd + (hasFold ? 1 : 0))
            )

            const lineText = line.text
            const prefixMatch = lineText.match(/^(\s*>\s*)/)
            if (prefixMatch) {
              const prefixEnd = lineFrom + prefixMatch[1].length
              ranges.push(
                Decoration.mark({ class: 'cm-hybrid-callout-prefix' }).range(lineFrom, prefixEnd)
              )
            }
          }

          // Apply line decorations to subsequent blockquote lines
          let nextLineNum = line.number + 1
          while (nextLineNum <= doc.lines) {
            const nextLine = doc.line(nextLineNum)
            const nextText = nextLine.text
            if (!nextText.match(/^\s*>\s/)) break

            if (!shouldShowSourceForLine(state, nextLine.from, nextLine.to)) {
              ranges.push(
                Decoration.line({
                  class: `cm-hybrid-callout cm-hybrid-callout-${resolvedType} cm-hybrid-callout-body`,
                  attributes: { 'data-callout': resolvedType },
                }).range(nextLine.from)
              )

              const bodyPrefixMatch = nextText.match(/^(\s*>\s?)/)
              if (bodyPrefixMatch) {
                ranges.push(
                  Decoration.mark({ class: 'cm-hybrid-callout-prefix' }).range(
                    nextLine.from,
                    nextLine.from + bodyPrefixMatch[1].length
                  )
                )
              }
            }

            nextLineNum++
          }
        }
      },
    })
  }

  if (usedTree) return Decoration.set(ranges, true)

  // ── Fallback: regex line-by-line scanning ────────────────────────────────
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

      if (!shouldShowSourceForLine(state, headerLineFrom, headerLineTo)) {
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

      // Subsequent blockquote lines
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]
        if (!nextLine.match(/^\s*>\s/)) break

        const nextLineFrom = lineOffset + line.length + 1
        const nextLineTo = nextLineFrom + nextLine.length

        if (!shouldShowSourceForLine(state, nextLineFrom, nextLineTo)) {
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
