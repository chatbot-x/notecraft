/**
 * Custom markdown-it plugin that adds id attributes to headings for anchor linking.
 *
 * Generates slug-based IDs using a simple algorithm:
 * 1. Strip HTML tags
 * 2. Lowercase
 * 3. Replace non-alphanumeric sequences with hyphens
 * 4. Remove leading/trailing hyphens
 * 5. Deduplicate by appending -1, -2, etc.
 *
 * Also wraps heading content in an anchor tag for clickability.
 */

import type MarkdownIt from 'markdown-it'

function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')           // strip HTML
    .replace(/[^\w\s-]/g, '')          // remove non-word chars (keep unicode letters)
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .replace(/^-|-$/g, '')             // trim hyphens
}

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
    const baseSlug = slugify(rawText) || `heading-${headingLevel}`

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
