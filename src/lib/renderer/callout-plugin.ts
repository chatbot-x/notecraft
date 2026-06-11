/**
 * Custom markdown-it plugin for Obsidian-style callouts / admonitions.
 *
 * Supports the syntax:
 *   > [!note] Title here
 *   > Content of the callout
 *
 * Recognized types: note, info, tip, success, question, warning,
 * failure, danger, bug, example, quote, abstract, todo
 *
 * Any unrecognized type falls back to "note" style.
 *
 * This plugin extends markdown-it-container internally.
 */

import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'

export type CalloutType =
  | 'note'
  | 'info'
  | 'tip'
  | 'success'
  | 'question'
  | 'warning'
  | 'failure'
  | 'danger'
  | 'bug'
  | 'example'
  | 'quote'
  | 'abstract'
  | 'todo'

const CALLOUT_TYPES: Record<string, { icon: string; colorVar: string } | undefined> = {
  note:      { icon: '\u270E',  colorVar: 'callout-note' },
  info:      { icon: '\u2139',  colorVar: 'callout-info' },
  tip:       { icon: '\u261D',  colorVar: 'callout-tip' },
  success:   { icon: '\u2714',  colorVar: 'callout-success' },
  question:  { icon: '\u2753',  colorVar: 'callout-question' },
  warning:   { icon: '\u26A0',  colorVar: 'callout-warning' },
  failure:   { icon: '\u2718',  colorVar: 'callout-failure' },
  danger:    { icon: '\u26D4',  colorVar: 'callout-danger' },
  bug:       { icon: '\u{1F41B}', colorVar: 'callout-bug' },
  example:   { icon: '\u{1F4CB}', colorVar: 'callout-example' },
  quote:     { icon: '\u275D',  colorVar: 'callout-quote' },
  abstract:  { icon: '\u{1F4D1}', colorVar: 'callout-abstract' },
  todo:      { icon: '\u{1F4DD}', colorVar: 'callout-todo' },
}

// Regex to match > [!type] optional title
const CALLOUT_RE = /^\[!(\w+)\]\s*(.*)$/

export default function calloutPlugin(md: MarkdownIt): void {
  // We use markdown-it-container with a custom validate/render pair
  container(md, 'callout', {
    validate(params: string): boolean {
      return CALLOUT_RE.test(params.trim())
    },
    render(tokens: MarkdownIt.Token[], idx: number): string {
      const token = tokens[idx]
      const m = token.info.trim().match(CALLOUT_RE)

      if (!m) return ''

      const type = m[1].toLowerCase()
      const title = m[2].trim()
      const meta = CALLOUT_TYPES[type] ?? CALLOUT_TYPES['note']!
      const displayType = CALLOUT_TYPES[type] ? type : 'note'

      if (token.nesting === 1) {
        // Opening tag
        const titleHtml = title
          ? `<div class="callout-title"><span class="callout-icon">${meta.icon}</span><span class="callout-title-text">${md.utils.escapeHtml(title)}</span></div>`
          : `<div class="callout-title"><span class="callout-icon">${meta.icon}</span><span class="callout-title-text">${md.utils.escapeHtml(displayType.charAt(0).toUpperCase() + displayType.slice(1))}</span></div>`

        return `<div class="callout callout-${displayType}" data-callout="${displayType}">\n${titleHtml}\n<div class="callout-content">\n`
      } else {
        // Closing tag
        return '</div>\n</div>\n'
      }
    },
  })
}
