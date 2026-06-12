/**
 * WYSIWYG Table decoration plugin.
 *
 * Renders markdown tables as visual grid-like representations in the editor,
 * inspired by Atomic Editor's table rendering and Obsidian's Live Preview.
 *
 * When the cursor is NOT on a table, the pipe characters (|) and separator
 * line (|---|---|) are hidden, and cells are styled with borders and padding
 * to create a visual table. When the cursor enters the table, raw markdown
 * is revealed for editing.
 *
 * ## Architecture
 *
 * Uses the Lezer syntax tree to find Table nodes. Falls back to regex
 * scanning if the tree doesn't contain Table nodes (requires the Lezer
 * table extension from @codemirror/lang-markdown or a custom grammar).
 *
 * Uses ViewPlugin (not StateField) because table decorations are line-level
 * and mark-level — they don't change the block structure of the document.
 * For truly block-level table replacement (replacing the entire table with
 * a single widget), a StateField would be needed, but that approach has
 * tradeoffs: the user can't edit individual cells.
 *
 * ## Approach: Cell-level rendering
 *
 * Instead of replacing the entire table with a block widget (which makes
 * editing impossible), this plugin:
 * 1. Hides the separator line (|---|---|) entirely
 * 2. Hides pipe characters (|) at cell boundaries
 * 3. Adds cell-level styling (borders, padding)
 * 4. Shows a table badge indicator on the first line
 *
 * This keeps the text editable while providing a visual grid appearance.
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
import { hiddenMark, isCursorInRange } from './shared'
import { checkUpdateAction } from './drag-state'

// ─── Widget: Table Badge ────────────────────────────────────────────────────

class TableBadgeWidget extends WidgetType {
  constructor(readonly cols: number, readonly rows: number) { super() }

  eq(other: TableBadgeWidget) {
    return this.cols === other.cols && this.rows === other.rows
  }

  toDOM(): HTMLElement {
    const badge = document.createElement('span')
    badge.className = 'cm-hybrid-table-badge'
    badge.textContent = `${this.cols}x${this.rows}`
    return badge
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Regex Fallback ─────────────────────────────────────────────────────────

/** Match a table separator line: |---|---| or |:---:|:---:| etc. */
const TABLE_SEPARATOR_RE = /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/

/** Match a table row: | cell | cell | */
const TABLE_ROW_RE = /^\|(.+)\|$/

/** Match the start of a table (header row followed by separator) */
const TABLE_START_RE = /^\|.+\|$/

/**
 * Detect tables using regex when the Lezer tree doesn't have Table nodes.
 * Returns an array of { from, to } ranges for each detected table.
 */
function detectTablesRegex(
  state: EditorState,
  from: number,
  to: number,
): Array<{ from: number; to: number; headerLine: number; separatorLine: number; rowCount: number; colCount: number }> {
  const doc = state.doc
  const tables: Array<{ from: number; to: number; headerLine: number; separatorLine: number; rowCount: number; colCount: number }> = []

  let pos = from
  while (pos <= to) {
    const line = doc.lineAt(pos)
    const lineText = line.text

    // Look for a potential table start (a row starting with |)
    if (TABLE_START_RE.test(lineText)) {
      const nextLineNum = line.number + 1
      if (nextLineNum <= doc.lines) {
        const nextLine = doc.line(nextLineNum)
        if (TABLE_SEPARATOR_RE.test(nextLine.text)) {
          // Found a table! Now find its extent.
          const tableStart = line.from
          const headerLine = line.number
          const separatorLine = nextLine.number
          let tableEnd = nextLine.to
          let rowCount = 2 // header + separator

          // Count columns from the header row
          const colCount = lineText.split('|').filter(c => c.trim() !== '').length

          // Continue scanning for more rows
          let scanLineNum = nextLineNum + 1
          while (scanLineNum <= doc.lines) {
            const scanLine = doc.line(scanLineNum)
            if (TABLE_ROW_RE.test(scanLine.text)) {
              tableEnd = scanLine.to
              rowCount++
              scanLineNum++
            } else {
              break
            }
          }

          tables.push({ from: tableStart, to: tableEnd, headerLine, separatorLine, rowCount, colCount })
          pos = tableEnd + 1
          continue
        }
      }
    }

    pos = line.to + 1
  }

  return tables
}

import type { EditorState } from '@codemirror/state'

// ─── Build Decorations ──────────────────────────────────────────────────────

function buildTableDecorations(view: EditorView): DecorationSet {
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
        if (node.name === 'Table') {
          usedTree = true
          const tableFrom = node.from
          const tableTo = node.to

          // Skip if cursor is inside the table
          if (isCursorInRange(state, tableFrom, tableTo)) return

          // Apply table decorations
          applyTableDecorations(ranges, state, doc, tableFrom, tableTo)
        }
      },
    })
  }

  // If tree had Table nodes, we're done
  if (usedTree && ranges.length > 0) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
  for (const { from, to } of view.visibleRanges) {
    const detectedTables = detectTablesRegex(state, from, to)

    for (const table of detectedTables) {
      // Skip if cursor is inside the table
      if (isCursorInRange(state, table.from, table.to)) continue

      applyTableDecorations(ranges, state, doc, table.from, table.to)
    }
  }

  return Decoration.set(ranges, true)
}

/**
 * Apply visual decorations to a markdown table.
 * This is shared between tree-based and regex-based scanning.
 */
function applyTableDecorations(
  ranges: Range<Decoration>[],
  state: EditorState,
  doc: typeof state.doc,
  tableFrom: number,
  tableTo: number,
): void {
  const firstLine = doc.lineAt(tableFrom)
  const lastLine = doc.lineAt(tableTo)

  let isFirstDataRow = true
  let colCount = 0

  for (let pos = firstLine.from; pos <= lastLine.from;) {
    const line = doc.lineAt(pos)
    const lineText = line.text

    // ── Separator line (|---|---|): hide entirely ──────────────────────
    if (TABLE_SEPARATOR_RE.test(lineText)) {
      ranges.push(
        Decoration.replace({
          widget: new TableBadgeWidget(colCount || 1, 0), // rows counted separately
          block: false,
        }).range(line.from, line.to + 1)
      )
      pos = line.to + 1
      continue
    }

    // ── Table row: style cells and hide pipes ──────────────────────────
    if (TABLE_ROW_RE.test(lineText)) {
      // Line decoration for table row
      ranges.push(
        Decoration.line({
          class: 'cm-hybrid-table-row',
        }).range(line.from)
      )

      // Count columns from first data row (header)
      if (isFirstDataRow) {
        colCount = lineText.split('|').filter((c: string) => c.trim() !== '').length
        isFirstDataRow = false
      }

      // Hide leading |
      const leadingPipe = lineText.match(/^(\|)/)
      if (leadingPipe) {
        ranges.push(hiddenMark.range(line.from, line.from + 1))
      }

      // Hide trailing |
      const trailingPipe = lineText.match(/(\|)\s*$/)
      if (trailingPipe) {
        ranges.push(hiddenMark.range(line.to - 1, line.to))
      }

      // Style cell separators (|) between cells as thin borders
      for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|' && i > 0 && i < lineText.length - 1) {
          const pipePos = line.from + i
          ranges.push(
            Decoration.mark({
              class: 'cm-hybrid-table-separator',
            }).range(pipePos, pipePos + 1)
          )
        }
      }
    }

    pos = line.to + 1
  }

  // Add a table container line decoration on the first line
  ranges.push(
    Decoration.line({
      class: 'cm-hybrid-table',
      attributes: { 'data-table-cols': String(colCount) },
    }).range(firstLine.from)
  )
}

// ─── Plugin Definition ──────────────────────────────────────────────────────

export const tablesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTableDecorations(view)
    }

    update(update: ViewUpdate) {
      const action = checkUpdateAction(update)
      if (action === 'rebuild') {
        this.decorations = buildTableDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)
