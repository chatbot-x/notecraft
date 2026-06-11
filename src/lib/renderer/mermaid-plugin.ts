/**
 * Custom markdown-it plugin for Mermaid diagram rendering.
 *
 * Detects ```mermaid code fences and renders them as lazy-loaded
 * Mermaid diagrams. In the initial HTML output, we emit a placeholder
 * <div> with a data attribute. The client-side React component then
 * picks these up and renders them with the Mermaid API.
 *
 * This approach avoids bundling the heavy Mermaid library in the
 * server-side rendering path and allows diagrams to render asynchronously.
 */

import type MarkdownIt from 'markdown-it'

const MERMAID_LANG = 'mermaid'

export interface MermaidPluginOptions {
  /** CSS class for the container div. Default: "mermaid-container" */
  containerClass?: string
  /** CSS class for the placeholder while loading. Default: "mermaid-loading" */
  loadingClass?: string
  /** CSS class when rendering fails. Default: "mermaid-error" */
  errorClass?: string
}

export default function mermaidPlugin(md: MarkdownIt, options: MermaidPluginOptions = {}): void {
  const containerClass = options.containerClass ?? 'mermaid-container'
  const loadingClass = options.loadingClass ?? 'mermaid-loading'
  const _errorClass = options.errorClass ?? 'mermaid-error'

  // Intercept the fence renderer to catch ```mermaid blocks
  const defaultFenceRenderer =
    md.renderer.rules.fence ||
    function (tokens, idx, opts, _env, self) {
      return self.renderToken(tokens, idx, opts)
    }

  md.renderer.rules.fence = function (tokens, idx, opts, env, self) {
    const token = tokens[idx]
    const info = token.info ? token.info.trim().toLowerCase() : ''

    if (info !== MERMAID_LANG) {
      return defaultFenceRenderer(tokens, idx, opts, env, self)
    }

    const code = token.content.trim()

    // We escape the mermaid source for embedding in a data attribute
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return (
      `<div class="${containerClass}" data-mermaid-source="${escapedCode}">` +
      `<div class="${loadingClass}">` +
      `<svg width="100%" height="80" viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="10" y="10" rx="8" ry="8" width="380" height="60" fill="currentColor" opacity="0.05"/>` +
      `<text x="200" y="45" text-anchor="middle" fill="currentColor" opacity="0.4" font-size="13" font-family="sans-serif">Loading diagram...</text>` +
      `</svg>` +
      `</div>` +
      `</div>\n`
    )
  }
}
