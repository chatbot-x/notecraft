/**
 * Custom markdown-it plugin for Obsidian-style embeds (transclusions).
 *
 * Supports the syntax:
 *   ![[note name]]          — embed an entire note
 *   ![[note#heading]]       — embed a section of a note (heading reference)
 *   ![[note#^block-id]]     — embed a specific block (block reference)
 *   ![[#heading]]           — embed a heading from the current note
 *   ![[#^block-id]]         — embed a block from the current note
 *   ![[image.png]]          — embed an image
 *   ![[image.png|300]]      — embed an image with width 300px
 *   ![[image.png|300x200]]  — embed an image with width x height
 *
 * Implementation strategy:
 *   After the wikilinks plugin processes [[...]] into link tokens, this
 *   plugin scans the token stream for the pattern: text token ending with
 *   "!" followed by a wikilink. It then transforms the link into an
 *   appropriate embed element (image or note).
 *
 *   The "!" prefix is stripped from the preceding text token, and the
 *   wikilink tokens are replaced with the embed HTML.
 *
 * Backport reference:
 *   - remark-obsidian-md: embed rendering with <div class="embed">
 *   - remark-obsidian: transclusion syntax parsing
 *   - @heavycircle/remark-obsidian: block reference handling
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

export interface EmbedPluginOptions {
  /** Base URL for resolving wikilink hrefs. Default: "/" */
  wikilinkBase?: string
}

// Image file extensions (case-insensitive)
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.bmp', '.ico', '.avif', '.tiff', '.tif',
])

// Audio/video extensions
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a', '.flac',
])

// Size pattern: "300" or "300x200"
const SIZE_RE = /^(\d+)(?:x(\d+))?$/

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

function hasExtension(filename: string, extensions: Set<string>): boolean {
  const lower = filename.toLowerCase()
  for (const ext of extensions) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

function parseEmbedFromHref(href: string, displayText: string, wikilinkBase: string): ParsedEmbed {
  // Remove base URL prefix
  let path = href
  if (path.startsWith(wikilinkBase)) {
    path = path.slice(wikilinkBase.length)
  }

  // Decode URI component for the path
  try {
    path = decodeURIComponent(path)
  } catch {
    // Keep as-is if decoding fails
  }

  // Split on # to separate path from fragment
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

  // Check if it's an image or media file
  const isImage = hasExtension(source, IMAGE_EXTENSIONS)
  const isMedia = hasExtension(source, MEDIA_EXTENSIONS)

  // Parse size from display text (alias from |syntax in wikilinks)
  let width: number | undefined
  let height: number | undefined
  let aliasText: string | undefined

  if (displayText && (isImage || isMedia)) {
    const sizeMatch = displayText.match(SIZE_RE)
    if (sizeMatch) {
      width = parseInt(sizeMatch[1], 10)
      if (sizeMatch[2]) {
        height = parseInt(sizeMatch[2], 10)
      }
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

  // Note embed - render as a placeholder for client-side resolution
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

export default function embedPlugin(md: MarkdownIt, opts: EmbedPluginOptions = {}): void {
  const wikilinkBase = opts.wikilinkBase ?? '/'

  md.core.ruler.after('inline', 'obsidian_embeds', (state: StateCore) => {
    for (let i = 0; i < state.tokens.length; i++) {
      if (state.tokens[i].type !== 'inline') continue
      const children = state.tokens[i].children
      if (!children) continue

      // Scan children for pattern: text ending with "!" → link_open (wikilink) → ... → link_close
      // Process in reverse so index shifts don't affect earlier items
      let j = children.length - 1
      while (j >= 1) {
        // Find a link_close token
        if (children[j].type !== 'link_close') {
          j--
          continue
        }

        // Walk backwards to find the matching link_open
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

        // Check if the token before link_open is a text token ending with '!'
        const prevToken = children[linkOpenIdx - 1]
        if (prevToken.type !== 'text' || !prevToken.content.endsWith('!')) {
          j = linkOpenIdx - 1
          continue
        }

        // Check if the link_open has a wikilink-style href
        const href = children[linkOpenIdx].attrGet('href')
        if (!href || !href.startsWith(wikilinkBase)) {
          j = linkOpenIdx - 1
          continue
        }

        // Get the display text from tokens between link_open and link_close
        let displayText = ''
        for (let k = linkOpenIdx + 1; k < j; k++) {
          if (children[k].type === 'text') {
            displayText += children[k].content
          }
        }

        // Parse the embed data
        const embed = parseEmbedFromHref(href, displayText, wikilinkBase)
        const html = generateEmbedHtml(embed, wikilinkBase)

        // Strip the '!' from the preceding text token
        prevToken.content = prevToken.content.slice(0, -1)

        // Replace link_open through link_close with an html_inline token
        const htmlToken = new state.Token('html_inline', '', 0)
        htmlToken.content = html

        children.splice(linkOpenIdx, j - linkOpenIdx + 1, htmlToken)

        // If the text token is now empty, remove it
        if (prevToken.content === '') {
          const idx = children.indexOf(prevToken)
          if (idx !== -1) {
            children.splice(idx, 1)
          }
        }

        // Rebuild the inline token's content from children
        state.tokens[i].content = children
          .map((c: any) => c.content || '')
          .join('')

        // Adjust j for the modified children array
        j = linkOpenIdx - 1
      }
    }
  })
}
