/**
 * Code block syntax highlighting using Shiki.
 *
 * Provides a lazy-loaded Shiki highlighter that:
 * - Loads Shiki and themes on first use
 * - Caches the highlighter instance across renders
 * - Adds line numbers, line highlighting, and a copy button
 * - Falls back to plain <pre><code> if Shiki fails
 *
 * This is used as a post-processing step after markdown-it rendering
 * rather than a markdown-it plugin, because Shiki is async.
 */

import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme } from 'shiki'
import { logger } from '@/lib/utils'

let highlighterPromise: Promise<Highlighter> | null = null

async function getHighlighter(isDark: boolean): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript', 'typescript', 'python', 'rust', 'go', 'java',
        'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
        'bash', 'shell', 'powershell', 'sql', 'json', 'yaml',
        'toml', 'xml', 'html', 'css', 'scss', 'markdown',
        'jsx', 'tsx', 'vue', 'svelte', 'dart', 'lua',
        'perl', 'r', 'scala', 'haskell', 'elixir', 'clojure',
        'dockerfile', 'make', 'nginx', 'diff',
      ],
    }).catch(err => {
      // Reset so a retry can succeed — don't cache a rejected promise
      highlighterPromise = null
      throw err
    })
  }
  return highlighterPromise
}

export interface HighlightOptions {
  isDark: boolean
  showLineNumbers?: boolean
  highlightLines?: number[]  // 1-based line numbers to highlight
}

/**
 * Highlight a code string using Shiki.
 * Returns HTML with syntax highlighting, optional line numbers,
 * and a copy button overlay.
 */
export async function highlightCode(
  code: string,
  lang: string,
  options: HighlightOptions = { isDark: false }
): Promise<string> {
  const { isDark, showLineNumbers = true } = options
  const theme: BundledTheme = isDark ? 'github-dark' : 'github-light'

  try {
    const highlighter = await getHighlighter(isDark)

    // Normalize language name
    const normalizedLang = normalizeLang(lang)

    // Check if language is loaded, fall back to plain text
    const loadedLangs = highlighter.getLoadedLanguages()
    const effectiveLang = loadedLangs.includes(normalizedLang as BundledLanguage)
      ? normalizedLang
      : 'text'

    const html = highlighter.codeToHtml(code, {
      lang: effectiveLang as BundledLanguage,
      theme,
    })

    // Wrap with line numbers and copy button
    return wrapCodeBlock(html, code, lang, showLineNumbers)
  } catch (err) {
    logger.warn('[Shiki] Highlighting failed:', err)
    // Fallback: plain code block
    return fallbackCodeBlock(code, lang)
  }
}

/**
 * Post-process markdown-it HTML output to highlight all fenced code blocks.
 */
export async function highlightAllCodeBlocks(
  html: string,
  isDark: boolean
): Promise<string> {
  // Match <code class="language-xxx"> or <code class="language-xxx ..."> inside <pre>
  const codeBlockRegex = /<pre><code[^>]*class="[^"]*language-(\w+)[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/g
  const simpleCodeRegex = /<pre><code>([\s\S]*?)<\/code><\/pre>/g

  const replacements: Array<{ match: string; replacement: Promise<string> }> = []

  // Process language-tagged code blocks
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(html)) !== null) {
    const lang = match[1]
    const rawCode = decodeHtmlEntities(match[2])
    const fullMatch = match[0]
    replacements.push({
      match: fullMatch,
      replacement: highlightCode(rawCode, lang, { isDark, showLineNumbers: true }),
    })
  }

  // Process plain code blocks (no language specified)
  while ((match = simpleCodeRegex.exec(html)) !== null) {
    const rawCode = decodeHtmlEntities(match[1])  // simpleCodeRegex has only 1 capture group
    const fullMatch = match[0]
    replacements.push({
      match: fullMatch,
      replacement: highlightCode(rawCode, 'text', { isDark, showLineNumbers: false }),
    })
  }

  // Resolve all replacements in parallel
  const resolved = await Promise.all(replacements.map((r) => r.replacement))

  // Apply replacements using unique placeholders to avoid collision
  // when two code blocks have identical content
  let result = html
  const placeholders: string[] = []
  for (let i = 0; i < replacements.length; i++) {
    const placeholder = `__CODE_BLOCK_${i}_PLACEHOLDER__`
    placeholders.push(placeholder)
    result = result.replace(replacements[i].match, placeholder)
  }
  for (let i = 0; i < replacements.length; i++) {
    result = result.replace(placeholders[i], resolved[i])
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLang(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    csharp: 'csharp',
    'c#': 'csharp',
    'f#': 'fsharp',
    rs: 'rust',
    golang: 'go',
    kt: 'kotlin',
    docker: 'dockerfile',
    makefile: 'make',
  }
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase()
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function wrapCodeBlock(
  highlightedHtml: string,
  rawCode: string,
  lang: string,
  showLineNumbers: boolean
): string {
  const langLabel = lang && lang !== 'text' ? lang : ''

  // Add line numbers by wrapping each line
  let finalHtml = highlightedHtml

  if (showLineNumbers) {
    finalHtml = addLineNumbers(finalHtml)
  }

  return (
    `<div class="code-block-wrapper" data-lang="${langLabel}">` +
    `<div class="code-block-header">` +
    `<span class="code-block-lang">${langLabel}</span>` +
    `<button class="code-copy-btn" data-code="${encodeForAttr(rawCode)}" title="Copy code">` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
    `</button>` +
    `</div>` +
    finalHtml +
    `</div>`
  )
}

function addLineNumbers(html: string): string {
  // Shiki wraps each line in <span class="line"> — count those for accurate numbering
  const lineCount = html.split('<span class="line').length - 1 || html.split('\n').length

  // Build line number column
  const lineNums = Array.from({ length: lineCount }, (_, i) =>
    `<span class="line-number">${i + 1}</span>`
  ).join('\n')

  // We need to add the "code-line" class to each line for the line number CSS
  // Shiki already wraps lines in <span class="line">, so we just add the gutter
  return (
    `<div class="code-block-body">` +
    `<div class="line-numbers">${lineNums}</div>` +
    `<div class="code-content">${html}</div>` +
    `</div>`
  )
}

function fallbackCodeBlock(code: string, lang: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const langLabel = lang && lang !== 'text' ? lang : ''

  return (
    `<div class="code-block-wrapper" data-lang="${langLabel}">` +
    `<div class="code-block-header">` +
    `<span class="code-block-lang">${langLabel}</span>` +
    `<button class="code-copy-btn" data-code="${encodeForAttr(code)}" title="Copy code">` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
    `</button>` +
    `</div>` +
    `<pre><code>${escaped}</code></pre>` +
    `</div>`
  )
}

function encodeForAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;')
}
