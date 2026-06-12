/**
 * NoteCraft Obsidian Transforms — unified core-rule pipeline.
 *
 * Merges 6 separate core rules into a single `obsidian_transforms` core rule
 * that runs after markdown-it's `inline` phase. The pipeline has two phases:
 *
 *   Phase 1 — Inline transforms (single walk over inline tokens):
 *     1. Comment stripping  (%%hidden%%)
 *     2. Wikilink resolution ([[note]], [[note#heading]], [[note|alias]])
 *     3. Embed detection     (![[note]], ![[image.png|300]])
 *     4. Tag replacement     (#tag, #nested/tag)
 *
 *   Phase 2 — Block transforms (reverse-order token stream mutation):
 *     5. Callout transformation (> [!note], > [!warning]+, > [!danger]-)
 *     6. Block reference handling (^block-id)
 *
 * Benefits over 6 separate core rules:
 *   - 3 fewer full iterations over state.tokens (4 inline walks → 1)
 *   - 1 fewer full iteration for block-level scans (2 → 1 sequential pass)
 *   - Shared state / config passed once, not reconstructed per rule
 *   - Consistent unified-inspired pattern: Parse → Transform → Render
 *   - Single registration point in the core ruler chain
 *
 * Architecture principle:
 *   markdown-it is the engine, remark is the reference implementation.
 *   Each sub-transform is a pure function that could be independently tested.
 *
 * Original files (kept for reference):
 *   - comment-plugin.ts
 *   - wikilink-plugin.ts
 *   - embed-plugin.ts
 *   - tag-plugin.ts
 *   - callout-plugin.ts
 *   - block-ref-plugin.ts
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import { CALLOUT_TYPES, CALLOUT_ALIASES, DEFAULT_CALLOUT_ICON } from './callout-types'

// ─── Plugin Options ──────────────────────────────────────────────────────────

export interface ObsidianTransformsOptions {
  /** Strip comments entirely (true) or wrap in HTML comment (false). Default: true */
  commentStrip?: boolean
  /** Base URL for wikilink hrefs. Default: "/" */
  wikilinkBaseURL?: string
  /** URI suffix appended to wikilink hrefs. Default: "" */
  wikilinkURISuffix?: string
  /** Base URL for resolving embed hrefs. Default: "/" */
  embedWikilinkBase?: string
  /** CSS class for tag anchor elements. Default: "obsidian-tag" */
  tagClass?: string
  /** CSS class for block reference indicator. Default: "block-ref-id" */
  blockRefIndicatorClass?: string
  /** Whether to show block reference indicators. Default: true */
  blockRefShowIndicator?: boolean
  /** Feature flags — each can be disabled independently */
  features?: {
    comments?: boolean
    wikilinks?: boolean
    embeds?: boolean
    tags?: boolean
    callouts?: boolean
    blockRefs?: boolean
  }
}

// ─── Regex Constants ─────────────────────────────────────────────────────────

// Comments
const COMMENT_RE = /%%(.*?)%%/g

// Wikilinks: [[content]] where content can contain #, ^, | but not newlines
const WIKILINK_RE = /\[\[([^\]\n|]+?)(\|[^\]\n|]+?)?\]\]/g

// Tags: valid tag starts with letter/underscore
const TAG_NAME_RE = /^[a-zA-Z_][\w/-]*$/
const TAG_PRECEDING_CHARS = new Set([
  ' ', '\t', '\n', '\r',   // whitespace
  '(', '[', '{',           // opening brackets
  ',', ';', ':',           // punctuation
  '>', '~',                // blockquote, strikethrough
  '"', "'",                // quotes
])

// Callouts: [!TYPE][+/-] Title
const CALLOUT_RE = /^\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*))?/

// Block references
const BLOCK_ID_RE = /\n?\^([a-zA-Z0-9_-]+)\s*$/
const STANDALONE_BLOCK_ID_RE = /^\^([a-zA-Z0-9_-]+)\s*$/

// Embed helpers
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.bmp', '.ico', '.avif', '.tiff', '.tif',
])
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a', '.flac',
])
const SIZE_RE = /^(\d+)(?:x(\d+))?$/

// ─── Parsed Types ────────────────────────────────────────────────────────────

interface ParsedWikilink {
  pageName: string
  heading?: string
  blockId?: string
  alias?: string
}

interface ParsedEmbed {
  source: string
  heading?: string
  blockId?: string
  isImage: boolean
  isMedia: boolean
  width?: number
  height?: number
  aliasText?: string
}

interface ParsedCallout {
  type: string
  resolvedType: string
  title: string
  isFoldable: boolean
  defaultFolded: boolean
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function parseWikilinkTarget(target: string, aliasRaw?: string): ParsedWikilink {
  let pageName = target.trim()
  let heading: string | undefined
  let blockId: string | undefined

  const hashIdx = pageName.indexOf('#')
  if (hashIdx !== -1) {
    const fragment = pageName.slice(hashIdx + 1)
    pageName = pageName.slice(0, hashIdx)
    if (fragment.startsWith('^')) {
      blockId = fragment.slice(1)
    } else {
      heading = fragment
    }
  }

  if (!pageName && (heading || blockId)) {
    pageName = ''
  }

  const alias = aliasRaw ? aliasRaw.slice(1).trim() : undefined
  return { pageName, heading, blockId, alias }
}

function hasExtension(filename: string, extensions: Set<string>): boolean {
  const lower = filename.toLowerCase()
  return Array.from(extensions).some(ext => lower.endsWith(ext))
}

function parseEmbedFromHref(href: string, displayText: string, wikilinkBase: string): ParsedEmbed {
  let path = href
  if (path.startsWith(wikilinkBase)) {
    path = path.slice(wikilinkBase.length)
  }
  try { path = decodeURIComponent(path) } catch { /* keep as-is */ }

  let source = path
  let heading: string | undefined
  let blockId: string | undefined

  const hashIdx = path.indexOf('#')
  if (hashIdx !== -1) {
    source = path.slice(0, hashIdx)
    const fragment = path.slice(hashIdx + 1)
    if (fragment.startsWith('^')) {
      blockId = fragment.slice(1)
    } else {
      heading = fragment
    }
  }

  const isImage = hasExtension(source, IMAGE_EXTENSIONS)
  const isMedia = hasExtension(source, MEDIA_EXTENSIONS)

  let width: number | undefined
  let height: number | undefined
  let aliasText: string | undefined

  if (displayText && (isImage || isMedia)) {
    const sizeMatch = displayText.match(SIZE_RE)
    if (sizeMatch) {
      width = parseInt(sizeMatch[1], 10)
      if (sizeMatch[2]) height = parseInt(sizeMatch[2], 10)
    } else {
      aliasText = displayText
    }
  } else if (displayText) {
    aliasText = displayText
  }

  return { source, heading, blockId, isImage, isMedia, width, height, aliasText }
}

function generateEmbedHtml(embed: ParsedEmbed, wikilinkBase: string): string {
  if (embed.isImage) {
    const src = wikilinkBase + encodeURIComponent(embed.source)
    let imgAttrs = `src="${src}" alt="${embed.source}" class="embed-image"`
    if (embed.width) imgAttrs += ` width="${embed.width}"`
    if (embed.height) imgAttrs += ` height="${embed.height}"`
    return `<img ${imgAttrs} loading="lazy" />`
  }

  if (embed.isMedia) {
    const src = wikilinkBase + encodeURIComponent(embed.source)
    const isAudio = embed.source.toLowerCase().match(/\.(mp3|wav|m4a|flac|ogg)$/)
    if (isAudio) {
      return `<audio controls class="embed-audio" src="${src}">Your browser does not support audio.</audio>`
    }
    return `<video controls class="embed-video" src="${src}"${embed.width ? ` width="${embed.width}"` : ''}${embed.height ? ` height="${embed.height}"` : ''}>Your browser does not support video.</video>`
  }

  // Note embed
  const dataAttrs: string[] = [
    `data-embed-src="${embed.source}"`,
    `data-embed-type="note"`,
  ]
  if (embed.heading) dataAttrs.push(`data-embed-heading="${embed.heading}"`)
  if (embed.blockId) dataAttrs.push(`data-embed-block="${embed.blockId}"`)

  const displayText = embed.aliasText || embed.source

  return (
    `<div class="embed-note" ${dataAttrs.join(' ')}>` +
    `<div class="embed-note-header">` +
    `<span class="embed-note-icon">\u{1F517}</span>` +
    `<span class="embed-note-title">${displayText}</span>` +
    `</div>` +
    `<div class="embed-note-content" data-embed-placeholder="true">` +
    `<em>Loading embed...</em>` +
    `</div>` +
    `</div>`
  )
}

function parseCallout(text: string): ParsedCallout | null {
  const match = text.match(CALLOUT_RE)
  if (!match || !match[1]) return null

  const rawType = match[1].toLowerCase().trim()
  const foldableMarker = match[2] || ''
  const rawTitle = (match[3] ?? '').trim()

  const resolvedType = CALLOUT_ALIASES[rawType] ?? rawType
  const title = rawTitle || resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1)

  return {
    type: rawType,
    resolvedType,
    title,
    isFoldable: foldableMarker === '+' || foldableMarker === '-',
    defaultFolded: foldableMarker === '-',
  }
}

function scanForTags(text: string): Array<{ type: 'text' | 'tag'; content: string }> {
  const results: Array<{ type: 'text' | 'tag'; content: string }> = []
  let i = 0
  const len = text.length

  while (i < len) {
    if (text[i] === '#') {
      const hasValidContext = i === 0 || TAG_PRECEDING_CHARS.has(text[i - 1])
      if (hasValidContext) {
        let tagEnd = i + 1
        while (tagEnd < len && /[\w/-]/.test(text[tagEnd])) {
          tagEnd++
        }
        const tagName = text.slice(i + 1, tagEnd)
        if (tagName.length > 0 && TAG_NAME_RE.test(tagName)) {
          results.push({ type: 'tag', content: tagName })
          i = tagEnd
          continue
        }
      }
      results.push({ type: 'text', content: '#' })
      i++
    } else {
      let textEnd = i
      while (textEnd < len && text[textEnd] !== '#') {
        textEnd++
      }
      results.push({ type: 'text', content: text.slice(i, textEnd) })
      i = textEnd
    }
  }

  // Merge adjacent text segments
  const merged: Array<{ type: 'text' | 'tag'; content: string }> = []
  for (const seg of results) {
    if (seg.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
      merged[merged.length - 1].content += seg.content
    } else if (seg.content.length > 0) {
      merged.push(seg)
    }
  }

  return merged
}

/** Rebuild an inline token's .content from its children */
function rebuildInlineContent(token: Token): void {
  if (!token.children) return
  token.content = token.children.map((c: any) => c.content || '').join('')
}

// ─── Phase 1: Inline Transform Sub-passes ───────────────────────────────────
// Each sub-pass operates on a single inline token's children.
// They are called in order within the single inline walk.

/** Sub-pass 1: Strip %%comment%% from text children */
function applyCommentTransform(inlineToken: Token, state: StateCore, strip: boolean): void {
  const children = inlineToken.children
  if (!children) return

  // Quick check: any text children contain %%?
  if (!children.some(c => c.type === 'text' && c.content.includes('%%'))) return

  const newChildren: Token[] = []
  let modified = false

  for (const child of children) {
    if (child.type !== 'text' || !child.content.includes('%%')) {
      newChildren.push(child)
      continue
    }

    const parts = child.content.split(COMMENT_RE)
    if (parts.length <= 1) {
      newChildren.push(child)
      continue
    }

    modified = true
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i % 2 === 0) {
        // Regular text (outside %%)
        if (part) {
          const textToken = new state.Token('text', '', 0)
          textToken.content = part
          newChildren.push(textToken)
        }
      } else {
        // Comment text (inside %%)
        if (!strip) {
          const commentToken = new state.Token('html_inline', '', 0)
          commentToken.content = `<!-- ${part} -->`
          newChildren.push(commentToken)
        }
        // If strip=true, skip entirely
      }
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

/** Sub-pass 2: Replace [[wikilink]] patterns with link tokens */
function applyWikilinkTransform(
  inlineToken: Token,
  state: StateCore,
  baseURL: string,
  uriSuffix: string,
): void {
  const children = inlineToken.children
  if (!children) return

  // Quick check: any text children contain [[?
  if (!children.some(c => c.type === 'text' && c.content.includes('[['))) return

  const newChildren: Token[] = []
  let modified = false

  for (const child of children) {
    if (child.type !== 'text' || !child.content.includes('[[')) {
      newChildren.push(child)
      continue
    }

    const parts = child.content.split(WIKILINK_RE)
    if (parts.length <= 1) {
      newChildren.push(child)
      continue
    }

    modified = true

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      if (i % 3 === 0) {
        // Regular text between wikilinks
        if (part) {
          const textToken = new state.Token('text', '', 0)
          textToken.content = part
          newChildren.push(textToken)
        }
      } else if (i % 3 === 1) {
        // Target part of wikilink
        const target = part
        const aliasRaw = parts[i + 1] || undefined
        const parsed = parseWikilinkTarget(target, aliasRaw)

        // Build the href
        let href: string
        if (parsed.pageName) {
          href = baseURL + encodeURIComponent(parsed.pageName) + uriSuffix
        } else {
          href = baseURL + uriSuffix
        }

        if (parsed.blockId) {
          href += '#^' + encodeURIComponent(parsed.blockId)
        } else if (parsed.heading) {
          href += '#' + encodeURIComponent(parsed.heading)
        }

        // Determine display text
        let displayText: string
        if (parsed.alias) {
          displayText = parsed.alias
        } else if (parsed.heading) {
          displayText = parsed.pageName
            ? `${parsed.pageName} > ${parsed.heading}`
            : parsed.heading
        } else if (parsed.blockId) {
          displayText = parsed.pageName
            ? `${parsed.pageName} > ^${parsed.blockId}`
            : `^${parsed.blockId}`
        } else {
          displayText = parsed.pageName
        }

        // Create link tokens
        const linkOpen = new state.Token('link_open', 'a', 1)
        linkOpen.attrPush(['href', href])
        linkOpen.attrPush(['class', 'wikilink'])
        if (parsed.heading) linkOpen.attrPush(['data-wikilink-heading', parsed.heading])
        if (parsed.blockId) linkOpen.attrPush(['data-wikilink-block', parsed.blockId])

        newChildren.push(linkOpen)

        const textToken = new state.Token('text', '', 0)
        textToken.content = displayText
        newChildren.push(textToken)

        const linkClose = new state.Token('link_close', 'a', -1)
        newChildren.push(linkClose)

        // Skip the alias part (i+1) since we already processed it
        i++ // Will be incremented again in the loop
      }
      // i % 3 === 2 is the alias capture group, handled with i%3===1
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

/** Sub-pass 3: Detect ![[embed]] pattern (text ending with ! + wikilink tokens) */
function applyEmbedTransform(
  inlineToken: Token,
  state: StateCore,
  wikilinkBase: string,
): void {
  const children = inlineToken.children
  if (!children) return

  // Quick check: any link tokens with wikilink class?
  let hasWikilink = false
  for (const child of children) {
    if (child.type === 'link_open') {
      const href = child.attrGet('href')
      if (href && href.startsWith(wikilinkBase)) {
        hasWikilink = true
        break
      }
    }
  }
  if (!hasWikilink) return

  // Scan children for pattern: text ending with "!" -> link_open (wikilink) -> ... -> link_close
  // Process in reverse so index shifts don't affect earlier items
  let j = children.length - 1
  while (j >= 1) {
    if (children[j].type !== 'link_close') {
      j--
      continue
    }

    // Walk backwards to find matching link_open
    let depth = 0
    let linkOpenIdx = -1
    for (let k = j; k >= 0; k--) {
      if (children[k].type === 'link_close') depth++
      if (children[k].type === 'link_open') {
        depth--
        if (depth === 0) { linkOpenIdx = k; break }
      }
    }

    if (linkOpenIdx === -1 || linkOpenIdx === 0) {
      j--
      continue
    }

    // Check preceding token is text ending with '!'
    const prevToken = children[linkOpenIdx - 1]
    if (prevToken.type !== 'text' || !prevToken.content.endsWith('!')) {
      j = linkOpenIdx - 1
      continue
    }

    // Check link is a wikilink
    const href = children[linkOpenIdx].attrGet('href')
    if (!href || !href.startsWith(wikilinkBase)) {
      j = linkOpenIdx - 1
      continue
    }

    // Get display text from tokens between link_open and link_close
    let displayText = ''
    for (let k = linkOpenIdx + 1; k < j; k++) {
      if (children[k].type === 'text') {
        displayText += children[k].content
      }
    }

    const embed = parseEmbedFromHref(href, displayText, wikilinkBase)
    const html = generateEmbedHtml(embed, wikilinkBase)

    // Strip '!' from preceding text
    prevToken.content = prevToken.content.slice(0, -1)

    // Replace link_open through link_close with html_inline
    const htmlToken = new state.Token('html_inline', '', 0)
    htmlToken.content = html
    children.splice(linkOpenIdx, j - linkOpenIdx + 1, htmlToken)

    // Remove empty preceding text token
    if (prevToken.content === '') {
      const idx = children.indexOf(prevToken)
      if (idx !== -1) {
        children.splice(idx, 1)
      }
    }

    rebuildInlineContent(inlineToken)
    j = linkOpenIdx - 1
  }
}

/** Sub-pass 4: Replace #tag patterns with tag anchor tokens */
function applyTagTransform(
  inlineToken: Token,
  state: StateCore,
  tagClass: string,
): void {
  const children = inlineToken.children
  if (!children) return

  // Quick check: any text children contain #?
  if (!children.some(c => c.type === 'text' && c.content.includes('#'))) return

  const newChildren: Token[] = []
  let modified = false

  for (const child of children) {
    if (child.type !== 'text' || !child.content.includes('#')) {
      newChildren.push(child)
      continue
    }

    const segments = scanForTags(child.content)
    if (!segments.some(s => s.type === 'tag')) {
      newChildren.push(child)
      continue
    }

    modified = true

    for (const seg of segments) {
      if (seg.type === 'text') {
        const textToken = new state.Token('text', '', 0)
        textToken.content = seg.content
        newChildren.push(textToken)
      } else {
        const tagOpen = new state.Token('tag_open', 'a', 1)
        tagOpen.attrPush(['class', tagClass])
        tagOpen.attrPush(['data-tag', seg.content])
        tagOpen.attrPush(['href', `#${seg.content}`])
        newChildren.push(tagOpen)

        const tagText = new state.Token('text', '', 0)
        tagText.content = `#${seg.content}`
        newChildren.push(tagText)

        const tagClose = new state.Token('tag_close', 'a', -1)
        newChildren.push(tagClose)
      }
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

// ─── Phase 2: Block Transform Functions ──────────────────────────────────────

/** Transform blockquotes with [!TYPE] markers into callout elements */
function applyCalloutTransform(state: StateCore): void {
  const tokens = state.tokens
  const toTransform: Array<{
    openIdx: number
    closeIdx: number
    parsed: ParsedCallout
  }> = []

  // Scan for blockquote_open tokens that start with [!TYPE]
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue

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

    let inlineIdx = -1
    for (let j = i + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'inline') { inlineIdx = j; break }
    }
    if (inlineIdx === -1) continue

    const inlineContent = tokens[inlineIdx].content
    const parsed = parseCallout(inlineContent)
    if (!parsed) continue

    toTransform.push({ openIdx: i, closeIdx, parsed })
  }

  // Process in reverse order so earlier indices remain valid
  for (let r = toTransform.length - 1; r >= 0; r--) {
    const { openIdx, closeIdx, parsed } = toTransform[r]
    const meta = CALLOUT_TYPES[parsed.resolvedType] ?? { icon: DEFAULT_CALLOUT_ICON }
    const displayType = parsed.resolvedType

    // Transform the blockquote wrapper into a callout
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

    // Find the first paragraph and inline inside the blockquote
    let paraOpenIdx = -1
    let paraCloseIdx = -1
    let inlineIdx = -1
    for (let j = openIdx + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'paragraph_open' && paraOpenIdx === -1) paraOpenIdx = j
      if (tokens[j].type === 'inline' && inlineIdx === -1) inlineIdx = j
      if (tokens[j].type === 'paragraph_close' && paraCloseIdx === -1) paraCloseIdx = j
    }
    if (inlineIdx === -1) continue

    // Strip the [!TYPE][+/-] Title marker from the first inline
    const inlineToken = tokens[inlineIdx]
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

    // Clean up leading empty text nodes and softbreaks
    if (inlineToken.children) {
      while (inlineToken.children.length > 0) {
        const first = inlineToken.children[0]
        if (first.type === 'softbreak' || (first.type === 'text' && first.content.trim() === '')) {
          inlineToken.children.splice(0, 1)
        } else {
          break
        }
      }
    }

    const hasContent = inlineToken.children && inlineToken.children.some(
      (c) => (c.type === 'text' && c.content.trim() !== '') || (c.type !== 'text' && c.type !== 'softbreak')
    )

    if (!hasContent && paraOpenIdx !== -1 && paraCloseIdx !== -1) {
      tokens.splice(paraOpenIdx, paraCloseIdx - paraOpenIdx + 1)
    }

    // Insert title tokens and content wrapper
    const titleTokens: Token[] = []

    const titleDivOpen = new state.Token('callout_title_open', parsed.isFoldable ? 'summary' : 'div', 1)
    titleDivOpen.attrPush(['class', 'callout-title'])
    titleTokens.push(titleDivOpen)

    const iconSpanOpen = new state.Token('callout_icon_open', 'span', 1)
    iconSpanOpen.attrPush(['class', 'callout-icon'])
    titleTokens.push(iconSpanOpen)
    const iconText = new state.Token('text', '', 0)
    iconText.content = meta.icon
    titleTokens.push(iconText)
    const iconSpanClose = new state.Token('callout_icon_close', 'span', -1)
    titleTokens.push(iconSpanClose)

    const titleSpanOpen = new state.Token('callout_title_text_open', 'span', 1)
    titleSpanOpen.attrPush(['class', 'callout-title-text'])
    titleTokens.push(titleSpanOpen)
    const titleText = new state.Token('text', '', 0)
    titleText.content = parsed.title
    titleTokens.push(titleText)
    const titleSpanClose = new state.Token('callout_title_text_close', 'span', -1)
    titleTokens.push(titleSpanClose)

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

    const titleDivClose = new state.Token('callout_title_close', parsed.isFoldable ? 'summary' : 'div', -1)
    titleTokens.push(titleDivClose)

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

/** Handle ^block-id definitions in paragraphs */
function applyBlockRefTransform(
  state: StateCore,
  indicatorClass: string,
  showIndicator: boolean,
): void {
  const tokens = state.tokens

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'paragraph_open') continue

    let closeIdx = -1
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === 'paragraph_close') { closeIdx = j; break }
    }
    if (closeIdx === -1) continue

    let inlineIdx = -1
    for (let j = i + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'inline') { inlineIdx = j; break }
    }
    if (inlineIdx === -1) continue

    const inlineToken = tokens[inlineIdx]
    const content = inlineToken.content

    const match = content.match(BLOCK_ID_RE)
    if (!match) continue

    const blockId = match[1]
    tokens[i].attrPush(['data-block-id', blockId])

    const isStandalone = STANDALONE_BLOCK_ID_RE.test(content.trim())

    if (isStandalone) {
      // Remove standalone block-id paragraph, attach to preceding block
      tokens.splice(i, closeIdx - i + 1)

      for (let k = i - 1; k >= 0; k--) {
        const prevToken = tokens[k]
        if (
          prevToken.type === 'paragraph_open' ||
          prevToken.type === 'heading_open' ||
          prevToken.type === 'blockquote_open' ||
          prevToken.type === 'list_item_open' ||
          prevToken.type === 'bullet_list_open' ||
          prevToken.type === 'ordered_list_open'
        ) {
          prevToken.attrPush(['data-block-id', blockId])

          if (showIndicator) {
            for (let m = k + 1; m < tokens.length; m++) {
              if (tokens[m].type === 'inline' && tokens[m].children) {
                const indicator = new state.Token('block_ref_indicator', 'span', 1)
                indicator.attrPush(['class', indicatorClass])
                indicator.attrPush(['data-block-id', blockId])
                const indicatorText = new state.Token('text', '', 0)
                indicatorText.content = ` ^${blockId}`
                const indicatorClose = new state.Token('block_ref_indicator_close', 'span', -1)
                tokens[m].children!.push(indicator, indicatorText, indicatorClose)
                break
              }
              if (tokens[m].type === 'paragraph_close' || tokens[m].type === 'heading_close') break
            }
          }
          break
        }
      }

      i--
      continue
    }

    // Non-standalone: strip ^block-id from visible content
    const markerText = match[0]
    inlineToken.content = content.slice(0, content.length - markerText.length)

    if (inlineToken.children) {
      let remaining = markerText
      for (let c = inlineToken.children.length - 1; c >= 0 && remaining.length > 0; c--) {
        const child = inlineToken.children[c]
        if (child.type === 'text') {
          if (child.content.endsWith(remaining)) {
            child.content = child.content.slice(0, child.content.length - remaining.length)
            remaining = ''
          } else if (remaining.includes(child.content)) {
            remaining = remaining.slice(child.content.length)
            child.content = ''
          }
        } else if (child.type === 'softbreak' && remaining.startsWith('\n')) {
          remaining = remaining.slice(1)
        }
      }
      inlineToken.children = inlineToken.children.filter(
        (c: any) => !(c.type === 'text' && c.content === '')
      )
    }

    if (showIndicator && inlineToken.children) {
      const indicator = new state.Token('block_ref_indicator', 'span', 1)
      indicator.attrPush(['class', indicatorClass])
      indicator.attrPush(['data-block-id', blockId])
      const indicatorText = new state.Token('text', '', 0)
      indicatorText.content = ` ^${blockId}`
      const indicatorClose = new state.Token('block_ref_indicator_close', 'span', -1)
      inlineToken.children.push(indicator, indicatorText, indicatorClose)
    }
  }
}

// ─── Main Core Rule ─────────────────────────────────────────────────────────

function obsidianTransformsRule(opts: Required<ObsidianTransformsOptions>): (state: StateCore) => void {
  const features = opts.features

  return function obsidianTransforms(state: StateCore): void {
    // ── Phase 1: Inline transforms — single walk, ordered sub-passes ──
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue

      // Sub-pass 1: Strip %%comments%% (do first so hidden text is ignored by later passes)
      if (features.comments) {
        applyCommentTransform(token, state, opts.commentStrip)
      }

      // Sub-pass 2: Replace [[wikilinks]] with link tokens
      if (features.wikilinks) {
        applyWikilinkTransform(token, state, opts.wikilinkBaseURL, opts.wikilinkURISuffix)
      }

      // Sub-pass 3: Detect ![[embeds]] (must be after wikilinks)
      if (features.embeds) {
        applyEmbedTransform(token, state, opts.embedWikilinkBase)
      }

      // Sub-pass 4: Replace #tags with anchor tokens
      if (features.tags) {
        applyTagTransform(token, state, opts.tagClass)
      }
    }

    // ── Phase 2: Block-level transforms ──
    if (features.callouts) {
      applyCalloutTransform(state)
    }

    if (features.blockRefs) {
      applyBlockRefTransform(state, opts.blockRefIndicatorClass, opts.blockRefShowIndicator)
    }
  }
}

// ─── Renderer Registration ───────────────────────────────────────────────────

function registerObsidianRenderers(md: MarkdownIt): void {
  // Tag token renderers
  md.renderer.rules['tag_open'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules['tag_close'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

  // Callout token renderers
  const calloutRules = [
    'callout_open', 'callout_close',
    'callout_title_open', 'callout_title_close',
    'callout_icon_open', 'callout_icon_close',
    'callout_title_text_open', 'callout_title_text_close',
    'callout_fold_icon_open', 'callout_fold_icon_close',
    'callout_content_open', 'callout_content_close',
  ]
  for (const rule of calloutRules) {
    md.renderer.rules[rule] = function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }
  }

  // Block reference indicator renderers
  md.renderer.rules['block_ref_indicator'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules['block_ref_indicator_close'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
}

// ─── Plugin Export ───────────────────────────────────────────────────────────

export default function obsidianTransformsPlugin(md: MarkdownIt, opts: ObsidianTransformsOptions = {}): void {
  const features = opts.features ?? {}

  // Resolve all options with defaults
  const resolvedOpts: Required<ObsidianTransformsOptions> = {
    commentStrip: opts.commentStrip ?? true,
    wikilinkBaseURL: opts.wikilinkBaseURL ?? '/',
    wikilinkURISuffix: opts.wikilinkURISuffix ?? '',
    embedWikilinkBase: opts.embedWikilinkBase ?? '/',
    tagClass: opts.tagClass ?? 'obsidian-tag',
    blockRefIndicatorClass: opts.blockRefIndicatorClass ?? 'block-ref-id',
    blockRefShowIndicator: opts.blockRefShowIndicator ?? true,
    features: {
      comments: features.comments ?? true,
      wikilinks: features.wikilinks ?? true,
      embeds: features.embeds ?? true,
      tags: features.tags ?? true,
      callouts: features.callouts ?? true,
      blockRefs: features.blockRefs ?? true,
    },
  }

  // Register the single merged core rule
  md.core.ruler.after('inline', 'obsidian_transforms', obsidianTransformsRule(resolvedOpts))

  // Register all custom renderers
  registerObsidianRenderers(md)
}
