/**
 * Shared utilities for the hybrid rendering plugins.
 *
 * Provides cursor-range checks, regex patterns, and reusable Decoration
 * objects that are shared across all feature plugins.
 */

import { Decoration } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'

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
    // Cursor is on this line if any part of the selection overlaps
    return selFrom <= lineTo && selTo >= lineFrom
  })
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

// ─── Regex Patterns ───────────────────────────────────────────────────────────

/** Match [[wikilink]] or [[target|label]] */
export const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

/** Match ![[embed]] with optional size: ![[image.png|300]] or ![[image.png|300x200]] */
export const EMBED_IMAGE_RE = /!\[\[([^\]|]+?)(?:\|(\d+(?:x\d+)?))?\]\]/g

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

// ─── Feature Flags Type ───────────────────────────────────────────────────────

export interface HybridRenderOptions {
  /** Obsidian wikilinks [[note]] and [[note|label]]. Default: true */
  wikilinks?: boolean
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
}
