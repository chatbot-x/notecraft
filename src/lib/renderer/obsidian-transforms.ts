/**
 * NoteCraft Obsidian Transforms — unified core-rule pipeline.
 *
 * A single `obsidian_transforms` core rule that runs after markdown-it's
 * `inline` phase. The pipeline has two phases:
 *
 *   Phase 1 — Inline transforms (single walk over inline tokens):
 *     1. Comment stripping  (%%hidden%%)
 *     2. Embed detection     (![[note]], ![[image.png|300]])
 *     3. Wikilink detection   ([[note]], [[note#heading]], [[note|alias]])
 *     4. Tag replacement     (#tag, #nested/tag)
 *
 *   Phase 2 — Block transforms (reverse-order token stream mutation):
 *     5. Callout transformation (> [!note], > [!warning]+, > [!danger]-)
 *     6. Block reference handling (^block-id)
 *
 * Ordering constraints for Phase 1:
 *   - Comments first — nice-to-have (skip hidden text in later passes)
 *   - Embeds BEFORE wikilinks — ![[...]] must be consumed first so that
 *     the [[...]] portion isn't also matched as a wikilink
 *   - Tags after wikilinks — so [[#heading]] isn't mis-parsed as a tag
 *   - Tags don't conflict with embeds or comments
 *
 * Architecture principle:
 *   markdown-it is the engine, remark is the reference implementation.
 *   Each sub-transform is a pure function that could be independently tested.
 *
 * Wikilinks were originally handled by the `markdown-it-wikilinks` npm
 * package. That dependency has been removed — wikilinks are now parsed
 * natively in this pipeline with full Obsidian compatibility:
 *   - [[note]]             → basic wikilink
 *   - [[note#heading]]     → heading reference (data-wikilink-heading)
 *   - [[note#^blockid]]    → block reference  (data-wikilink-block)
 *   - [[note|alias]]       → alias display     (alias shown, note as href)
 *   - [[#heading]]         → same-note heading reference
 *   - [[#^blockid]]        → same-note block reference
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import { CALLOUT_TYPES, CALLOUT_ALIASES, DEFAULT_CALLOUT_ICON } from './callout-types'

// ─── Plugin Options ──────────────────────────────────────────────────────────

export interface ObsidianTransformsOptions {
  /** Strip comments entirely (true) or wrap in HTML comment (false). Default: true */
  commentStrip?: boolean
  /** Base URL for resolving embed hrefs. Default: "/" */
  embedBase?: string
  /** CSS class for tag anchor elements. Default: "obsidian-tag" */
  tagClass?: string
  /** CSS class for block reference indicator. Default: "block-ref-id" */
  blockRefIndicatorClass?: string
  /** Whether to show block reference indicators. Default: true */
  blockRefShowIndicator?: boolean
  /** CSS class for wikilink anchor elements. Default: "obsidian-wikilink" */
  wikilinkClass?: string
  /** Feature flags — each can be disabled independently */
  features?: {
    comments?: boolean
    embeds?: boolean
    wikilinks?: boolean
    tags?: boolean
    callouts?: boolean
    blockRefs?: boolean
  }
}

// ─── Regex Constants ─────────────────────────────────────────────────────────

// Comments
const COMMENT_RE = /%%(.*?)%%/g

// Embeds: ![[content]] where content can contain #, ^, | but not newlines
// Captures: group 1 = source (before |), group 2 = size/alias (after |, optional)
const EMBED_RE = /!\[\[([^\]\n|]+?)(\|[^\]\n|]+?)?\]\]/g

// Wikilinks: [[content]] — must NOT be preceded by !
// Captures: group 1 = target (before |), group 2 = alias (after |, optional)
// Supports: [[note]], [[note#heading]], [[note#^blockid]], [[note|alias]], [[#heading]], [[#^blockid]]
const WIKILINK_RE = /(?<!!)\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g

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
  href: string
  displayText: string
  heading?: string
  blockId?: string
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

function hasExtension(filename: string, extensions: Set<string>): boolean {
  const lower = filename.toLowerCase()
  return Array.from(extensions).some(ext => lower.endsWith(ext))
}

/** Parse an embed source string into components */
function parseEmbedSource(source: string, aliasRaw?: string): ParsedEmbed {
  let path = source.trim()
  let heading: string | undefined
  let blockId: string | undefined

  // Split on # to separate path from fragment
  const hashIdx = path.indexOf('#')
  if (hashIdx !== -1) {
    const fragment = path.slice(hashIdx + 1)
    path = path.slice(0, hashIdx)
    if (fragment.startsWith('^')) {
      blockId = fragment.slice(1)
    } else {
      heading = fragment
    }
  }

  const isImage = hasExtension(path, IMAGE_EXTENSIONS)
  const isMedia = hasExtension(path, MEDIA_EXTENSIONS)

  // Parse size from alias (for images/media)
  let width: number | undefined
  let height: number | undefined
  let aliasText: string | undefined

  const displayText = aliasRaw ? aliasRaw.slice(1).trim() : undefined // Remove leading |

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

  return { source: path, heading, blockId, isImage, isMedia, width, height, aliasText }
}

function generateEmbedHtml(embed: ParsedEmbed, embedBase: string): string {
  if (embed.isImage) {
    const src = embedBase + encodeURIComponent(embed.source)
    let imgAttrs = `src="${src}" alt="${embed.source}" class="embed-image"`
    if (embed.width) imgAttrs += ` width="${embed.width}"`
    if (embed.height) imgAttrs += ` height="${embed.height}"`
    return `<img ${imgAttrs} loading="lazy" />`
  }

  if (embed.isMedia) {
    const src = embedBase + encodeURIComponent(embed.source)
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
// No ordering dependencies between sub-passes.

/** Sub-pass 1: Strip %%comment%% from text children */
function applyCommentTransform(inlineToken: Token, state: StateCore, strip: boolean): void {
  const children = inlineToken.children
  if (!children) return

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
        if (part) {
          const textToken = new state.Token('text', '', 0)
          textToken.content = part
          newChildren.push(textToken)
        }
      } else {
        if (!strip) {
          const commentToken = new state.Token('html_inline', '', 0)
          commentToken.content = `<!-- ${part} -->`
          newChildren.push(commentToken)
        }
      }
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

/** Sub-pass 2: Replace ![[embed]] patterns with embed HTML — standalone parsing */
function applyEmbedTransform(
  inlineToken: Token,
  state: StateCore,
  embedBase: string,
): void {
  const children = inlineToken.children
  if (!children) return

  if (!children.some(c => c.type === 'text' && c.content.includes('![['))) return

  const newChildren: Token[] = []
  let modified = false

  for (const child of children) {
    if (child.type !== 'text' || !child.content.includes('![[')) {
      newChildren.push(child)
      continue
    }

    const parts = child.content.split(EMBED_RE)
    if (parts.length <= 1) {
      newChildren.push(child)
      continue
    }

    modified = true

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      if (i % 3 === 0) {
        // Regular text between embeds
        if (part) {
          const textToken = new state.Token('text', '', 0)
          textToken.content = part
          newChildren.push(textToken)
        }
      } else if (i % 3 === 1) {
        // Source part of embed
        const source = part
        const aliasRaw = parts[i + 1] || undefined
        const embed = parseEmbedSource(source, aliasRaw)
        const html = generateEmbedHtml(embed, embedBase)

        const htmlToken = new state.Token('html_inline', '', 0)
        htmlToken.content = html
        newChildren.push(htmlToken)

        // Skip the alias part (i+1) since we already processed it
        i++
      }
      // i % 3 === 2 is the alias capture group, handled with i%3===1
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

/** Sub-pass 3: Replace [[wikilink]] patterns with wikilink anchor tokens */
function applyWikilinkTransform(
  inlineToken: Token,
  state: StateCore,
  wikilinkClass: string,
): void {
  const children = inlineToken.children
  if (!children) return

  if (!children.some(c => c.type === 'text' && c.content.includes('[['))) return

  const newChildren: Token[] = []
  let modified = false

  for (const child of children) {
    if (child.type !== 'text' || !child.content.includes('[[')) {
      newChildren.push(child)
      continue
    }

    // Skip if this text contains an embed prefix (embeds already consumed by sub-pass 2)
    // But some [[...]] may remain that are NOT preceded by !
    WIKILINK_RE.lastIndex = 0
    if (!WIKILINK_RE.test(child.content)) {
      newChildren.push(child)
      continue
    }

    modified = true

    // Reset regex and split
    WIKILINK_RE.lastIndex = 0
    const parts = child.content.split(WIKILINK_RE)

    // split with 2 capture groups: parts = [text, target, alias, text, target, alias, ...]
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
        const target = part.trim()
        const alias = parts[i + 1]?.trim() || undefined

        // Parse target into href, heading, blockId
        const parsed = parseWikilinkTarget(target, alias)

        // Create wikilink_open token
        const openToken = new state.Token('wikilink_open', 'a', 1)
        openToken.attrPush(['class', wikilinkClass])
        openToken.attrPush(['href', parsed.href])
        openToken.attrPush(['data-wikilink-page', parsed.href.startsWith('#') ? '' : parsed.href.replace(/#.*$/, '')])
        if (parsed.heading) openToken.attrPush(['data-wikilink-heading', parsed.heading])
        if (parsed.blockId) openToken.attrPush(['data-wikilink-block', parsed.blockId])
        newChildren.push(openToken)

        // Display text
        const textToken = new state.Token('text', '', 0)
        textToken.content = parsed.displayText
        newChildren.push(textToken)

        // wikilink_close token
        const closeToken = new state.Token('wikilink_close', 'a', -1)
        newChildren.push(closeToken)

        // Skip the alias part (i+1) since we already processed it
        i++
      }
      // i % 3 === 2 is the alias capture group, handled with i%3===1
    }
  }

  if (modified) {
    inlineToken.children = newChildren
    rebuildInlineContent(inlineToken)
  }
}

/** Parse a wikilink target string into href, display text, heading, and block ID */
function parseWikilinkTarget(target: string, alias?: string): ParsedWikilink {
  let path = target
  let heading: string | undefined
  let blockId: string | undefined

  // Split on # to separate path from fragment
  const hashIdx = path.indexOf('#')
  if (hashIdx !== -1) {
    const fragment = path.slice(hashIdx + 1)
    path = path.slice(0, hashIdx)
    if (fragment.startsWith('^')) {
      blockId = fragment.slice(1)
    } else {
      heading = fragment
    }
  }

  // Build href
  let href: string
  if (path === '' && (heading || blockId)) {
    // Same-note reference: [[#heading]] or [[#^blockid]]
    href = heading ? `#${heading}` : `#^${blockId}`
  } else {
    href = path.replace(/\s+/g, '%20')
    if (heading) href += `#${heading}`
    if (blockId) href += `#^${blockId}`
  }

  // Build display text
  let displayText: string
  if (alias) {
    displayText = alias
  } else if (heading) {
    displayText = heading
  } else if (blockId) {
    displayText = `^${blockId}`
  } else {
    displayText = path
  }

  return { href, displayText, heading, blockId }
}

/** Sub-pass 4: Replace #tag patterns with tag anchor tokens */
function applyTagTransform(
  inlineToken: Token,
  state: StateCore,
  tagClass: string,
): void {
  const children = inlineToken.children
  if (!children) return

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

  for (let r = toTransform.length - 1; r >= 0; r--) {
    const { openIdx, closeIdx, parsed } = toTransform[r]
    const meta = CALLOUT_TYPES[parsed.resolvedType] ?? { icon: DEFAULT_CALLOUT_ICON }
    const displayType = parsed.resolvedType

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

    let paraOpenIdx = -1
    let paraCloseIdx = -1
    let inlineIdx = -1
    for (let j = openIdx + 1; j < closeIdx; j++) {
      if (tokens[j].type === 'paragraph_open' && paraOpenIdx === -1) paraOpenIdx = j
      if (tokens[j].type === 'inline' && inlineIdx === -1) inlineIdx = j
      if (tokens[j].type === 'paragraph_close' && paraCloseIdx === -1) paraCloseIdx = j
    }
    if (inlineIdx === -1) continue

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

    tokens.splice(openIdx + 1, 0, ...titleTokens)

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
    // ── Phase 1: Inline transforms — single walk ──
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue

      // Sub-pass 1: Strip %%comments%%
      if (features.comments) {
        applyCommentTransform(token, state, opts.commentStrip)
      }

      // Sub-pass 2: Replace ![[embeds]] (must run before wikilinks to consume ![[...]])
      if (features.embeds) {
        applyEmbedTransform(token, state, opts.embedBase)
      }

      // Sub-pass 3: Replace [[wikilinks]] (runs after embeds so ![[...]] is already consumed)
      if (features.wikilinks) {
        applyWikilinkTransform(token, state, opts.wikilinkClass)
      }

      // Sub-pass 4: Replace #tags (runs after wikilinks so [[#heading]] isn't mis-parsed)
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
  // Wikilink token renderers
  md.renderer.rules['wikilink_open'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules['wikilink_close'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

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

  const resolvedOpts: Required<ObsidianTransformsOptions> = {
    commentStrip: opts.commentStrip ?? true,
    embedBase: opts.embedBase ?? '/',
    tagClass: opts.tagClass ?? 'obsidian-tag',
    blockRefIndicatorClass: opts.blockRefIndicatorClass ?? 'block-ref-id',
    blockRefShowIndicator: opts.blockRefShowIndicator ?? true,
    wikilinkClass: opts.wikilinkClass ?? 'obsidian-wikilink',
    features: {
      comments: features.comments ?? true,
      embeds: features.embeds ?? true,
      wikilinks: features.wikilinks ?? true,
      tags: features.tags ?? true,
      callouts: features.callouts ?? true,
      blockRefs: features.blockRefs ?? true,
    },
  }

  md.core.ruler.after('inline', 'obsidian_transforms', obsidianTransformsRule(resolvedOpts))
  registerObsidianRenderers(md)
}
