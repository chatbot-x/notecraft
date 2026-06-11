/**
 * Custom markdown-it plugin for Obsidian-style callouts / admonitions.
 *
 * Supports the syntax:
 *   > [!note] Title here
 *   > Content of the callout
 *   >
 *   > More content (multi-paragraph)
 *
 * Foldable callouts (backported from @r4ai/remark-callout):
 *   > [!note]+ Expanded by default
 *   > This callout starts open and can be collapsed
 *
 *   > [!note]- Collapsed by default
 *   > This callout starts closed and can be expanded
 *
 * Recognized types (case-insensitive):
 *   note, info, tip, success, question, warning, failure, danger,
 *   bug, example, quote, abstract, todo, important
 *
 * Type aliases (backported from flowershow/remark-callouts):
 *   summary/tldr → abstract, hint → tip, important → important (own type),
 *   check/done → success, help/faq → question, caution/attention → warning,
 *   fail/missing → failure, error → danger, cite → quote
 *
 * Implementation strategy:
 *   Registers a markdown-it core rule that scans the parsed token stream
 *   for blockquote_open sequences. If the first inline content starts with
 *   [!TYPE], the blockquote is transformed in-place into a styled callout
 *   <div> (or <details>/<summary> for foldable) with a title section and
 *   content section.
 *
 *   Regular blockquotes without the [!TYPE] marker are left untouched.
 *
 * Backport references:
 *   - @r4ai/remark-callout: parseCallout regex, foldable <details>/<summary>
 *   - flowershow/remark-callouts: type aliasing
 *   - remark-obsidian-callout: data-callout-foldable, data-callout-collapsed
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  | 'important'

interface CalloutMeta {
  icon: string
}

interface ParsedCallout {
  /** The callout type (lowercased) */
  type: string
  /** The resolved/canonical type after alias mapping */
  resolvedType: string
  /** Title text (auto-capitalized from type if not provided) */
  title: string
  /** Whether this callout is foldable (+ or - suffix) */
  isFoldable: boolean
  /** Whether the callout starts collapsed (- suffix) */
  defaultFolded: boolean
}

// ─── Callout Type Definitions ─────────────────────────────────────────────────

const CALLOUT_TYPES: Record<string, CalloutMeta | undefined> = {
  note:      { icon: '\u270E' },       // ✎
  info:      { icon: '\u2139' },       // ℹ
  tip:       { icon: '\u261D' },       // ☝
  success:   { icon: '\u2714' },       // ✔
  question:  { icon: '\u2753' },       // ❓
  warning:   { icon: '\u26A0' },       // ⚠
  failure:   { icon: '\u2718' },       // ✘
  danger:    { icon: '\u26D4' },       // ⛔
  bug:       { icon: '\u{1F41B}' },    // 🐛
  example:   { icon: '\u{1F4CB}' },    // 📋
  quote:     { icon: '\u275D' },       // ❝
  abstract:  { icon: '\u{1F4D1}' },    // 📑
  todo:      { icon: '\u{1F4DD}' },    // 📝
  important: { icon: '\u{1F525}' },    // 🔥
}

// ─── Type Aliases (backported from flowershow/remark-callouts) ────────────────
// Maps alternative type names to their canonical equivalents

const CALLOUT_ALIASES: Record<string, string> = {
  // abstract aliases
  summary: 'abstract',
  tldr: 'abstract',

  // tip aliases
  hint: 'tip',

  // success aliases
  check: 'success',
  done: 'success',

  // question aliases
  help: 'question',
  faq: 'question',

  // warning aliases
  caution: 'warning',
  attention: 'warning',

  // failure aliases
  fail: 'failure',
  missing: 'failure',

  // danger aliases
  error: 'danger',

  // quote aliases
  cite: 'quote',
}

// ─── Callout Parsing (backported from @r4ai/remark-callout) ───────────────────
// Regex: /^\[!(?<type>[^\]]+)?\](?<isFoldable>[+-])?(?:[ \t]+(?<title>.*))?$/
// This is the battle-tested regex from @r4ai/remark-callout with minor
// adjustments for markdown-it's token stream model.

const CALLOUT_RE = /^\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*))?/

function parseCallout(text: string): ParsedCallout | null {
  const match = text.match(CALLOUT_RE)
  if (!match || !match[1]) return null

  const rawType = match[1].toLowerCase().trim()
  const foldableMarker = match[2] || ''
  const rawTitle = (match[3] ?? '').trim()

  // Resolve type alias
  const resolvedType = CALLOUT_ALIASES[rawType] ?? rawType

  // Auto-capitalize type as default title (from @r4ai/remark-callout)
  const title = rawTitle || resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1)

  return {
    type: rawType,
    resolvedType,
    title,
    isFoldable: foldableMarker === '+' || foldableMarker === '-',
    defaultFolded: foldableMarker === '-',
  }
}

// ─── Core Rule ────────────────────────────────────────────────────────────────

function calloutRule(state: StateCore): void {
  const tokens = state.tokens

  // Collect callout blockquote ranges to transform
  const toTransform: Array<{
    openIdx: number
    closeIdx: number
    parsed: ParsedCallout
  }> = []

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

    // Find the first inline token inside the blockquote
    let inlineIdx = -1
    for (let j = i + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'inline') { inlineIdx = j; break }
    }
    if (inlineIdx === -1) continue

    // Check if the inline content starts with [!TYPE]
    const inlineContent = tokens[inlineIdx].content
    const parsed = parseCallout(inlineContent)
    if (!parsed) continue // Not a callout — leave this blockquote as-is

    toTransform.push({ openIdx: i, closeIdx, parsed })
  }

  // Process in reverse order so earlier indices remain valid
  for (let r = toTransform.length - 1; r >= 0; r--) {
    const { openIdx, closeIdx, parsed } = toTransform[r]

    const meta = CALLOUT_TYPES[parsed.resolvedType] ?? { icon: '\u270E' }
    const displayType = parsed.resolvedType

    // ── Step 1: Transform the blockquote wrapper into a callout ──

    // Foldable callouts use <details>/<summary> (backported from @r4ai/remark-callout)
    // Non-foldable use <div>/<div> (our existing approach)
    if (parsed.isFoldable) {
      tokens[openIdx].type = 'callout_open'
      tokens[openIdx].tag = 'details'
      tokens[openIdx].attrPush(['class', `callout callout-${displayType}`])
      tokens[openIdx].attrPush(['data-callout', displayType])
      tokens[openIdx].attrPush(['data-callout-foldable', ''])
      if (!parsed.defaultFolded) {
        tokens[openIdx].attrPush(['open', ''])
      }
      tokens[openIdx].attrPush(['data-callout-collapsed', String(parsed.defaultFolded)])
    } else {
      tokens[openIdx].type = 'callout_open'
      tokens[openIdx].tag = 'div'
      tokens[openIdx].attrPush(['class', `callout callout-${displayType}`])
      tokens[openIdx].attrPush(['data-callout', displayType])
    }

    tokens[closeIdx].type = 'callout_close'
    tokens[closeIdx].tag = parsed.isFoldable ? 'details' : 'div'

    // ── Step 2: Find the first paragraph and inline inside the blockquote ──

    let paraOpenIdx = -1
    let paraCloseIdx = -1
    let inlineIdx = -1
    for (let j = openIdx + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'paragraph_open' && paraOpenIdx === -1) paraOpenIdx = j
      if (tokens[j].type === 'inline' && inlineIdx === -1) inlineIdx = j
      if (tokens[j].type === 'paragraph_close' && paraCloseIdx === -1) paraCloseIdx = j
    }
    if (inlineIdx === -1) continue

    // ── Step 3: Strip the [!TYPE][+/-] Title marker from the first inline ──

    const inlineToken = tokens[inlineIdx]
    const fullMatch = inlineToken.content.match(CALLOUT_RE)
    if (!fullMatch) continue

    const markerText = fullMatch[0] // e.g. "[!note]+ Important"

    // Remove marker text from the first text child
    if (inlineToken.children && inlineToken.children.length > 0) {
      const firstChild = inlineToken.children[0]
      if (firstChild.type === 'text' && firstChild.content.startsWith(markerText)) {
        firstChild.content = firstChild.content.slice(markerText.length)
      }
    }
    // Update the inline content property
    inlineToken.content = inlineToken.content.slice(markerText.length)

    // ── Step 4: Clean up the first paragraph ──
    // Remove leading empty text nodes and softbreaks from the inline children
    if (inlineToken.children) {
      while (inlineToken.children.length > 0) {
        const first = inlineToken.children[0]
        if (
          first.type === 'softbreak' ||
          (first.type === 'text' && first.content.trim() === '')
        ) {
          inlineToken.children.splice(0, 1)
        } else {
          break
        }
      }
    }

    // Check if the first paragraph is now empty (no meaningful content left)
    const hasContent = inlineToken.children && inlineToken.children.some(
      (c) =>
        (c.type === 'text' && c.content.trim() !== '') ||
        (c.type !== 'text' && c.type !== 'softbreak')
    )

    if (!hasContent && paraOpenIdx !== -1 && paraCloseIdx !== -1) {
      // Remove the empty paragraph entirely
      tokens.splice(paraOpenIdx, paraCloseIdx - paraOpenIdx + 1)
    }

    // ── Step 5: Insert title tokens and content wrapper ──

    const titleTokens: any[] = []

    // <summary> for foldable, <div> for non-foldable (backported from @r4ai/remark-callout)
    const titleDivOpen = new state.Token('callout_title_open', parsed.isFoldable ? 'summary' : 'div', 1)
    titleDivOpen.attrPush(['class', 'callout-title'])
    titleTokens.push(titleDivOpen)

    // <span class="callout-icon">ICON</span>
    const iconSpanOpen = new state.Token('callout_icon_open', 'span', 1)
    iconSpanOpen.attrPush(['class', 'callout-icon'])
    titleTokens.push(iconSpanOpen)
    const iconText = new state.Token('text', '', 0)
    iconText.content = meta.icon
    titleTokens.push(iconText)
    const iconSpanClose = new state.Token('callout_icon_close', 'span', -1)
    titleTokens.push(iconSpanClose)

    // <span class="callout-title-text">Title</span>
    const titleSpanOpen = new state.Token('callout_title_text_open', 'span', 1)
    titleSpanOpen.attrPush(['class', 'callout-title-text'])
    titleTokens.push(titleSpanOpen)

    // Title text
    const titleText = new state.Token('text', '', 0)
    titleText.content = parsed.title
    titleTokens.push(titleText)

    const titleSpanClose = new state.Token('callout_title_text_close', 'span', -1)
    titleTokens.push(titleSpanClose)

    // Foldable chevron indicator (backported from remark-obsidian-md)
    if (parsed.isFoldable) {
      const chevronSpanOpen = new state.Token('callout_fold_icon_open', 'span', 1)
      chevronSpanOpen.attrPush(['class', 'callout-fold-icon'])
      titleTokens.push(chevronSpanOpen)
      const chevronText = new state.Token('text', '', 0)
      chevronText.content = parsed.defaultFolded ? '\u25B8' : '\u25BE' // ▸ or ▾
      titleTokens.push(chevronText)
      const chevronSpanClose = new state.Token('callout_fold_icon_close', 'span', -1)
      titleTokens.push(chevronSpanClose)
    }

    // </summary> or </div> close title
    const titleDivClose = new state.Token('callout_title_close', parsed.isFoldable ? 'summary' : 'div', -1)
    titleTokens.push(titleDivClose)

    // <div class="callout-content">
    const contentDivOpen = new state.Token('callout_content_open', 'div', 1)
    contentDivOpen.attrPush(['class', 'callout-content'])
    titleTokens.push(contentDivOpen)

    // Insert title + content_open tokens right after callout_open
    tokens.splice(openIdx + 1, 0, ...titleTokens)

    // Insert content_div_close right before callout_close
    const removeCount = !hasContent && paraOpenIdx !== -1 ? (paraCloseIdx - paraOpenIdx + 1) : 0
    const shiftedCloseIdx = closeIdx + titleTokens.length - removeCount
    const contentDivClose = new state.Token('callout_content_close', 'div', -1)
    tokens.splice(shiftedCloseIdx, 0, contentDivClose)
  }
}

// ─── Plugin Export ────────────────────────────────────────────────────────────

export default function calloutPlugin(md: MarkdownIt): void {
  // Register the core rule after 'inline' so that inline token children
  // are already populated (we need children to inspect/strip the [!TYPE] marker)
  md.core.ruler.after('inline', 'callout', calloutRule)

  // Register renderers for custom tokens — they render standard HTML tags
  // with the attributes already set on the tokens
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
