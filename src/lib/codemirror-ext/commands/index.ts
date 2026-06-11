/**
 * codemirror-ext: Markdown Commands
 *
 * Improved markdown editing commands for CodeMirror 6.
 * Based on yeliex/codemirror-markdown-commands with enhancements:
 * - Toggle support (wrap/unwrap) for inline formatting
 * - Smart cursor placement (selects wrapped text)
 * - Code inline/block commands
 * - Horizontal rule command
 * - Improved heading cycling
 * - Document formatting via Prettier (built-in markdown parser)
 */

import { EditorSelection, type ChangeSpec } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import * as prettier from 'prettier'

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Wrap the selection with a prefix/suffix string.
 * If already wrapped, unwrap instead (toggle behavior).
 */
function wrapSelection(
  prefix: string,
  suffix: string = prefix,
  view: Parameters<Command>[0],
): boolean {
  const { state } = view
  const main = state.selection.main

  // Check if already wrapped — toggle off
  if (
    main.from >= prefix.length &&
    state.sliceDoc(main.from - prefix.length, main.from) === prefix &&
    state.sliceDoc(main.to, main.to + suffix.length) === suffix
  ) {
    view.dispatch(
      state.changeByRange((range) => ({
        changes: [
          { from: range.from - prefix.length, to: range.from },
          { from: range.to, to: range.to + suffix.length },
        ],
        range: EditorSelection.range(range.from - prefix.length, range.to - suffix.length),
      })),
    )
    view.focus()
    return true
  }

  // Wrap selection
  view.dispatch(
    state.changeByRange((range) => {
      const selectedText = state.sliceDoc(range.from, range.to)
      return {
        changes: [
          { from: range.from, insert: prefix },
          { from: range.to, insert: suffix },
        ],
        range: selectedText
          ? EditorSelection.range(range.from + prefix.length, range.to + prefix.length)
          : EditorSelection.cursor(range.from + prefix.length),
      }
    }),
  )
  view.focus()
  return true
}

/**
 * Insert text at the current cursor, replacing selection if any.
 */
function insertText(text: string, view: Parameters<Command>[0], cursorOffset?: number): boolean {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const offset = cursorOffset ?? text.length
      return {
        changes: [{ from: range.from, to: range.to, insert: text }],
        range: EditorSelection.cursor(range.from + offset),
      }
    }),
  )
  view.focus()
  return true
}

// ─── Inline Formatting ──────────────────────────────────────────────────────────

/** Toggle **bold** around selection */
export const bold: Command = (view) => wrapSelection('**', '**', view)

/** Toggle *italic* around selection */
export const italic: Command = (view) => wrapSelection('*', '*', view)

/** Toggle ~~strikethrough~~ around selection */
export const strikethrough: Command = (view) => wrapSelection('~~', '~~', view)

/** Toggle `inline code` around selection */
export const inlineCode: Command = (view) => wrapSelection('`', '`', view)

/** Toggle <u>underline</u> around selection (HTML) */
export const underline: Command = (view) => wrapSelection('<u>', '</u>', view)

/** Toggle ==highlight== around selection (extended markdown) */
export const highlight: Command = (view) => wrapSelection('==', '==', view)

// ─── Headings ───────────────────────────────────────────────────────────────────

/**
 * Create a heading toggle command for a given level.
 * If the line is already that heading level, remove the heading.
 * If it's a different heading level, replace with the new level.
 */
export const createHeading = (level: 1 | 2 | 3 | 4 | 5 | 6): Command => {
  const prefix = '#'.repeat(level) + ' '
  return (view) => {
    const { state } = view
    view.dispatch(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from)
        const headingMatch = line.text.match(/^(#{1,6}) /)

        let newContent: string
        if (headingMatch && headingMatch[1] === '#'.repeat(level)) {
          // Same level — remove heading
          newContent = line.text.replace(/^#{1,6} /, '')
        } else if (headingMatch) {
          // Different heading level — replace
          newContent = prefix + line.text.replace(/^#{1,6} /, '')
        } else {
          // No heading — add
          newContent = prefix + line.text
        }

        const diff = newContent.length - line.text.length
        return {
          changes: { from: line.from, to: line.to, insert: newContent },
          range: EditorSelection.range(
            range.anchor + diff,
            range.head + diff,
          ),
        }
      }),
    )
    view.focus()
    return true
  }
}

export const h1 = createHeading(1)
export const h2 = createHeading(2)
export const h3 = createHeading(3)
export const h4 = createHeading(4)
export const h5 = createHeading(5)
export const h6 = createHeading(6)

// ─── Block Formatting ───────────────────────────────────────────────────────────

/** Toggle blockquote (`> `) on selected lines */
export const blockquote: Command = (view) => {
  const { state } = view
  const { doc } = state

  view.dispatch(
    state.changeByRange((range) => {
      const startLine = doc.lineAt(range.from)
      const text = doc.slice(range.from, range.to)
      const lineCount = text.lines || 1
      const changes: ChangeSpec[] = []
      let selStart = range.from
      let selLen = range.to - range.from

      for (let i = 0; i < lineCount; i++) {
        const line = doc.line(startLine.number + i)
        if (line.text.startsWith('> ')) {
          // Remove blockquote
          changes.push({ from: line.from, to: line.from + 2, insert: '' })
          if (i === 0) selStart -= 2
          else selLen -= 2
        } else {
          // Add blockquote
          changes.push({ from: line.from, insert: '> ' })
          if (i === 0) selStart += 2
          else selLen += 2
        }
      }

      return {
        changes,
        range: EditorSelection.range(selStart, selStart + selLen),
      }
    }),
  )
  view.focus()
  return true
}

type ListType = 'ul' | 'ol' | 'todo'

const getListPrefix = (type: ListType, index?: number): string => {
  switch (type) {
    case 'ul': return '- '
    case 'ol': return `${index ?? 1}. `
    case 'todo': return '- [ ] '
  }
}

const detectListType = (text: string): ListType | null => {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) return 'todo'
  if (trimmed.startsWith('- ')) return 'ul'
  if (/^\d+\. /.test(trimmed)) return 'ol'
  return null
}

/** Create a list toggle command */
export const createList = (type: ListType): Command => {
  return (view) => {
    const { state } = view
    const { doc } = state
    let olIndex = 1

    view.dispatch(
      state.changeByRange((range) => {
        const startLine = doc.lineAt(range.from)
        const text = doc.slice(range.from, range.to)
        const lineCount = text.lines || 1
        const changes: ChangeSpec[] = []
        let selStart = range.from
        let selLen = range.to - range.from

        for (let i = 0; i < lineCount; i++) {
          const line = doc.line(startLine.number + i)
          const currentType = detectListType(line.text)

          if (currentType === type) {
            // Same type — remove list prefix
            const prefixMatch = line.text.match(/^(\s*)(- \[[ x ]] |- |\d+\. )/)
            if (prefixMatch) {
              const removed = prefixMatch[2].length
              changes.push({
                from: line.from + prefixMatch[1].length,
                to: line.from + prefixMatch[1].length + removed,
                insert: '',
              })
              if (i === 0) selStart -= removed
              else selLen -= removed
            }
          } else {
            // Replace existing list prefix or add new one
            const prefixMatch = line.text.match(/^(\s*)(- \[[ x ]] |- |\d+\. )/)
            const prefix = getListPrefix(type, type === 'ol' ? olIndex++ : undefined)

            if (prefixMatch) {
              const oldLen = prefixMatch[2].length
              const diff = prefix.length - oldLen
              changes.push({
                from: line.from + prefixMatch[1].length,
                to: line.from + prefixMatch[1].length + oldLen,
                insert: prefix,
              })
              if (i === 0) selStart += diff
              else selLen += diff
            } else {
              changes.push({ from: line.from, insert: prefix })
              if (i === 0) selStart += prefix.length
              else selLen += prefix.length
            }
          }
        }

        return {
          changes,
          range: EditorSelection.range(selStart, selStart + selLen),
        }
      }),
    )
    view.focus()
    return true
  }
}

/** Toggle unordered list */
export const unorderedList: Command = createList('ul')

/** Toggle ordered list */
export const orderedList: Command = createList('ol')

/** Toggle todo/checkbox list */
export const todoList: Command = createList('todo')

// ─── Insert Commands ────────────────────────────────────────────────────────────

/** Insert a link: [text](url) with smart cursor placement */
export const link: Command = (view) => {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      if (text) {
        return {
          changes: [{ from: range.from, to: range.to, insert: `[${text}](url)` }],
          range: EditorSelection.range(range.from + text.length + 3, range.from + text.length + 6),
        }
      }
      return {
        changes: [{ from: range.from, insert: '[text](url)' }],
        range: EditorSelection.range(range.from + 1, range.from + 5),
      }
    }),
  )
  view.focus()
  return true
}

/** Insert an image: ![alt](url) with smart cursor placement */
export const image: Command = (view) => {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      if (text) {
        return {
          changes: [{ from: range.from, to: range.to, insert: `![${text}](url)` }],
          range: EditorSelection.range(range.from + text.length + 4, range.from + text.length + 7),
        }
      }
      return {
        changes: [{ from: range.from, insert: '![alt](url)' }],
        range: EditorSelection.range(range.from + 2, range.from + 5),
      }
    }),
  )
  view.focus()
  return true
}

/** Insert a code block: ```\ncode\n``` */
export const codeBlock: Command = (view) => {
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      if (text) {
        return {
          changes: [{ from: range.from, to: range.to, insert: `\`\`\`\n${text}\n\`\`\`` }],
          range: EditorSelection.range(range.from + 4, range.from + 4 + text.length),
        }
      }
      return {
        changes: [{ from: range.from, insert: '```\ncode\n```' }],
        range: EditorSelection.range(range.from + 4, range.from + 8),
      }
    }),
  )
  view.focus()
  return true
}

/** Insert a horizontal rule: --- */
export const horizontalRule: Command = (view) => insertText('\n---\n', view, 5)

/** Insert a table template */
export const table: Command = (view) => {
  const template = '\n| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n'
  return insertText(template, view, 2)
}

// ─── Document Formatting ─────────────────────────────────────────────────────

export interface FormatDocumentOptions {
  /** Print width for formatting (default: 80) */
  printWidth?: number
  /** Use single quotes where possible (default: false) */
  singleQuote?: boolean
  /** Prose wrapping mode: 'always' | 'never' | 'preserve' (default: 'preserve') */
  proseWrap?: 'always' | 'never' | 'preserve'
}

/**
 * Format the entire markdown document using Prettier's built-in markdown parser.
 * No additional plugins needed — Prettier 3.x includes markdown support natively.
 *
 * What Prettier's markdown formatter does:
 * - Normalizes whitespace and line breaks
 * - Pads Markdown tables with alignment spaces
 * - Standardizes list markers (1. → 1.)
 * - Removes trailing whitespace
 * - Adds/removes blank lines between blocks per CommonMark spec
 * - Normalizes code block language identifiers
 * - Consistent indentation in nested structures
 * - Preserves the meaning of your content (pure formatting, no rewriting)
 *
 * Usage:
 * ```ts
 * import { formatDocument } from '@/lib/codemirror-ext'
 *
 * // As a keyboard shortcut
 * keymap.of([{ key: 'Ctrl+Shift+F', run: formatDocument }])
 *
 * // Or call directly
 * formatDocument(view)
 * ```
 */
export const formatDocument: Command = (view): boolean => {
  const { state } = view
  const content = state.doc.toString()
  const cursorPos = state.selection.main.head

  // Track the line the cursor is on before formatting
  const cursorLine = state.doc.lineAt(cursorPos)
  const cursorLineText = cursorLine.text
  const cursorColumn = cursorPos - cursorLine.from

  // Prettier v3 returns a Promise — fire and forget
  prettier.format(content, {
    parser: 'markdown',
    printWidth: 80,
    proseWrap: 'preserve',
  }).then((formatted) => {
    // If nothing changed, skip
    if (formatted === content) {
      view.focus()
      return
    }

    // Find the line that best matches the cursor's original line
    const lines = formatted.split('\n')
    let bestLine = Math.min(cursorLine.number - 1, lines.length - 1)
    if (cursorLineText.trim()) {
      const searchStart = Math.max(0, cursorLine.number - 3)
      const searchEnd = Math.min(lines.length, cursorLine.number + 3)
      for (let i = searchStart; i < searchEnd; i++) {
        if (lines[i] && lines[i].includes(cursorLineText.trim().slice(0, 30))) {
          bestLine = i
          break
        }
      }
    }

    // Replace the entire document with formatted content
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
      // Restore cursor to the matching line and column
      selection: (() => {
        const targetLine = bestLine + 1
        const totalLines = view.state.doc.lines
        const linePos = view.state.doc.line(targetLine > totalLines ? totalLines : targetLine)
        const col = Math.min(cursorColumn, linePos.text.length)
        return EditorSelection.cursor(linePos.from + col)
      })(),
    })

    view.focus()
  }).catch((err) => {
    console.warn('Markdown formatting failed:', err)
    view.focus()
  })

  return true
}

/**
 * Create a formatDocument command with custom Prettier options.
 */
export function createFormatCommand(options: FormatDocumentOptions): Command {
  return (view): boolean => {
    const { state } = view
    const content = state.doc.toString()
    const cursorPos = state.selection.main.head
    const cursorLine = state.doc.lineAt(cursorPos)
    const cursorLineText = cursorLine.text
    const cursorColumn = cursorPos - cursorLine.from

    prettier.format(content, {
      parser: 'markdown',
      printWidth: options.printWidth ?? 80,
      proseWrap: options.proseWrap ?? 'preserve',
    }).then((formatted) => {
      if (formatted === content) {
        view.focus()
        return
      }

      const lines = formatted.split('\n')
      let bestLine = Math.min(cursorLine.number - 1, lines.length - 1)
      if (cursorLineText.trim()) {
        const searchStart = Math.max(0, cursorLine.number - 3)
        const searchEnd = Math.min(lines.length, cursorLine.number + 3)
        for (let i = searchStart; i < searchEnd; i++) {
          if (lines[i] && lines[i].includes(cursorLineText.trim().slice(0, 30))) {
            bestLine = i
            break
          }
        }
      }

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
        selection: (() => {
          const targetLine = bestLine + 1
          const totalLines = view.state.doc.lines
          const linePos = view.state.doc.line(targetLine > totalLines ? totalLines : targetLine)
          const col = Math.min(cursorColumn, linePos.text.length)
          return EditorSelection.cursor(linePos.from + col)
        })(),
      })

      view.focus()
    }).catch((err) => {
      console.warn('Markdown formatting failed:', err)
      view.focus()
    })

    return true
  }
}
