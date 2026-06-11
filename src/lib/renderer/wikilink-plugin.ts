/**
 * Custom markdown-it plugin for Obsidian-style wikilinks.
 *
 * Supports the syntax:
 *   [[note name]]          — link to a note
 *   [[note#heading]]       — link to a heading within a note
 *   [[note#^block-id]]     — link to a block reference within a note
 *   [[note|display text]]  — link with custom display text (alias)
 *   [[#heading]]           — link to a heading in the current note
 *   [[#^block-id]]         — link to a block in the current note
 *
 * Implementation strategy:
 *   Uses a core rule that scans text tokens for [[...]] patterns
 *   and replaces them with link_open / text / link_close tokens.
 *   This avoids the dependency on `reurl` which causes build failures
 *   on Cloudflare Pages (ESM-only package without CJS dist).
 *
 * Replaces: markdown-it-wikilinks (which depends on the broken `reurl` package)
 *
 * Backport reference:
 *   - remark-obsidian-md: wikilink parsing with heading/block references
 *   - @moritzrs/remark-ofm: OFM wikilink syntax
 */

import type MarkdownIt from 'markdown-it'

export interface WikilinkPluginOptions {
  /** Base URL for wikilink hrefs. Default: "/" */
  baseURL?: string
  /** URI suffix appended to hrefs. Default: "" */
  uriSuffix?: string
}

// Wikilink pattern: [[content]] where content can contain #, ^, | but not newlines
// Captures: group 1 = target (before |), group 2 = alias (after |, optional)
const WIKILINK_RE = /\[\[([^\]\n|]+?)(\|[^\]\n|]+?)?\]\]/g

// Parse the target part of a wikilink into components
interface ParsedWikilink {
  /** The note path/name (before any #) */
  pageName: string
  /** Heading reference (after #, not starting with ^) */
  heading?: string
  /** Block reference (after #^) */
  blockId?: string
  /** Display text from the | alias syntax */
  alias?: string
}

function parseWikilinkTarget(target: string, aliasRaw?: string): ParsedWikilink {
  let pageName = target.trim()
  let heading: string | undefined
  let blockId: string | undefined

  // Split on # to separate page name from fragment
  const hashIdx = pageName.indexOf('#')
  if (hashIdx !== -1) {
    const fragment = pageName.slice(hashIdx + 1)
    pageName = pageName.slice(0, hashIdx)

    if (fragment.startsWith('^')) {
      // Block reference: [[note#^blockid]]
      blockId = fragment.slice(1)
    } else {
      // Heading reference: [[note#heading]]
      heading = fragment
    }
  }

  // Handle [[#heading]] (current note reference)
  if (!pageName && (heading || blockId)) {
    pageName = ''
  }

  // Parse alias from | syntax
  let alias: string | undefined
  if (aliasRaw) {
    alias = aliasRaw.slice(1).trim() // Remove leading |
  }

  return { pageName, heading, blockId, alias }
}

export default function wikilinkPlugin(md: MarkdownIt, opts: WikilinkPluginOptions = {}): void {
  const baseURL = opts.baseURL ?? '/'
  const uriSuffix = opts.uriSuffix ?? ''

  md.core.ruler.after('inline', 'obsidian_wikilinks', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue
      if (!token.children) continue

      let modified = false
      const newChildren: any[] = []

      for (const child of token.children) {
        // Only process text tokens that contain [[
        if (child.type !== 'text' || !child.content.includes('[[')) {
          newChildren.push(child)
          continue
        }

        // Split on [[...]] patterns
        const parts = child.content.split(WIKILINK_RE)
        // split with capture groups gives: [before, target, alias, after, target, alias, ...]
        // odd indices (1,4,7,...) = target, even indices after (2,5,8,...) = alias
        // even indices (0,3,6,...) = text between wikilinks

        if (parts.length <= 1) {
          newChildren.push(child)
          continue
        }

        modified = true

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]

          if (i % 3 === 0) {
            // Regular text (between wikilinks)
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
              // Current note reference: [[#heading]] or [[#^blockid]]
              href = baseURL + uriSuffix
            }

            // Add fragment if present
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

            // Create link_open tokens
            const linkOpen = new state.Token('link_open', 'a', 1)
            linkOpen.attrPush(['href', href])
            linkOpen.attrPush(['class', 'wikilink'])

            // Add data attributes for heading/block references
            if (parsed.heading) {
              linkOpen.attrPush(['data-wikilink-heading', parsed.heading])
            }
            if (parsed.blockId) {
              linkOpen.attrPush(['data-wikilink-block', parsed.blockId])
            }

            newChildren.push(linkOpen)

            // Display text
            const textToken = new state.Token('text', '', 0)
            textToken.content = displayText
            newChildren.push(textToken)

            // link_close
            const linkClose = new state.Token('link_close', 'a', -1)
            newChildren.push(linkClose)

            // Skip the alias part (i+1) since we already processed it
            i++ // Will be incremented again in the loop
          }
          // i % 3 === 2 is the alias capture group, already handled with i%3===1
        }
      }

      if (modified) {
        token.children = newChildren
        // Rebuild content from children
        token.content = newChildren
          .map((c: any) => c.content || '')
          .join('')
      }
    }
  })
}
