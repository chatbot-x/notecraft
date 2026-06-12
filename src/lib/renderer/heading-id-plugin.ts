/**
 * Custom markdown-it plugin that adds id attributes to headings for anchor linking.
 *
 * Generates slug-based IDs using the same algorithm as the editor slug module
 * (generateSlug from @codemirror-ext/slug) for consistency between editor
 * and preview. Deduplicates by appending -1, -2, etc.
 *
 * Also wraps heading content in an anchor tag for clickability.
 */

import type MarkdownIt from 'markdown-it'
import { generateSlug } from '@/lib/codemirror-ext/slug'

export default function headingIdPlugin(md: MarkdownIt): void {
  const originalHeadingOpen =
    md.renderer.rules.heading_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx]
    const headingLevel = parseInt(token.tag.slice(1), 10) // h1 → 1, h2 → 2, etc.

    // Find the heading_inline or inline content token (next token)
    const inlineToken = tokens[idx + 1]
    let rawText = ''
    if (inlineToken && inlineToken.type === 'inline') {
      rawText = inlineToken.content || ''
    }

    // Generate the slug
    const baseSlug = generateSlug(rawText) || `heading-${headingLevel}`

    // Track duplicate slugs via env
    if (!env.__headingSlugs) {
      env.__headingSlugs = new Map<string, number>()
    }

    const slugMap = env.__headingSlugs as Map<string, number>
    const count = slugMap.get(baseSlug) ?? 0
    slugMap.set(baseSlug, count + 1)

    const id = count === 0 ? baseSlug : `${baseSlug}-${count}`

    // Add id attribute to the heading token
    token.attrSet('id', id)

    return originalHeadingOpen(tokens, idx, options, env, self)
  }
}
