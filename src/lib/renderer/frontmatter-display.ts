/**
 * Front matter properties display — renders YAML front matter as a styled
 * collapsible panel at the top of the document.
 *
 * In Obsidian, the YAML properties panel shows at the top of each note in
 * reading mode, displaying key-value pairs in a structured layout.
 *
 * This module is NOT a markdown-it plugin — it's a post-processing step
 * that takes the rendered HTML and the parsed front matter data, then
 * injects a styled <details> block at the beginning of the output.
 *
 * Backport reference:
 *   - remark-obsidian-md: renders frontmatter as <details> UI
 *   - Obsidian: Properties panel in reading mode
 */

export interface FrontMatterDisplayOptions {
  /** CSS class for the frontmatter container. Default: "frontmatter-display" */
  containerClass?: string
  /** Whether to show the frontmatter display. Default: true */
  enabled?: boolean
}

/**
 * Format a front matter value for display.
 * Handles strings, numbers, booleans, arrays, and null.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '<span class="frontmatter-null">null</span>'
  }
  if (typeof value === 'boolean') {
    return `<span class="frontmatter-boolean">${value}</span>`
  }
  if (typeof value === 'number') {
    return `<span class="frontmatter-number">${value}</span>`
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="frontmatter-empty">[]</span>'
    }
    const items = value.map((item) =>
      `<span class="frontmatter-tag">${escapeHtml(String(item))}</span>`
    ).join('')
    return `<span class="frontmatter-array">${items}</span>`
  }
  if (typeof value === 'string') {
    // Check if it's a date-like string
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return `<span class="frontmatter-date">${escapeHtml(value)}</span>`
    }
    return `<span class="frontmatter-string">${escapeHtml(value)}</span>`
  }
  return `<span class="frontmatter-string">${escapeHtml(String(value))}</span>`
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generate a frontmatter display HTML block.
 * Returns empty string if no frontmatter data or if disabled.
 */
export function renderFrontMatterDisplay(
  frontMatter: Record<string, unknown> | null,
  opts: FrontMatterDisplayOptions = {}
): string {
  if (!frontMatter || opts.enabled === false) return ''
  if (Object.keys(frontMatter).length === 0) return ''

  const containerClass = opts.containerClass ?? 'frontmatter-display'

  const entries = Object.entries(frontMatter)
  const rows = entries.map(([key, value]) => {
    return (
      `<tr class="frontmatter-row">` +
      `<td class="frontmatter-key">${escapeHtml(key)}</td>` +
      `<td class="frontmatter-value">${formatValue(value)}</td>` +
      `</tr>`
    )
  }).join('')

  return (
    `<details class="${containerClass}" open>` +
    `<summary class="frontmatter-summary">` +
    `<span class="frontmatter-summary-icon">\u{1F4C1}</span>` +
    `<span class="frontmatter-summary-text">Properties</span>` +
    `<span class="frontmatter-count">${entries.length}</span>` +
    `</summary>` +
    `<table class="frontmatter-table">` +
    `<tbody>${rows}</tbody>` +
    `</table>` +
    `</details>`
  )
}
