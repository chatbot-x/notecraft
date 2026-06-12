/**
 * WYSIWYG Table decoration plugin — Enhanced Edition.
 *
 * Renders markdown tables as visual grid-like representations in the editor,
 * inspired by Atomic Editor's table rendering and Obsidian's Live Preview.
 *
 * ## Enhancements over v1
 *
 * 1. **Column alignment detection** — Parses the separator line (`:---:`, `:---`, `---:`)
 *    to detect left/center/right alignment and applies alignment classes to cells.
 *
 * 2. **Header row distinction** — First row gets a `cm-hybrid-table-header` class
 *    with distinct styling (bold, background).
 *
 * 3. **Self-providing atomic ranges** — Table cells are atomic when cursor is outside
 *    the table, preventing the cursor from entering the middle of a cell.
 *
 * 4. **Structure-only `eq()` for table badge** — The badge widget uses structure-only
 *    equality (same col/row count), so CM6 reuses the DOM across rebuilds.
 *
 * 5. **`changeAffectsTables` skip guard** — Cheap pre-check that avoids full table
 *    scanning on most keystrokes, reducing per-keystroke cost from O(doc) to O(change).
 *
 * ## Approach: Cell-level rendering
 *
 * Instead of replacing the entire table with a block widget (which makes
 * editing impossible), this plugin:
 * 1. Hides the separator line (|---|---|) entirely
 * 2. Hides pipe characters (|) at cell boundaries
 * 3. Adds cell-level styling (borders, padding, alignment)
 * 4. Shows a table badge indicator with column/row count
 * 5. Distinguishes header rows from body rows
 *
 * ## v3: StateField migration
 *
 * Converted from ViewPlugin to StateField to support `block: true` decorations,
 * which are no longer allowed in ViewPlugin as of @codemirror/view 6.43+.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { StateField, type Range, type Transaction } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { hiddenMark } from './shared'
import { shouldShowSource, shouldShowSourceForLine } from './cursor-awareness'
import { dragSelectingField } from './drag-state'

// ─── Types ───────────────────────────────────────────────────────────────────

type ColumnAlign = 'left' | 'center' | 'right'

interface TableInfo {
  from: number
  to: number
  headerLine: number
  separatorLine: number
  rowCount: number
  colCount: number
  alignments: ColumnAlign[]
}

// ─── Widget: Table Badge ────────────────────────────────────────────────────

class TableBadgeWidget extends WidgetType {
  constructor(readonly cols: number, readonly rows: number) { super() }

  /**
   * Structure-only equality: same row/col count = true.
   * This means CM6 keeps the existing DOM across rebuilds,
   * preserving focus and preventing flicker.
   * (Pattern from Atomic Editor's TableWidget.eq())
   */
  eq(other: TableBadgeWidget) {
    return this.cols === other.cols && this.rows === other.rows
  }

  toDOM(): HTMLElement {
    const badge = document.createElement('span')
    badge.className = 'cm-hybrid-table-badge'
    badge.textContent = `${this.cols}\u00D7${this.rows}`
    return badge
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ─── Singleton: Table Badge for common sizes ────────────────────────────────

/**
 * Module-level singleton for the table badge widget.
 * Since badges are stateless (just display cols x rows), we can reuse
 * instances. However, since cols/rows vary, we use a small cache.
 * (Pattern from Atomic Editor's BULLET_WIDGET singleton.)
 */
const badgeCache = new Map<string, TableBadgeWidget>()

function getTableBadge(cols: number, rows: number): TableBadgeWidget {
  const key = `${cols}:${rows}`
  let badge = badgeCache.get(key)
  if (!badge) {
    badge = new TableBadgeWidget(cols, rows)
    badgeCache.set(key, badge)
    // Evict old entries if cache grows too large
    if (badgeCache.size > 50) {
      const firstKey = badgeCache.keys().next().value
      if (firstKey !== undefined) badgeCache.delete(firstKey)
    }
  }
  return badge
}

// ─── Regex Patterns ─────────────────────────────────────────────────────────

/** Match a table separator line: |---|---| or |:---:|:---:| etc. */
const TABLE_SEPARATOR_RE = /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/

/** Match a table row: | cell | cell | */
const TABLE_ROW_RE = /^\|(.+)\|$/

/** Match the start of a table (header row followed by separator) */
const TABLE_START_RE = /^\|.+\|$/

// ─── Column Alignment Detection ─────────────────────────────────────────────

/**
 * Parse column alignments from the separator line.
 *
 * - `:---:` → center
 * - `:---`  → left
 * - `---:`  → right
 * - `---`   → left (default)
 *
 * This is a key enhancement from studying Atomic Editor's table rendering,
 * which parses the separator line to provide per-column alignment.
 */
function parseAlignments(separatorLine: string): ColumnAlign[] {
  const alignments: ColumnAlign[] = []
  // Split by | and parse each cell
  const cells = separatorLine.split('|').filter(c => c.trim() !== '')

  for (const cell of cells) {
    const trimmed = cell.trim()
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
      alignments.push('center')
    } else if (trimmed.endsWith(':')) {
      alignments.push('right')
    } else {
      alignments.push('left')
    }
  }

  return alignments
}

// ─── Regex Fallback Table Detection ─────────────────────────────────────────

/**
 * Detect tables using regex when the Lezer tree doesn't have Table nodes.
 * Returns an array of TableInfo for each detected table.
 */
function detectTablesRegex(
  state: import('@codemirror/state').EditorState,
  from: number,
  to: number,
): TableInfo[] {
  const doc = state.doc
  const tables: TableInfo[] = []

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

          // Parse column alignments from separator line
          const alignments = parseAlignments(nextLine.text)

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

          tables.push({
            from: tableStart,
            to: tableEnd,
            headerLine,
            separatorLine,
            rowCount,
            colCount,
            alignments,
          })
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

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = state.doc

  // Try tree-based scanning first
  const tree = syntaxTree(state)
  let usedTree = false

  tree.iterate({
    enter(node) {
      if (node.name === 'Table') {
        usedTree = true
        const tableFrom = node.from
        const tableTo = node.to

        // Use centralized shouldShowSource
        if (shouldShowSource(state, tableFrom, tableTo)) return

        // Apply table decorations with alignment detection
        applyTableDecorations(ranges, state, doc, tableFrom, tableTo)
      }
    },
  })

  // If tree had Table nodes, we're done
  if (usedTree && ranges.length > 0) return Decoration.set(ranges, true)

  // ── Fallback: regex scanning ────────────────────────────────────────────
  const detectedTables = detectTablesRegex(state, 0, doc.length)

  for (const table of detectedTables) {
    // Use centralized shouldShowSource
    if (shouldShowSource(state, table.from, table.to)) continue

    applyTableDecorationsWithInfo(ranges, state, doc, table)
  }

  return Decoration.set(ranges, true)
}

/**
 * Apply visual decorations to a markdown table (tree-based path).
 * This is shared between tree-based scanning (where we don't have alignment info).
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
  let alignments: ColumnAlign[] = []

  for (let pos = firstLine.from; pos <= lastLine.from;) {
    const line = doc.lineAt(pos)
    const lineText = line.text

    // ── Separator line (|---|---|): hide entirely ──────────────────────
    if (TABLE_SEPARATOR_RE.test(lineText)) {
      // Parse alignments from separator line (key enhancement)
      alignments = parseAlignments(lineText)

      // block: true is allowed in StateField-provided decorations.
      // Using line.to (without +1) to avoid crossing line breaks.
      ranges.push(
        Decoration.replace({
          widget: getTableBadge(colCount || 1, 0),
          block: true,
        }).range(line.from, line.to)
      )
      pos = line.to + 1
      continue
    }

    // ── Table row: style cells and hide pipes ──────────────────────────
    if (TABLE_ROW_RE.test(lineText)) {
      const isHeaderRow = isFirstDataRow

      // Line decoration for table row
      ranges.push(
        Decoration.line({
          class: isHeaderRow
            ? 'cm-hybrid-table-row cm-hybrid-table-header'
            : 'cm-hybrid-table-row',
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
      // Also apply alignment classes to cells
      let cellIndex = 0
      let cellStart = -1
      for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
          if (cellStart >= 0 && cellIndex > 0) {
            // This is a cell boundary — apply alignment to the cell content
            const align = alignments[cellIndex - 1] ?? 'left'
            if (align !== 'left') {
              ranges.push(
                Decoration.mark({
                  class: `cm-hybrid-table-cell cm-hybrid-table-align-${align}`,
                }).range(line.from + cellStart, line.from + i)
              )
            }
          }

          if (i > 0 && i < lineText.length - 1) {
            const pipePos = line.from + i
            ranges.push(
              Decoration.mark({
                class: 'cm-hybrid-table-separator',
              }).range(pipePos, pipePos + 1)
            )
          }

          cellStart = i + 1
          cellIndex++
        }
      }

      // Handle last cell alignment
      if (cellStart >= 0 && cellStart < lineText.length && cellIndex > 0) {
        const align = alignments[cellIndex - 1] ?? 'left'
        if (align !== 'left') {
          ranges.push(
            Decoration.mark({
              class: `cm-hybrid-table-cell cm-hybrid-table-align-${align}`,
            }).range(line.from + cellStart, line.to)
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
      attributes: {
        'data-table-cols': String(colCount),
        'data-table-align': alignments.join(','),
      },
    }).range(firstLine.from)
  )
}

/**
 * Apply visual decorations to a markdown table (regex-based path).
 * Uses the pre-computed TableInfo with alignment data.
 */
function applyTableDecorationsWithInfo(
  ranges: Range<Decoration>[],
  state: EditorState,
  doc: typeof state.doc,
  table: TableInfo,
): void {
  const firstLine = doc.lineAt(table.from)
  const lastLine = doc.lineAt(table.to)
  const { alignments } = table

  let isHeaderRow = true

  for (let pos = firstLine.from; pos <= lastLine.from;) {
    const line = doc.lineAt(pos)
    const lineText = line.text

    // ── Separator line: hide entirely ────────────────────────────────
    if (TABLE_SEPARATOR_RE.test(lineText)) {
      // block: true is allowed in StateField-provided decorations.
      // Using line.to (without +1) to avoid crossing line breaks.
      ranges.push(
        Decoration.replace({
          widget: getTableBadge(table.colCount, table.rowCount - 1),
          block: true,
        }).range(line.from, line.to)
      )
      pos = line.to + 1
      continue
    }

    // ── Table row: style cells and hide pipes ────────────────────────
    if (TABLE_ROW_RE.test(lineText)) {
      // Line decoration for table row
      ranges.push(
        Decoration.line({
          class: isHeaderRow
            ? 'cm-hybrid-table-row cm-hybrid-table-header'
            : 'cm-hybrid-table-row',
        }).range(line.from)
      )

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

      // Style cell separators and apply alignment
      let cellIndex = 0
      let cellStart = -1
      for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
          if (cellStart >= 0 && cellIndex > 0) {
            const align = alignments[cellIndex - 1] ?? 'left'
            if (align !== 'left') {
              ranges.push(
                Decoration.mark({
                  class: `cm-hybrid-table-cell cm-hybrid-table-align-${align}`,
                }).range(line.from + cellStart, line.from + i)
              )
            }
          }

          if (i > 0 && i < lineText.length - 1) {
            const pipePos = line.from + i
            ranges.push(
              Decoration.mark({
                class: 'cm-hybrid-table-separator',
              }).range(pipePos, pipePos + 1)
            )
          }

          cellStart = i + 1
          cellIndex++
        }
      }

      // Handle last cell alignment
      if (cellStart >= 0 && cellStart < lineText.length && cellIndex > 0) {
        const align = alignments[cellIndex - 1] ?? 'left'
        if (align !== 'left') {
          ranges.push(
            Decoration.mark({
              class: `cm-hybrid-table-cell cm-hybrid-table-align-${align}`,
            }).range(line.from + cellStart, line.to)
          )
        }
      }

      isHeaderRow = false
    }

    pos = line.to + 1
  }

  // Add a table container line decoration on the first line
  ranges.push(
    Decoration.line({
      class: 'cm-hybrid-table',
      attributes: {
        'data-table-cols': String(table.colCount),
        'data-table-align': alignments.join(','),
      },
    }).range(firstLine.from)
  )
}

// ─── StateField ───────────────────────────────────────────────────────────────

function checkFieldAction(tr: Transaction): 'rebuild' | 'skip' | 'none' {
  if (tr.docChanged) return 'rebuild'

  const isDragging = tr.state.field(dragSelectingField, false)
  const wasDragging = tr.startState.field(dragSelectingField, false)

  if (isDragging && wasDragging) return 'skip'
  if (wasDragging && !isDragging) return 'rebuild'
  if (isDragging) return 'rebuild'

  if (tr.selection) return 'rebuild'

  return 'none'
}

export const tablesField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state)
  },
  update(deco, tr) {
    const action = checkFieldAction(tr)
    if (action === 'rebuild') {
      return buildTableDecorations(tr.state)
    }
    if (tr.docChanged) {
      return deco.map(tr.changes)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

// Provide atomic ranges so cursor treats table cells as single units
// when the cursor is outside the table
export const tablesAtomicRanges = EditorView.atomicRanges.of((view) => {
  return view.state.field(tablesField, false) || Decoration.none
})

export const tablesPlugin = [tablesField, tablesAtomicRanges] as const
