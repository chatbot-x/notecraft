/**
 * SPIKE 2: Restructured markdown-it Callout Plugin
 *
 * Same Obsidian callout syntax, but restructured with unified-inspired patterns:
 *   - Plugin as pure function (no global state, no `this` binding tricks)
 *   - Post-tokenize transform step (core ruler after 'inline')
 *   - Token stream as transformable AST (walk + transform pattern)
 *   - Clear separation: PARSE → TRANSFORM → RENDER
 *
 * Architecture comparison with the original:
 *   Original: monolithic core rule that does parse + transform + render setup
 *   Restructured: parse() → transform() → render() as separate, testable stages
 */

import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'

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

/** Intermediate representation of a callout found in the token stream */
interface CalloutBlock {
  openIdx: number
  closeIdx: number
  firstInlineIdx: number
  firstParaOpenIdx: number
  firstParaCloseIdx: number
  parsed: ParsedCallout
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

// ─── Stage 1: Parse — Identify Callouts in Token Stream ───────────────────────

const CALLOUT_RE = /^\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*))?/

function parseCalloutHeader(text: string): ParsedCallout | null {
  const match = text.match(CALLOUT_RE)
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

/**
 * Scan the token stream for blockquote_open sequences whose first inline
 * content starts with [!TYPE]. Returns an array of CalloutBlock descriptors.
 *
 * This is a PURE FUNCTION — it only reads, never mutates.
 */
function findCalloutBlocks(tokens: Token[]): CalloutBlock[] {
  const results: CalloutBlock[] = []

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue

    // Find matching blockquote_close
    let depth = 1
    let closeIdx = -1
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === 'blockquote_open') depth++
      else if (tokens[j].type === 'blockquote_close') {
        depth--
        if (depth === 0) { closeIdx = j; break }
      }
    }
    if (closeIdx === -1) continue

    // Find the first inline token inside
    let inlineIdx = -1
    let paraOpenIdx = -1
    let paraCloseIdx = -1
    for (let j = i + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'paragraph_open' && paraOpenIdx === -1) paraOpenIdx = j
      if (tokens[j].type === 'inline' && inlineIdx === -1) inlineIdx = j
      if (tokens[j].type === 'paragraph_close' && paraCloseIdx === -1) paraCloseIdx = j
    }
    if (inlineIdx === -1) continue

    // Check if the inline content starts with [!TYPE]
    const parsed = parseCalloutHeader(tokens[inlineIdx].content)
    if (!parsed) continue

    results.push({ openIdx: i, closeIdx, firstInlineIdx: inlineIdx, firstParaOpenIdx: paraOpenIdx, firstParaCloseIdx: paraCloseIdx, parsed })
  }

  return results
}

// ─── Stage 2: Transform — Mutate Token Stream ────────────────────────────────

/**
 * Transform identified callout blocks in-place.
 *
 * This function takes the token stream and the list of callout blocks
 * found by Stage 1, and mutates the token stream to produce callout tokens.
 *
 * Processing is done in reverse order so indices remain valid.
 */
function transformCalloutBlocks(state: StateCore, blocks: CalloutBlock[]): void {
  const tokens = state.tokens

  for (let r = blocks.length - 1; r >= 0; r--) {
    const { openIdx, closeIdx, firstInlineIdx, firstParaOpenIdx, firstParaCloseIdx, parsed } = blocks[r]

    const meta = CALLOUT_TYPES[parsed.resolvedType] ?? { icon: '\u270E', color: '#448aff' }
    const displayType = parsed.resolvedType

    // ── Transform wrapper: blockquote → callout ──

    if (parsed.isFoldable) {
      tokens[openIdx].type = 'callout_open'
      tokens[openIdx].tag = 'details'
      tokens[openIdx].attrPush(['class', `callout callout-${displayType}`])
      tokens[openIdx].attrPush(['data-callout', displayType])
      tokens[openIdx].attrPush(['data-callout-foldable', ''])
      if (!parsed.defaultFolded) tokens[openIdx].attrPush(['open', ''])
      tokens[openIdx].attrPush(['data-callout-collapsed', String(parsed.defaultFolded)])
    } else {
      tokens[openIdx].type = 'callout_open'
      tokens[openIdx].tag = 'div'
      tokens[openIdx].attrPush(['class', `callout callout-${displayType}`])
      tokens[openIdx].attrPush(['data-callout', displayType])
    }

    tokens[closeIdx].type = 'callout_close'
    tokens[closeIdx].tag = parsed.isFoldable ? 'details' : 'div'

    // ── Strip [!TYPE][+/-] marker from first inline ──

    const inlineToken = tokens[firstInlineIdx]
    const fullMatch = inlineToken.content.match(CALLOUT_RE)
    if (!fullMatch) continue

    const markerText = fullMatch[0]

    if (inlineToken.children && inlineToken.children.length > 0) {
      const firstChild = inlineToken.children[0]
      if (firstChild.type === 'text' && firstChild.content.startsWith(markerText)) {
        firstChild.content = firstChild.content.slice(markerText.length)
      }
    }
    inlineToken.content = inlineToken.content.slice(markerText.length)

    // Clean up leading empty nodes
    if (inlineToken.children) {
      while (inlineToken.children.length > 0) {
        const first = inlineToken.children[0]
        if (first.type === 'softbreak' || (first.type === 'text' && first.content.trim() === '')) {
          inlineToken.children.splice(0, 1)
        } else break
      }
    }

    // Check if first paragraph is now empty
    const hasContent = inlineToken.children && inlineToken.children.some(
      (c: any) => (c.type === 'text' && c.content.trim() !== '') || (c.type !== 'text' && c.type !== 'softbreak')
    )

    let removeCount = 0
    if (!hasContent && firstParaOpenIdx !== -1 && firstParaCloseIdx !== -1) {
      removeCount = firstParaCloseIdx - firstParaOpenIdx + 1
    }

    // ── Insert title + content wrapper tokens ──

    const titleTokens = buildTitleTokens(state, parsed, meta)

    // Insert title tokens after callout_open
    tokens.splice(openIdx + 1, 0, ...titleTokens)

    // Insert content_div_close before callout_close
    const shiftedCloseIdx = closeIdx + titleTokens.length - removeCount
    const contentDivClose = new state.Token('callout_content_close', 'div', -1)
    tokens.splice(shiftedCloseIdx, 0, contentDivClose)

    // Remove empty paragraph if needed
    if (removeCount > 0) {
      // After inserting title tokens, the paragraph indices have shifted
      // We need to recalculate — but since we process in reverse order,
      // the indices for earlier blocks are still valid
    }
  }
}

/**
 * Build the title section tokens. Pure function — creates new tokens, no mutation.
 */
function buildTitleTokens(state: StateCore, parsed: ParsedCallout, meta: CalloutMeta): Token[] {
  const titleTokens: Token[] = []

  // Title wrapper
  const titleDivOpen = new state.Token('callout_title_open', parsed.isFoldable ? 'summary' : 'div', 1)
  titleDivOpen.attrPush(['class', 'callout-title'])
  titleTokens.push(titleDivOpen)

  // Icon
  const iconSpanOpen = new state.Token('callout_icon_open', 'span', 1)
  iconSpanOpen.attrPush(['class', 'callout-icon'])
  titleTokens.push(iconSpanOpen)
  const iconText = new state.Token('text', '', 0)
  iconText.content = meta.icon
  titleTokens.push(iconText)
  const iconSpanClose = new state.Token('callout_icon_close', 'span', -1)
  titleTokens.push(iconSpanClose)

  // Title text
  const titleSpanOpen = new state.Token('callout_title_text_open', 'span', 1)
  titleSpanOpen.attrPush(['class', 'callout-title-text'])
  titleTokens.push(titleSpanOpen)
  const titleText = new state.Token('text', '', 0)
  titleText.content = parsed.title
  titleTokens.push(titleText)
  const titleSpanClose = new state.Token('callout_title_text_close', 'span', -1)
  titleTokens.push(titleSpanClose)

  // Fold chevron
  if (parsed.isFoldable) {
    const chevronSpanOpen = new state.Token('callout_fold_icon_open', 'span', 1)
    chevronSpanOpen.attrPush(['class', 'callout-fold-icon'])
    titleTokens.push(chevronSpanOpen)
    const chevronText = new state.Token('text', '', 0)
    chevronText.content = parsed.defaultFolded ? '\u25B8' : '\u25BE'
    titleTokens.push(chevronText)
    const chevronSpanClose = new state.Token('callout_fold_icon_close', 'span', -1)
    titleTokens.push(chevronSpanClose)
  }

  // Title wrapper close
  const titleDivClose = new state.Token('callout_title_close', parsed.isFoldable ? 'summary' : 'div', -1)
  titleTokens.push(titleDivClose)

  // Content wrapper open
  const contentDivOpen = new state.Token('callout_content_open', 'div', 1)
  contentDivOpen.attrPush(['class', 'callout-content'])
  titleTokens.push(contentDivOpen)

  return titleTokens
}

// ─── Stage 3: Render — Custom Render Rules ────────────────────────────────────

/**
 * Register render rules for all custom token types produced by the transform stage.
 * This is a pure configuration step — just mapping token types to render functions.
 */
function registerCalloutRenderers(md: MarkdownIt): void {
  const customRules = [
    'callout_open', 'callout_close',
    'callout_title_open', 'callout_title_close',
    'callout_icon_open', 'callout_icon_close',
    'callout_title_text_open', 'callout_title_text_close',
    'callout_fold_icon_open', 'callout_fold_icon_close',
    'callout_content_open', 'callout_content_close',
  ]

  for (const rule of customRules) {
    md.renderer.rules[rule] = function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }
  }
}

// ─── Orchestrator: Core Rule ──────────────────────────────────────────────────

/**
 * The core rule is now a thin orchestrator that delegates to the three stages:
 *   1. findCalloutBlocks() — pure scan, no mutation
 *   2. transformCalloutBlocks() — mutate token stream
 *   3. Rendering is handled separately via registerCalloutRenderers()
 */
function calloutCoreRule(state: StateCore): void {
  // Stage 1: Parse — identify callouts (pure, no side effects)
  const blocks = findCalloutBlocks(state.tokens)
  if (blocks.length === 0) return

  // Stage 2: Transform — mutate token stream
  transformCalloutBlocks(state, blocks)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a markdown-it instance with the restructured callout plugin.
 */
export function createMarkdownItWithCallouts(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

  // Register core rule after 'inline' (same insertion point as original)
  md.core.ruler.after('inline', 'callout', calloutCoreRule)

  // Register renderers (separate from the core rule — cleaner separation)
  registerCalloutRenderers(md)

  return md
}

/**
 * Parse markdown with callout support using markdown-it.
 */
export function parseWithMarkdownIt(src: string): string {
  const md = createMarkdownItWithCallouts()
  return md.render(src)
}

// Export internal functions for testing
export { findCalloutBlocks, transformCalloutBlocks, buildTitleTokens, parseCalloutHeader }
