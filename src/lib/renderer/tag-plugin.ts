/**
 * Custom markdown-it plugin for Obsidian-style inline tags.
 *
 * Syntax: #tag-name, #nested/tag, #tag_with_underscore
 *
 * Tags are rendered as clickable anchor elements with the class 'obsidian-tag'.
 * They must start with a letter or underscore after the #, and can contain
 * letters, digits, underscores, hyphens, and forward slashes (for nested tags).
 *
 * Context requirements:
 *   - Tags must be preceded by whitespace, start of string, or certain punctuation
 *   - Tags inside code spans (`code`) are NOT matched (different token type)
 *   - Tags inside links are NOT matched
 *   - Heading # markers are NOT matched (consumed by block parser)
 *
 * Backport reference:
 *   - @moritzrs/remark-ofm (OFM tags plugin for remark)
 *   - markdown-it-hashtag (existing markdown-it plugin, but we need more control)
 */

import type MarkdownIt from 'markdown-it'

export interface TagPluginOptions {
  /** CSS class for tag anchor elements. Default: "obsidian-tag" */
  tagClass?: string
}

// Valid tag pattern: starts with letter/underscore, contains word chars, hyphens, slashes
const TAG_NAME_RE = /^[a-zA-Z_][\w/-]*$/

// Characters that can precede a tag (besides start of string)
const TAG_PRECEDING_CHARS = new Set([
  ' ', '\t', '\n', '\r',   // whitespace
  '(', '[', '{',           // opening brackets
  ',', ';', ':',           // punctuation
  '>', '~',                // blockquote, strikethrough
  '"', "'",                // quotes
])

/**
 * Scan a text string for Obsidian-style tags and return segments.
 * Each segment is either plain text or a tag name.
 */
function scanForTags(text: string): Array<{ type: 'text' | 'tag'; content: string }> {
  const results: Array<{ type: 'text' | 'tag'; content: string }> = []
  let i = 0
  const len = text.length

  while (i < len) {
    // Look for # character
    if (text[i] === '#') {
      // Check if preceded by valid context
      const hasValidContext = i === 0 || TAG_PRECEDING_CHARS.has(text[i - 1])

      if (hasValidContext) {
        // Try to match a tag name after #
        let tagEnd = i + 1
        while (tagEnd < len && /[\w/-]/.test(text[tagEnd])) {
          tagEnd++
        }

        const tagName = text.slice(i + 1, tagEnd)

        // Validate: must start with letter/underscore, minimum 1 char
        if (tagName.length > 0 && TAG_NAME_RE.test(tagName)) {
          // Check that the tag is not followed by more word chars
          // (prevents matching #foo in #foobar)
          // Actually, we already consumed all valid tag chars, so this is fine

          // Emit any text before this tag
          if (i > 0 && results.length === 0) {
            // First segment - there might be text before
          }

          results.push({ type: 'tag', content: tagName })
          i = tagEnd
          continue
        }
      }

      // Not a valid tag, add # as text
      results.push({ type: 'text', content: '#' })
      i++
    } else {
      // Collect non-# text
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

export default function tagPlugin(md: MarkdownIt, opts: TagPluginOptions = {}): void {
  const tagClass = opts.tagClass ?? 'obsidian-tag'

  md.core.ruler.after('inline', 'obsidian_tags', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue
      if (!token.children) continue

      // Skip children that are inside code_inline or link tokens
      // (These are separate token types, not text children)
      let modified = false
      const newChildren: any[] = []

      for (const child of token.children) {
        // Only process text tokens that contain #
        if (child.type !== 'text' || !child.content.includes('#')) {
          newChildren.push(child)
          continue
        }

        const segments = scanForTags(child.content)

        // Check if any tags were found
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
            // Create <a class="obsidian-tag" data-tag="tagName" href="#tagName">#tagName</a>
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
        token.children = newChildren
        // Rebuild content from children
        token.content = newChildren
          .map((c: any) => c.content || '')
          .join('')
      }
    }
  })

  // Register renderers for custom token types
  md.renderer.rules['tag_open'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules['tag_close'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
}
