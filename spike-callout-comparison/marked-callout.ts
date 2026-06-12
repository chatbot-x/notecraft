/**
 * SPIKE 1: Marked.js Callout Extension
 *
 * Obsidian callout syntax:
 *   > [!note] Title
 *   > Content
 *   > [!warning]+ Foldable expanded
 *   > [!danger]- Foldable collapsed
 *   > > [!tip] Nested callout
 *
 * Key insight from debugging: Marked's block extension API DOES run before
 * the built-in blockquote tokenizer. The tokenizer receives the full source
 * starting at the `> [!` position. We must correctly parse the callout header
 * and consume all continuation lines.
 *
 * CRITICAL CHALLENGE: Obsidian callouts ARE blockquotes with metadata.
 * Marked's blockquote tokenizer already handles `>` continuation, nesting,
 * and multi-paragraph bodies. Our custom tokenizer must REIMPLEMENT all of
 * this because we intercept before the blockquote tokenizer.
 */

import { Marked, type TokenizerAndRendererExtension } from 'marked'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalloutMeta {
  icon: string
  color: string
}

interface ParsedCallout {
  type: string
  resolvedType: string
  title: string
  isFoldable: boolean
  defaultFolded: boolean
}

// ─── Callout Type Definitions ─────────────────────────────────────────────────

const CALLOUT_TYPES: Record<string, CalloutMeta> = {
  note:      { icon: '\u270E',  color: '#448aff' },
  info:      { icon: '\u2139',  color: '#448aff' },
  tip:       { icon: '\u261D',  color: '#00c853' },
  success:   { icon: '\u2714',  color: '#00c853' },
  question:  { icon: '?',       color: '#ffab00' },
  warning:   { icon: '\u26A0',  color: '#ff9100' },
  failure:   { icon: '\u2718',  color: '#ff5252' },
  danger:    { icon: '\u26D4',  color: '#ff1744' },
  bug:       { icon: '\uD83D\uDC1B', color: '#e040fb' },
  example:   { icon: '\uD83D\uDCCB', color: '#7c4dff' },
  quote:     { icon: '\u275D',  color: '#9e9e9e' },
  abstract:  { icon: '\uD83D\uDCD1', color: '#00b8d4' },
  todo:      { icon: '\uD83D\uDCDD', color: '#448aff' },
  important: { icon: '\uD83D\uDD25', color: '#ff9100' },
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

// ─── Callout Header Parsing ───────────────────────────────────────────────────

const CALLOUT_HEADER_RE = /^\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*))?/

function parseCalloutHeader(text: string): ParsedCallout | null {
  const match = text.match(CALLOUT_HEADER_RE)
  if (!match || !match[1]) return null

  const rawType = match[1].toLowerCase().trim()
  const foldableMarker = match[2] || ''
  const rawTitle = (match[3] ?? '').trim()

  const resolvedType = TYPE_ALIASES[rawType] ?? rawType
  const title = rawTitle || resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1)

  return {
    type: rawType,
    resolvedType,
    title,
    isFoldable: foldableMarker === '+' || foldableMarker === '-',
    defaultFolded: foldableMarker === '-',
  }
}

// ─── Marked.js Extension ──────────────────────────────────────────────────────

/**
 * APPROACH A (what we implement here): Block-level tokenizer that intercepts
 * before the built-in blockquote tokenizer. We consume all `> ` continuation
 * lines ourselves, strip the `> ` prefixes, and re-tokenize the body content.
 *
 * APPROACH B (alternative, NOT implemented): Use Marked's `processAllTokens`
 * hook to walk the token stream after lexing and transform blockquote tokens
 * whose first inline content starts with [!TYPE]. This is more like what
 * markdown-it does, but Marked's token structure is less convenient for this.
 */

const calloutExtension: TokenizerAndRendererExtension = {
  name: 'callout',
  level: 'block',

  /**
   * The `start` function tells Marked's paragraph tokenizer where to stop,
   * so our custom tokenizer gets a chance to match on the next iteration.
   * Only relevant when `> [!` appears inside a paragraph (unlikely but possible).
   */
  start(src: string) {
    return src.match(/>\s*\[!/)?.index
  },

  tokenizer(this: any, src: string): any {
    // Must start with `> ` followed by `[!`
    // Use the `m` flag so `$` matches end of first line
    const headerMatch = src.match(/^>[ \t]+\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/m)
    if (!headerMatch || headerMatch.index !== 0) return undefined

    // Parse the callout header from the [!TYPE]+- Title portion
    const headerText = `[!${headerMatch[1]}]${headerMatch[2] || ''}${headerMatch[3] ? ' ' + headerMatch[3] : ''}`
    const parsed = parseCalloutHeader(headerText)
    if (!parsed) return undefined

    // Consume continuation lines that are part of this blockquote
    const lines = src.split('\n')
    const consumedLines: string[] = [lines[0]]

    let i = 1
    let sawBlankLine = false

    while (i < lines.length) {
      const line = lines[i]

      // Line starting with `> [!` after a blank line = NEW callout, stop here
      if (sawBlankLine && line.match(/^>[ \t]+\[!/)) {
        break
      }

      // Line starting with `> ` — continuation of the callout
      if (line.match(/^>[ \t]/)) {
        consumedLines.push(line)
        sawBlankLine = false
        i++
        continue
      }

      // Line that is just `>` — empty line in blockquote (paragraph separator)
      if (line === '>') {
        consumedLines.push(line)
        sawBlankLine = false
        i++
        continue
      }

      // Empty line — might be between paragraphs inside the callout
      // Include it only if the next line continues the blockquote
      // BUT: if the next line is `> [!` it's a NEW callout, not continuation
      if (line.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^>[ \t]/)) {
        // Check if next line starts a new callout
        if (lines[i + 1].match(/^>[ \t]+\[!/)) {
          break
        }
        consumedLines.push(line)
        sawBlankLine = true
        i++
        continue
      }

      // Any other line ends the callout
      break
    }

    const raw = consumedLines.join('\n')

    // Extract body: strip `> ` prefix from each continuation line
    const bodyLines = consumedLines.slice(1).map(line => {
      if (line.match(/^>[ \t]/)) return line.slice(2)
      if (line === '>') return ''
      return line
    })

    const bodyText = bodyLines.join('\n').trim()

    // Re-tokenize the body as block-level content
    // (handles paragraphs, nested blockquotes, lists, etc.)
    const bodyTokens = bodyText ? this.lexer.blockTokens(bodyText) : []

    return {
      type: 'callout',
      raw,
      calloutType: parsed.resolvedType,
      calloutRawType: parsed.type,
      calloutTitle: parsed.title,
      isFoldable: parsed.isFoldable,
      defaultFolded: parsed.defaultFolded,
      bodyText,
      tokens: bodyTokens,
    }
  },

  renderer(this: any, token: any): string {
    const meta = CALLOUT_TYPES[token.calloutType] ?? { icon: '\u270E', color: '#448aff' }
    const displayType = token.calloutType

    const bodyHtml = token.tokens?.length
      ? this.parser.parse(token.tokens)
      : ''

    if (token.isFoldable) {
      return `<details class="callout callout-${displayType}" data-callout="${displayType}" data-callout-foldable data-callout-collapsed="${token.defaultFolded}"${!token.defaultFolded ? ' open' : ''}>` +
        `<summary class="callout-title">` +
        `<span class="callout-icon">${meta.icon}</span>` +
        `<span class="callout-title-text">${escapeHtml(token.calloutTitle)}</span>` +
        `<span class="callout-fold-icon">${token.defaultFolded ? '\u25B8' : '\u25BE'}</span>` +
        `</summary>` +
        `<div class="callout-content">${bodyHtml}</div>` +
        `</details>`
    }

    return `<div class="callout callout-${displayType}" data-callout="${displayType}">` +
      `<div class="callout-title">` +
      `<span class="callout-icon">${meta.icon}</span>` +
      `<span class="callout-title-text">${escapeHtml(token.calloutTitle)}</span>` +
      `</div>` +
      `<div class="callout-content">${bodyHtml}</div>` +
      `</div>`
  },

  childTokens: ['tokens'],
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createMarkedWithCallouts() {
  const instance = new Marked()
  instance.use({ gfm: true, extensions: [calloutExtension] })
  return instance
}

export function parseWithMarked(src: string): string {
  const instance = createMarkedWithCallouts()
  return instance.parse(src) as string
}

export { calloutExtension }
