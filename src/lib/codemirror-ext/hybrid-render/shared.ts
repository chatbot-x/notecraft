/**
 * Shared utilities for the hybrid rendering plugins.
 *
 * Provides cursor-range checks, regex patterns, skip-range utilities,
 * reusable Decoration objects, and the feature-flags type that are shared
 * across all feature plugins.
 */

import { Decoration } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

// ─── Cursor Range Checks ─────────────────────────────────────────────────────

/** Check if any selection range overlaps with [from, to) */
export function isCursorInRange(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => {
    const selFrom = Math.min(r.from, r.to)
    const selTo = Math.max(r.from, r.to)
    return selFrom < to && selTo > from
  })
}

/** Check if any cursor/selection touches a specific line */
export function isCursorOnLine(state: EditorState, lineFrom: number, lineTo: number): boolean {
  return state.selection.ranges.some((r) => {
    const selFrom = Math.min(r.from, r.to)
    const selTo = Math.max(r.from, r.to)
    return selFrom <= lineTo && selTo >= lineFrom
  })
}

// ─── Skip Ranges ──────────────────────────────────────────────────────────────

/**
 * Collect "skip ranges" — ranges inside code blocks and inline code where
 * regex-based plugins should NOT match. This prevents false positives like
 * a #tag inside a code fence or a [[wikilink]] inside inline code.
 *
 * Returns sorted array of { from, to } ranges.
 */
export function collectSkipRanges(state: EditorState, from: number, to: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      // Fenced code blocks, indented code blocks, and inline code
      if (
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'InlineCode'
      ) {
        ranges.push({ from: node.from, to: node.to })
      }
      // Also skip HTML blocks and comments
      if (node.name === 'HTMLBlock' || node.name === 'Comment') {
        ranges.push({ from: node.from, to: node.to })
      }
    },
  })

  return ranges
}

/**
 * Check whether a position range [from, to) falls inside any skip range.
 * Used by regex-based plugins to avoid matching inside code blocks.
 */
export function isInRangeList(
  posFrom: number,
  posTo: number,
  ranges: Array<{ from: number; to: number }>
): boolean {
  for (const r of ranges) {
    if (posFrom >= r.from && posTo <= r.to) return true
    // Early exit since ranges are sorted
    if (r.from > posTo) break
  }
  return false
}

// ─── Shared Constants ────────────────────────────────────────────────────────

/** Known image file extensions for embed detection */
export const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.bmp', '.ico', '.avif', '.tiff', '.tif',
])

/** Check if a filename has a known image extension */
export function isImagePath(filename: string): boolean {
  const lower = filename.toLowerCase()
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

/** Callout type definitions with colors and icons */
export const CALLOUT_TYPES: Record<string, { color: string; icon: string }> = {
  note:      { color: '#448aff', icon: '\u270E' },
  info:      { color: '#448aff', icon: '\u2139' },
  tip:       { color: '#00c853', icon: '\u261D' },
  success:   { color: '#00c853', icon: '\u2714' },
  question:  { color: '#ffab00', icon: '?' },
  warning:   { color: '#ff9100', icon: '\u26A0' },
  failure:   { color: '#ff5252', icon: '\u2718' },
  danger:    { color: '#ff1744', icon: '\u26D4' },
  bug:       { color: '#e040fb', icon: '\uD83D\uDC1B' },
  example:   { color: '#7c4dff', icon: '\uD83D\uDCCB' },
  quote:     { color: '#9e9e9e', icon: '\u275D' },
  abstract:  { color: '#00b8d4', icon: '\uD83D\uDCD1' },
  todo:      { color: '#448aff', icon: '\uD83D\uDCDD' },
  important: { color: '#ff9100', icon: '\uD83D\uDD25' },
}

/** Alias map for callout type names (lowercase) */
export const TYPE_ALIASES: Record<string, string> = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

// ─── Reusable Decoration Objects ──────────────────────────────────────────────

/** Hide text (font-size: 0, position: absolute) — used for syntax markers */
export const hiddenMark = Decoration.mark({
  class: 'cm-hybrid-hidden',
})

/** Active state — show raw syntax with subtle highlight when cursor is inside */
export const activeMark = Decoration.mark({
  class: 'cm-hybrid-active',
})

/** Faded text — used for URL parts of links, blockquote markers */
export const fadedMark = Decoration.mark({
  class: 'cm-hybrid-faded',
})

/** Wikilink label styling */
export const wikilinkLabelMark = Decoration.mark({
  class: 'cm-hybrid-wikilink-label',
})

/** Link label styling */
export const linkLabelMark = Decoration.mark({
  class: 'cm-hybrid-link-label',
})

/** Link URL markers (brackets, parens) — faded */
export const linkFadedMark = Decoration.mark({
  class: 'cm-hybrid-link-faded',
})

/** Math expression styling */
export const mathMark = Decoration.mark({
  class: 'cm-hybrid-math',
})

/** Tag badge styling */
export const tagMark = Decoration.mark({
  class: 'cm-hybrid-tag',
})

/** Inline code background */
export const inlineCodeMark = Decoration.mark({
  class: 'cm-hybrid-inline-code',
})

/** Heading mark (the # characters) — faded when cursor is on another line */
export const headingMarkFaded = Decoration.mark({
  class: 'cm-hybrid-heading-mark',
})

/** Emphasis mark (the * or ** characters) — hidden when cursor is outside */
export const emphasisMarkHidden = Decoration.mark({
  class: 'cm-hybrid-emphasis-mark',
})

/** Blockquote mark (the > character) — faded */
export const quoteMarkFaded = Decoration.mark({
  class: 'cm-hybrid-quote-mark',
})

/** Strikethrough mark (~~) — hidden */
export const strikethroughMarkHidden = Decoration.mark({
  class: 'cm-hybrid-strikethrough-mark',
})

/** Comment text (%%content%%) — hidden */
export const commentMark = Decoration.mark({
  class: 'cm-hybrid-comment',
})

/** Block reference (^id) styling — clickable indicator */
export const blockRefMark = Decoration.mark({
  class: 'cm-hybrid-block-ref',
})

/** Embed transclusion styling */
export const embedMark = Decoration.mark({
  class: 'cm-hybrid-embed',
})

/** Frontmatter collapsed indicator */
export const frontmatterCollapsedMark = Decoration.mark({
  class: 'cm-hybrid-frontmatter-collapsed',
})

// ─── Regex Patterns ───────────────────────────────────────────────────────────

/** Match ![[embed]] with optional size: ![[image.png|300]] or ![[image.png|300x200]] */
export const EMBED_IMAGE_RE = /!\[\[([^\]|]+?)(?:\|(\d+(?:x\d+)?))?\]\]/g

/** Match ![[embed]] for any resource (notes, headings, blocks) — non-image transclusions */
export const EMBED_TRANSCLUDE_RE = /!\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

/** Match ![](url) or ![alt](url) — standard markdown images */
export const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

/** Match $...$ (inline math, not $$) — no lookbehind for Safari compat */
export const INLINE_MATH_RE = /(?:^|[^$])\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g

/** Match $$...$$ (display math) */
export const DISPLAY_MATH_RE = /\$\$([^$]+?)\$\$/g

/** Match Obsidian tags: #tag or #nested/tag (must start with letter/underscore) */
export const TAG_RE = /(?:^|[\s(>[,;:~"'])#([a-zA-Z_][\w/-]*)/g

/** Match Obsidian callout header: > [!type] or > [!type]+ or > [!type]- */
export const CALLOUT_HEADER_RE = /^(\s*>\s*)\[!(\w+)\]([+-]?)(?:[ \t]+(.*))?$/gm

/** Match Obsidian comments: %%comment text%% (non-greedy) */
export const COMMENT_RE = /%%([\s\S]*?)%%/g

/** Match Obsidian block references: ^block-id at end of paragraph/line */
export const BLOCK_REF_RE = /(?:^|\s)\^([a-zA-Z0-9_-]+)\s*$/gm

/** Match YAML frontmatter delimiters: --- at start of doc */
export const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/

/** Match admonition code fence: ~~~ad-note or ```ad-warning etc. */
export const ADMONITION_FENCE_RE = /^(~~~+|```+)\s*ad-(\w+)\s*(?:"([^"]*)")?(?:\n([\s\S]*?))?\1/gm

// ─── Feature Flags Type ───────────────────────────────────────────────────────

export interface HybridRenderOptions {
  /** Obsidian embed images ![[img.png|300]]. Default: true */
  embedImages?: boolean
  /** Standard markdown images ![alt](url). Default: true */
  images?: boolean
  /** Standard markdown links [text](url). Default: true */
  links?: boolean
  /** Interactive checkboxes - [x] / - [ ]. Default: true */
  checkboxes?: boolean
  /** Inline math $...$ and display math $$...$$. Default: true */
  math?: boolean
  /** Obsidian tags #tag. Default: true */
  tags?: boolean
  /** Hide heading # marks when cursor is on another line. Default: true */
  headingMarks?: boolean
  /** Hide bold/italic delimiters (**, *, __, _). Default: true */
  emphasisMarks?: boolean
  /** Obsidian callout line decorations > [!note]. Default: true */
  callouts?: boolean
  /** Code block fence hiding and language badge. Default: true */
  codeBlocks?: boolean
  /** Fade blockquote > markers. Default: true */
  blockquoteMarks?: boolean
  /** Horizontal rule visual rendering. Default: true */
  horizontalRules?: boolean
  /** Inline code background. Default: true */
  inlineCode?: boolean
  /** Hide %%comments%%. Default: true */
  comments?: boolean
  /** Style ^block-refs as clickable indicators. Default: true */
  blockRefs?: boolean
  /** Render ![[note]] transclusions with placeholder widget. Default: true */
  embedTransclusions?: boolean
  /** Collapse YAML frontmatter with toggle. Default: true */
  frontmatter?: boolean
  /** Render ~~~ad-note admonition fences as callouts. Default: true */
  admonitions?: boolean
  /** Apply heading size styling (H1-H6 font sizes). Default: true */
  headingSizes?: boolean
}
