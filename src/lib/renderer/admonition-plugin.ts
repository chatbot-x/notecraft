/**
 * Custom markdown-it plugin for code-block admonitions (Obsidian-compatible).
 *
 * Supports the syntax:
 *   ~~~ad-note
 *   Title: Important Note
 *   Content here
 *   ~~~
 *
 *   ~~~ad-warning "Custom Title"
 *   Content here
 *   ~~~
 *
 *   ~~~ad-tip
 *   Just content, auto-generated title
 *   ~~~
 *
 * The info string after "ad-" determines the callout type (same types as
 * the callout plugin: note, info, tip, success, question, warning, failure,
 * danger, bug, example, quote, abstract, todo, important).
 *
 * An optional title can be specified on the first line as:
 *   - "Title: My Title" (key-value)
 *   - "My Title" (plain text, if it doesn't start with lowercase)
 *   - No title (auto-generated from the type)
 *
 * Backport reference:
 *   - ebullient/markdown-it-obsidian-callouts: code-block admonition syntax
 *   - Obsidian Admonition plugin: original code-block admonition syntax
 */

import type MarkdownIt from 'markdown-it'

export interface AdmonitionPluginOptions {
  /** Prefix for info string detection. Default: "ad-" */
  prefix?: string
}

// Callout type icons (same as callout-plugin.ts)
const CALLOUT_ICONS: Record<string, string> = {
  note:      '\u270E',       // ✎
  info:      '\u2139',       // ℹ
  tip:       '\u261D',       // ☝
  success:   '\u2714',       // ✔
  question:  '\u2753',       // ❓
  warning:   '\u26A0',       // ⚠
  failure:   '\u2718',       // ✘
  danger:    '\u26D4',       // ⛔
  bug:       '\u{1F41B}',    // 🐛
  example:   '\u{1F4CB}',    // 📋
  quote:     '\u275D',       // ❝
  abstract:  '\u{1F4D1}',    // 📑
  todo:      '\u{1F4DD}',    // 📝
  important: '\u{1F525}',    // 🔥
}

// Type aliases (same as callout-plugin.ts)
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

// Parse the first line of content for a title
// Supports: "Title: My Title" or "My Title" (if it looks like a title)
function parseTitleFromContent(content: string): { title: string; body: string } {
  const lines = content.split('\n')

  if (lines.length === 0) return { title: '', body: content }

  const firstLine = lines[0].trim()

  // Check for "Title: ..." pattern
  const titleKeyValue = firstLine.match(/^title:\s*(.+)/i)
  if (titleKeyValue) {
    return {
      title: titleKeyValue[1].trim(),
      body: lines.slice(1).join('\n'),
    }
  }

  // Check for "..." pattern (quoted title)
  const quotedTitle = firstLine.match(/^"(.+)"$/)
  if (quotedTitle) {
    return {
      title: quotedTitle[1],
      body: lines.slice(1).join('\n'),
    }
  }

  // No title specified — auto-generate from type
  return { title: '', body: content }
}

export default function admonitionPlugin(md: MarkdownIt, opts: AdmonitionPluginOptions = {}): void {
  const prefix = opts.prefix ?? 'ad-'

  // Intercept the fence renderer to catch ```ad-* blocks
  const defaultFenceRenderer =
    md.renderer.rules.fence ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.fence = function (tokens, idx, opts, env, self) {
    const token = tokens[idx]
    const info = token.info ? token.info.trim().toLowerCase() : ''

    // Check if this is an admonition fence
    if (!info.startsWith(prefix)) {
      return defaultFenceRenderer(tokens, idx, opts, env, self)
    }

    const rawType = info.slice(prefix.length).trim()
    if (!rawType) {
      return defaultFenceRenderer(tokens, idx, opts, env, self)
    }

    // Resolve type alias
    const resolvedType = TYPE_ALIASES[rawType] ?? rawType
    const icon = CALLOUT_ICONS[resolvedType] ?? '\u270E' // default: ✎

    // Parse content
    const content = token.content.trim()
    const { title, body } = parseTitleFromContent(content)

    // Auto-generate title from type if not provided
    const displayTitle = title || resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1)

    // Build the admonition HTML (similar to callout structure)
    let html = `<div class="callout callout-${resolvedType} admonition-code" data-callout="${resolvedType}" data-admonition="${rawType}">`

    // Title section
    html += `<div class="callout-title">`
    html += `<span class="callout-icon">${icon}</span>`
    html += `<span class="callout-title-text">${displayTitle}</span>`
    html += `</div>`

    // Content section
    html += `<div class="callout-content">`
    if (body.trim()) {
      // Render the body content as markdown
      // We need to render it through markdown-it again for inline formatting
      // But since we're in a renderer, we can use the md instance
      const renderedBody = md.render(body)
      // Strip wrapping <p> tags if the body is a single paragraph
      const strippedBody = renderedBody.replace(/^<p>/, '').replace(/<\/p>\n?$/, '')
      html += strippedBody
    }
    html += `</div>`

    html += `</div>\n`

    return html
  }
}
