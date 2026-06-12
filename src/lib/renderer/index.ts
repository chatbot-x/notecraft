/**
 * NoteCraft Rendering Engine — markdown-it + plugin pipeline
 *
 * Markdown rendering with these features:
 * - GFM (tables, strikethrough, task lists, autolinks)
 * - KaTeX math ($...$ and $$...$$)
 * - Mermaid diagrams (lazy-loaded)
 * - Obsidian-style callouts (> [!note], > [!warning]+, > [!danger]-)
 *   with foldable support, type aliases, and data attributes
 * - Code-block admonitions (~~~ad-note)
 * - Obsidian embeds (![[note]], ![[image.png|300]], ![[note#^blockid]])
 * - Obsidian tags (#tag, #nested/tag)
 * - Obsidian block references (^block-id)
 * - Obsidian comments (%%hidden%%)
 * - Front matter properties display (rendered as collapsible panel)
 * - Footnotes ([^1])
 * - Heading anchors with auto-generated IDs
 * - Subscript, superscript, highlighted text
 * - Custom attributes ({.class #id})
 * - Emoji shortcuts (:rocket: → 🚀)
 * - Definition lists (Term / : Definition)
 * - YAML front matter (--- title: ... ---)
 * - XSS-safe output via DOMPurify
 * - Syntax highlighting via Shiki (async post-processing)
 *
 * Architecture principle:
 *   markdown-it is the engine, remark is the reference implementation.
 *   We study how remark plugins handle edge cases, then implement the
 *   same logic in markdown-it's token stream model.
 */

import MarkdownIt from 'markdown-it'
import katex from '@traptitech/markdown-it-katex'
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
// importing jsdom on the server (which breaks Cloudflare Workers).
let _dompurify: any = null

async function getPurify() {
  if (!_dompurify) {
    _dompurify = (await import('dompurify')).default
  }
  return _dompurify
}

// Synchronous fallback for renderMarkdownSync — uses require() since
// this code path only runs in the browser where CJS compat is guaranteed.
function getPurifySync() {
  if (!_dompurify) {
    _dompurify = require('dompurify')
  }
  return _dompurify
}

// Custom plugins (backported from remark ecosystem / built from scratch)
import mermaidPlugin from './mermaid-plugin'
import obsidianTransforms from './obsidian-transforms'
import headingIdPlugin from './heading-id-plugin'
import admonitionPlugin from './admonition-plugin'
import { highlightAllCodeBlocks } from './code-highlighter'
import { renderFrontMatterDisplay } from './frontmatter-display'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Dark mode toggle — affects Shiki theme and CSS classes. Default: false */
  isDark?: boolean
  /** Base URL for embed resolution. Default: "/" */
  embedBase?: string
  /** Called when an Obsidian tag is clicked. Receives the tag name. */
  onTagClick?: (tagName: string) => void
  /** Called when an embed note is clicked. Receives the source path. */
  onEmbedClick?: (source: string, heading?: string, blockId?: string) => void
  /** Parsed front matter data (if YAML header exists) */
  frontMatter?: Record<string, unknown>
  /** Enable/disable specific features */
  features?: {
    math?: boolean
    mermaid?: boolean
    callouts?: boolean
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
    /** Obsidian inline tags (#tag) */
    tags?: boolean
    /** Obsidian embeds (![[note]], ![[image.png|300]]) */
    embeds?: boolean
    /** Obsidian block references (^block-id) */
    blockRefs?: boolean
    /** Code-block admonitions (~~~ad-note) */
    admonitions?: boolean
    /** Front matter properties display (collapsible panel) */
    frontMatterDisplay?: boolean
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
  'em',
  'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'i', 'img', 'input', 'ins',
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
]

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id', 'width', 'height',
  'name', 'value', 'type', 'checked', 'disabled', 'readonly', 'placeholder',
  'target', 'rel', 'tabindex', 'role', 'aria-*', 'data-*',
  'for', 'cols', 'rows', 'span', 'colspan', 'rowspan',
  'viewbox', 'preserveaspectratio', 'fill', 'stroke', 'stroke-width',
  'transform', 'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity',
  'xmlns', 'version', 'font-size', 'text-anchor', 'dominant-baseline',
  'marker-end', 'marker-start', 'clip-path', 'gradientunits',
  'opacity', 'filter', 'id', 'points', 'open', 'loading', 'controls',
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
  const embedBase = opts.embedBase ?? '/'

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

  // ─── Code-block Admonitions (~~~ad-note) ─────────────────────────

  if (features.admonitions !== false) {
    md.use(admonitionPlugin)
  }

  // ─── Heading IDs ─────────────────────────────────────────────────

  if (features.headingIds !== false) {
    md.use(headingIdPlugin)
  }

  // ─── Obsidian Transforms (merged core-rule pipeline) ───────────────
  // Single `obsidian_transforms` core rule: one inline walk
  // (comment → embed → tag sub-passes) then block-level transforms
  // (callout, block-ref).

  md.use(obsidianTransforms, {
    commentStrip: true,
    embedBase,
    tagClass: 'obsidian-tag',
    blockRefIndicatorClass: 'block-ref-id',
    blockRefShowIndicator: true,
    features: {
      comments: features.comments !== false,
      embeds: features.embeds !== false,
      tags: features.tags !== false,
      callouts: features.callouts !== false,
      blockRefs: features.blockRefs !== false,
    },
  })

  // ─── Custom Renderers ────────────────────────────────────────────

  // Add target="_blank" for external links
  const defaultLinkOpen = md.renderer.rules.link_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const href = tokens[idx].attrGet('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
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

async function sanitizeHtml(html: string): Promise<string> {
  const purify = await getPurify()
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: [
      'data-mermaid-source',
      'data-callout', 'data-callout-foldable', 'data-callout-collapsed',
      'data-admonition',
      'data-code', 'data-lang',
      'data-tag',
      'data-embed-src', 'data-embed-type', 'data-embed-heading', 'data-embed-block',
      'data-embed-placeholder',
      'data-block-id',
    ],
    // Allow data: URIs for images (base64 uploads)
    ADD_DATA_URI_TAGS: ['img'],
  })
}

/** Synchronous sanitization for renderMarkdownSync — only called in browser. */
function sanitizeHtmlSync(html: string): string {
  const purify = getPurifySync()
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: [
      'data-mermaid-source',
      'data-callout', 'data-callout-foldable', 'data-callout-collapsed',
      'data-admonition',
      'data-code', 'data-lang',
      'data-tag',
      'data-embed-src', 'data-embed-type', 'data-embed-heading', 'data-embed-block',
      'data-embed-placeholder',
      'data-block-id',
    ],
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

  // Step 2: Inject front matter properties display BEFORE sanitization
  // so that DOMPurify can sanitize the injected HTML as well
  const frontMatter = (md as any).__frontMatter?.value ?? null
  const features = opts.features ?? {}
  if (features.frontMatterDisplay !== false && frontMatter) {
    const fmHtml = renderFrontMatterDisplay(frontMatter)
    if (fmHtml) {
      html = fmHtml + html
    }
  }

  // Step 3: Sanitize with DOMPurify (async)
  html = await sanitizeHtml(html)

  // Step 4: Syntax highlight code blocks (async)
  html = await highlightAllCodeBlocks(html, opts.isDark ?? false)

  // Step 5: Extract headings for TOC
  const headings = extractHeadings(html)

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

  // Inject front matter display BEFORE sanitization
  const frontMatter = (md as any).__frontMatter?.value ?? null
  const features = opts.features ?? {}
  if (features.frontMatterDisplay !== false && frontMatter) {
    const fmHtml = renderFrontMatterDisplay(frontMatter)
    if (fmHtml) {
      html = fmHtml + html
    }
  }

  html = sanitizeHtmlSync(html)

  const headings = extractHeadings(html)

  return { html, headings, frontMatter }
}

/**
 * Re-export the markdown-it instance creator for advanced usage.
 */
export { createMarkdownIt }
