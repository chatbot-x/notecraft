/**
 * Frontmatter decoration plugin — StateField implementation.
 *
 * Collapses YAML frontmatter blocks in Live Preview mode, showing a toggle
 * widget instead of the raw YAML. This matches Obsidian's behavior where
 * frontmatter is collapsed by default with a clickable toggle to expand.
 *
 * ## Why StateField?
 *
 * The frontmatter collapse uses `Decoration.replace({ block: true })` which
 * changes the vertical block structure. Block-changing decorations MUST be
 * provided via StateField for correct viewport computation.
 *
 * ## Level 2: Tree-based frontmatter detection
 *
 * With the Lezer Frontmatter extension active, the syntax tree contains
 * `Frontmatter`, `FrontmatterMark`, and `FrontmatterContent` nodes. This
 * plugin now uses the tree to detect frontmatter instead of manual regex
 * line-by-line scanning, which is more reliable and benefits from incremental
 * parsing.
 *
 * Falls back to regex scanning if the tree doesn't contain Frontmatter nodes.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { StateField, StateEffect, type Range, type Transaction } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { isCursorInRange } from './shared'
import { dragSelectingField } from './drag-state'

// ─── Toggle State Effect ──────────────────────────────────────────────────────

/** Effect to toggle frontmatter expanded/collapsed state */
export const toggleFrontmatter = StateEffect.define<void>()

// ─── Widget: Collapsed Frontmatter ────────────────────────────────────────────

class CollapsedFrontmatterWidget extends WidgetType {
  constructor(
    readonly keyCount: number,
    readonly firstKeys: string[],
  ) { super() }

  eq(other: CollapsedFrontmatterWidget) {
    return this.keyCount === other.keyCount &&
      JSON.stringify(this.firstKeys) === JSON.stringify(other.firstKeys)
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-hybrid-frontmatter-collapsed'

    const toggle = document.createElement('span')
    toggle.className = 'cm-hybrid-frontmatter-toggle'
    toggle.textContent = '\u25B8' // ▸ right-pointing triangle

    const label = document.createElement('span')
    label.className = 'cm-hybrid-frontmatter-label'

    if (this.keyCount > 0) {
      const keysDisplay = this.firstKeys.slice(0, 3).join(', ')
      const extra = this.keyCount > 3 ? ` +${this.keyCount - 3} more` : ''
      label.textContent = `properties: ${keysDisplay}${extra}`
    } else {
      label.textContent = 'properties'
    }

    container.appendChild(toggle)
    container.appendChild(label)

    return container
  }

  ignoreEvent(): boolean {
    return false // Allow click to toggle
  }
}

// ─── Widget: Expanded Frontmatter ─────────────────────────────────────────────

class ExpandedFrontmatterWidget extends WidgetType {
  constructor(readonly keyCount: number) { super() }

  eq(other: ExpandedFrontmatterWidget) {
    return this.keyCount === other.keyCount
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-hybrid-frontmatter-expanded'

    const toggle = document.createElement('span')
    toggle.className = 'cm-hybrid-frontmatter-toggle'
    toggle.textContent = '\u25BE' // ▾ down-pointing triangle

    const label = document.createElement('span')
    label.className = 'cm-hybrid-frontmatter-label'
    label.textContent = 'properties'

    container.appendChild(toggle)
    container.appendChild(label)

    return container
  }

  ignoreEvent(): boolean {
    return false
  }
}

// ─── Parse Frontmatter Keys ──────────────────────────────────────────────────

function parseFrontmatterKeys(state: import('@codemirror/state').EditorState, from: number, to: number): string[] {
  const yamlText = state.doc.sliceString(from, to)
  const keys: string[] = []
  const keyRe = /^(\w[\w-]*)\s*:/gm
  let keyMatch: RegExpExecArray | null
  while ((keyMatch = keyRe.exec(yamlText)) !== null) {
    keys.push(keyMatch[1])
  }
  return keys
}

// ─── Find Frontmatter (Tree-based) ───────────────────────────────────────────

interface FrontmatterInfo {
  from: number
  to: number
  keys: string[]
}

function findFrontmatter(state: import('@codemirror/state').EditorState): FrontmatterInfo | null {
  // Try tree-based detection first
  const tree = syntaxTree(state)
  let fmInfo: FrontmatterInfo | null = null

  tree.iterate({
    from: 0,
    to: Math.min(state.doc.length, 5000), // frontmatter is always near doc start
    enter(node) {
      if (node.name === 'Frontmatter') {
        const from = node.from
        const to = node.to

        // Find FrontmatterContent child to extract keys
        let contentFrom = from + 3 // after opening ---
        let contentTo = to - 3 // before closing ---

        node.node.cursor().iterate((child) => {
          if (child.name === 'FrontmatterContent') {
            contentFrom = child.from
            contentTo = child.to
          }
          return false
        })

        const keys = parseFrontmatterKeys(state, contentFrom, contentTo)
        fmInfo = { from, to, keys }
        return // stop iterating
      }
    },
  })

  if (fmInfo) return fmInfo

  // ── Fallback: regex line-by-line scanning ─────────────────────────────────
  const doc = state.doc
  if (doc.length === 0) return null

  const firstLine = doc.line(1)
  const firstLineText = firstLine.text.trimEnd()

  if (firstLineText !== '---') return null

  let endLine = -1
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (line.text.trimEnd() === '---') {
      endLine = i
      break
    }
    if (i > 100) break
  }

  if (endLine === -1) return null

  const endLineObj = doc.line(endLine)
  const from = firstLine.from
  const to = endLineObj.to

  const keys = parseFrontmatterKeys(state, from, to)
  return { from, to, keys }
}

// ─── Build Decorations ────────────────────────────────────────────────────────

function buildFrontmatterDecorations(
  state: import('@codemirror/state').EditorState,
  expanded: boolean,
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const fm = findFrontmatter(state)

  if (!fm) return Decoration.none

  // If cursor is inside the frontmatter, show it raw
  if (isCursorInRange(state, fm.from, fm.to)) {
    const firstLine = state.doc.lineAt(fm.from)
    ranges.push(
      Decoration.line({
        class: 'cm-hybrid-frontmatter-line',
      }).range(firstLine.from)
    )
    return Decoration.set(ranges, true)
  }

  if (expanded) {
    // Show the frontmatter but add an "expanded" header widget before it
    ranges.push(
      Decoration.widget({
        widget: new ExpandedFrontmatterWidget(fm.keys.length),
        block: true,
        side: -1,
      }).range(fm.from)
    )
    // Add line decorations to all frontmatter lines
    for (let pos = fm.from; pos <= fm.to; ) {
      const line = state.doc.lineAt(pos)
      ranges.push(
        Decoration.line({
          class: 'cm-hybrid-frontmatter-line',
        }).range(line.from)
      )
      pos = line.to + 1
    }
  } else {
    // Collapsed — replace the entire frontmatter with a collapsed widget
    ranges.push(
      Decoration.replace({
        widget: new CollapsedFrontmatterWidget(fm.keys.length, fm.keys.slice(0, 3)),
        block: true,
      }).range(fm.from, fm.to + 1)
    )
  }

  return Decoration.set(ranges, true)
}

// ─── StateField ───────────────────────────────────────────────────────────────

/**
 * StateField tracking whether the frontmatter is expanded.
 * Starts collapsed (matching Obsidian default behavior).
 */
const frontmatterExpandedField = StateField.define<boolean>({
  create() { return false },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleFrontmatter)) return !value
    }
    return value
  },
})

/**
 * StateField for frontmatter decorations.
 */
export const frontmatterField = StateField.define<DecorationSet>({
  create(state) {
    return buildFrontmatterDecorations(state, false)
  },
  update(deco, tr) {
    const expanded = tr.state.field(frontmatterExpandedField, false) ?? false

    // Check for toggle effect
    for (const effect of tr.effects) {
      if (effect.is(toggleFrontmatter)) {
        return buildFrontmatterDecorations(tr.state, expanded)
      }
    }

    // Check update action
    const action = checkFieldAction(tr)
    if (action === 'rebuild') {
      return buildFrontmatterDecorations(tr.state, expanded)
    }
    if (tr.docChanged) {
      return buildFrontmatterDecorations(tr.state, expanded)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

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

/**
 * Extension that handles clicks on the frontmatter toggle widget.
 */
export const frontmatterClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement
    const toggleEl = target.closest('.cm-hybrid-frontmatter-toggle') ||
      target.closest('.cm-hybrid-frontmatter-collapsed') ||
      target.closest('.cm-hybrid-frontmatter-expanded')

    if (toggleEl) {
      view.dispatch({ effects: toggleFrontmatter.of(undefined) })
      return true
    }
    return false
  },
})

/**
 * Combined frontmatter extension — includes the expanded state field,
 * decoration field, and click handler.
 */
export const frontmatterPlugin = [
  frontmatterExpandedField,
  frontmatterField,
  frontmatterClickHandler,
] as const
