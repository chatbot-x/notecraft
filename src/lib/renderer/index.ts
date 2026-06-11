/**
 * NoteCraft Rendering Engine — markdown-it + plugin pipeline
 *
 * Industrial-grade Markdown rendering with 18 plugins:
 * - GFM (tables, strikethrough, task lists, autolinks)
 * - KaTeX math ($...$ and $$...$$)
 * - Mermaid diagrams (lazy-loaded)
 * - Obsidian-style callouts (> [!note], > [!warning]+, > [!danger]-)
 *   with foldable support, type aliases, and data attributes
 * - Wikilinks ([[note name]])
 * - Footnotes ([^1])
 * - Heading anchors with auto-generated IDs
 * - Subscript, superscript, highlighted text
 * - Custom attributes ({.class #id})
 * - Emoji shortcuts (:rocket: → 🚀)
 * - Definition lists (Term / : Definition)
 * - YAML front matter (--- title: ... ---)
 * - Obsidian comments (%%hidden%%)
 * - XSS-safe output via DOMPurify
 * - Syntax highlighting via Shiki (async post-processing)
 *
 * Architecture principle:
 *   markdown-it is the engine, remark is the reference implementation.
 *   We study how remark plugins handle edge cases, then implement the
 *   same logic in markdown-it's token stream model.
 *
 * Usage:
 * ```ts
 * import { renderMarkdown, renderMarkdownSync } from '@/lib/renderer'
 *
 * // Async (with Shiki highlighting)
 * const html = await renderMarkdown(markdown, { isDark: true })
 *
 * // Sync (no highlighting, for SSR or quick preview)
 * const html = renderMarkdownSync(markdown)
 * ```
 */

import MarkdownIt from 'markdown-it'
import katex from '@traptitech/markdown-it-katex'
import wikilinks from 'markdown-it-wikilinks'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import mark from 'markdown-it-mark'
import attrs from 'markdown-it-attrs'
import { full as emojiFull } from 'markdown-it-emoji'
import deflist from 'markdown-it-deflist'
import frontMatter from 'markdown-it-front-matter'

// DOMPurify — browser-only sanitization.
// Since the preview component is client-only (ssr: false), DOMPurify is
// only ever invoked in the browser. We use a lazy init pattern to avoid
// requiring jsdom on the server (which breaks Cloudflare Workers).
let _dompurify: any = null

function getPurify() {
  if (!_dompurify) {
    _dompurify = require('dompurify')
  }
  return _dompurify
}

// Custom plugins (backported from remark ecosystem / built from scratch)
import mermaidPlugin from './mermaid-plugin'
import calloutPlugin from './callout-plugin'
import commentPlugin from './comment-plugin'
import headingIdPlugin from './heading-id-plugin'
import { highlightAllCodeBlocks } from './code-highlighter'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Dark mode toggle — affects Shiki theme and CSS classes. Default: false */
  isDark?: boolean
  /** Base URL for wikilink resolution. Default: "/" */
  wikilinkBase?: string
  /** Called when a wikilink is clicked in the preview. Receives the page name. */
  onWikilinkClick?: (pageName: string) => void
  /** Parsed front matter data (if YAML header exists) */
  frontMatter?: Record<string, unknown>
  /** Enable/disable specific features */
  features?: {
    math?: boolean
    mermaid?: boolean
    callouts?: boolean
    wikilinks?: boolean
    footnotes?: boolean
    taskLists?: boolean
    headingIds?: boolean
    attrs?: boolean
    sub?: boolean
    sup?: boolean
    mark?: boolean
    emoji?: boolean
    deflist?: boolean
    frontMatter?: boolean
    comments?: boolean
  }
}

export interface RenderResult {
  /** Sanitized HTML string */
  html: string
  /** Extracted heading list for TOC generation */
  headings: Array<{ id: string; text: string; level: number }>
  /** Parsed YAML front matter (if present) */
  frontMatter: Record<string, unknown> | null
}

// ─── DOMPurify Configuration ──────────────────────────────────────────────────

const ALLOWED_TAGS = [
  // Standard
  'a', 'abbr', 'acronym', 'address', 'article', 'aside', 'audio',
  'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
  'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'i', 'iframe', 'img', 'input', 'ins',
  'kbd',
  'label', 'legend', 'li',
  'main', 'map', 'mark', 'math', 'meter',
  'nav',
  'ol', 'optgroup', 'option', 'output',
  'p', 'picture', 'pre', 'progress',
  'q',
  'rp', 'rt', 'ruby',
  's', 'samp', 'section', 'select', 'small', 'source', 'span',
  'strike', 'strong', 'sub', 'summary', 'sup', 'svg',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th',
  'thead', 'time', 'tr', 'track',
  'u', 'ul',
  'video',
  'wbr',
  // KaTeX
  'annotation', 'semantics', 'mi', 'mo', 'mn', 'mtext', 'mfrac', 'msqrt',
  'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover',
  'mtable', 'mtr', 'mtd', 'mrow', 'menclose', 'mpadded', 'mspace', 'mprescripts',
  'mstyle', 'merror', 'mfenced',
  // Mermaid
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'g', 'defs', 'clippath', 'lineargradient', 'radialgradient',
  'stop', 'title', 'desc', 'tspan', 'use', 'pattern', 'image', 'foreignobject',
  // Custom
  'input',  // for task list checkboxes
]

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id', 'style', 'width', 'height',
  'name', 'value', 'type', 'checked', 'disabled', 'readonly', 'placeholder',
  'target', 'rel', 'tabindex', 'role', 'aria-*', 'data-*',
  'for', 'cols', 'rows', 'span', 'colspan', 'rowspan',
  'viewbox', 'preserveaspectratio', 'fill', 'stroke', 'stroke-width',
  'transform', 'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity',
  'xmlns', 'version', 'font-size', 'text-anchor', 'dominant-baseline',
  'marker-end', 'marker-start', 'clip-path', 'gradientunits',
  'opacity', 'filter', 'id', 'points', 'open',
]

// ─── YAML Front Matter Parser ────────────────────────────────────────────────

function parseYamlFrontMatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = raw.split('\n')

  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()

    if (!key || value === '') continue

    // Parse arrays: [item1, item2, item3]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean)
    }
    // Parse booleans
    else if (value === 'true') value = true
    else if (value === 'false') value = false
    // Parse numbers
    else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
      value = parseFloat(value)
    }

    result[key] = value
  }

  return result
}

// ─── Markdown-it Instance Factory ─────────────────────────────────────────────

function createMarkdownIt(opts: RenderOptions = {}): MarkdownIt {
  const features = opts.features ?? {}
  const frontMatterData: { value: Record<string, unknown> | null } = { value: null }

  const md = new MarkdownIt({
    html: true,
    xhtmlOut: false,
    breaks: true,
    linkify: true,
    typographer: true,
  })

  // ─── Front Matter (must be first — strips YAML header) ────────────

  if (features.frontMatter !== false) {
    md.use(frontMatter, (raw: string) => {
      frontMatterData.value = parseYamlFrontMatter(raw)
    })
  }

  // ─── Core Plugins ─────────────────────────────────────────────────

  // GFM features (task lists with checkboxes)
  if (features.taskLists !== false) {
    md.use(taskLists, { enabled: true, label: true, lineNumber: true })
  }

  // Footnotes
  if (features.footnotes !== false) {
    md.use(footnote)
  }

  // ─── Formatting Extensions ────────────────────────────────────────

  if (features.sub !== false) md.use(sub)       // H~2~O
  if (features.sup !== false) md.use(sup)       // E=mc^2^
  if (features.mark !== false) md.use(mark)     // ==highlighted==
  if (features.attrs !== false) md.use(attrs)   // {.class #id}

  // ─── Emoji (:rocket: → 🚀) ────────────────────────────────────────

  if (features.emoji !== false) md.use(emojiFull)

  // ─── Definition Lists ─────────────────────────────────────────────

  if (features.deflist !== false) md.use(deflist)

  // ─── Obsidian Comments (%%hidden%%) ───────────────────────────────

  if (features.comments !== false) {
    md.use(commentPlugin, { strip: true })
  }

  // ─── Math (KaTeX) ────────────────────────────────────────────────

  if (features.math !== false) {
    md.use(katex, {
      throwOnError: false,
      output: 'html',
    })
  }

  // ─── Mermaid Diagrams ────────────────────────────────────────────

  if (features.mermaid !== false) {
    md.use(mermaidPlugin)
  }

  // ─── Obsidian-style Callouts ─────────────────────────────────────

  if (features.callouts !== false) {
    md.use(calloutPlugin)
  }

  // ─── Heading IDs ─────────────────────────────────────────────────

  if (features.headingIds !== false) {
    md.use(headingIdPlugin)
  }

  // ─── Wikilinks ───────────────────────────────────────────────────

  if (features.wikilinks !== false) {
    const baseUrl = opts.wikilinkBase ?? '/'
    md.use(wikilinks, {
      baseURL: baseUrl,
      uriSuffix: '',
      makeAllLinkAbsolute: false,
      linkPattern: /\[\[([^\x00-\x1F|]+?)(\|[^\x00-\x1F|]+?)?\]\]/,
      generatePageNameFromLabel: (label: string) => label.trim(),
    })
  }

  // ─── Custom Renderers ────────────────────────────────────────────

  // Make wikilinks use a special class for click handling
  const defaultLinkOpen = md.renderer.rules.link_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const href = tokens[idx].attrGet('href')
    // Add target="_blank" for external links
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    // Mark wikilinks with a class
    if (href && href.startsWith(opts.wikilinkBase ?? '/')) {
      tokens[idx].attrJoin('class', 'wikilink')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }

  // Task list checkbox styling
  md.renderer.rules.bullet_list_open = function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  // Store front matter on the instance for retrieval after render
  ;(md as any).__frontMatter = frontMatterData

  return md
}

// ─── Heading Extraction ───────────────────────────────────────────────────────

function extractHeadings(html: string): Array<{ id: string; text: string; level: number }> {
  const headingRegex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi
  const headings: Array<{ id: string; text: string; level: number }> = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10)
    const id = match[2]
    const text = match[3].replace(/<[^>]+>/g, '').trim()
    headings.push({ id, text, level })
  }

  return headings
}

// ─── Sanitize HTML ────────────────────────────────────────────────────────────

function sanitizeHtml(html: string): string {
  const purify = getPurify()
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: [
      'data-mermaid-source', 'data-callout', 'data-code', 'data-lang',
      'data-callout-foldable', 'data-callout-collapsed',
    ],
    ADD_TAGS: ['input'],
    // Allow data: URIs for images (base64 uploads)
    ADD_DATA_URI_TAGS: ['img'],
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render Markdown to HTML (async — includes Shiki syntax highlighting).
 * This is the primary rendering function for the preview panel.
 */
export async function renderMarkdown(
  markdown: string,
  opts: RenderOptions = {}
): Promise<RenderResult> {
  const md = createMarkdownIt(opts)
  const env: Record<string, unknown> = {}

  // Step 1: Parse and render with markdown-it
  let html = md.render(markdown, env)

  // Step 2: Sanitize with DOMPurify
  html = sanitizeHtml(html)

  // Step 3: Syntax highlight code blocks (async)
  html = await highlightAllCodeBlocks(html, opts.isDark ?? false)

  // Step 4: Extract headings for TOC
  const headings = extractHeadings(html)

  // Step 5: Extract front matter
  const frontMatter = (md as any).__frontMatter?.value ?? null

  return { html, headings, frontMatter }
}

/**
 * Render Markdown to HTML (sync — no Shiki highlighting).
 * Use this for SSR or when you need a quick render without
 * waiting for Shiki to load.
 */
export function renderMarkdownSync(
  markdown: string,
  opts: RenderOptions = {}
): RenderResult {
  const md = createMarkdownIt(opts)
  const env: Record<string, unknown> = {}

  let html = md.render(markdown, env)
  html = sanitizeHtml(html)

  const headings = extractHeadings(html)
  const frontMatter = (md as any).__frontMatter?.value ?? null

  return { html, headings, frontMatter }
}

/**
 * Re-export the markdown-it instance creator for advanced usage.
 */
export { createMarkdownIt }
