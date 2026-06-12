/**
 * Shared callout type definitions — used by both callout and admonition plugins.
 *
 * Extracted from the original callout-plugin.ts and admonition-plugin.ts
 * to eliminate the duplicated CALLOUT_ICONS and TYPE_ALIASES maps.
 *
 * Backport references:
 *   - flowershow/remark-callouts: type aliasing
 *   - @r4ai/remark-callout: canonical type set
 */

export interface CalloutMeta {
  icon: string
}

/** Canonical callout types with their icons */
export const CALLOUT_TYPES: Record<string, CalloutMeta | undefined> = {
  note:      { icon: '\u270E' },       // ✎
  info:      { icon: '\u2139' },       // ℹ
  tip:       { icon: '\u261D' },       // ☝
  success:   { icon: '\u2714' },       // ✔
  question:  { icon: '\u2753' },       // ❓
  warning:   { icon: '\u26A0' },       // ⚠
  failure:   { icon: '\u2718' },       // ✘
  danger:    { icon: '\u26D4' },       // ⛔
  bug:       { icon: '\u{1F41B}' },    // 🐛
  example:   { icon: '\u{1F4CB}' },    // 📋
  quote:     { icon: '\u275D' },       // ❝
  abstract:  { icon: '\u{1F4D1}' },    // 📑
  todo:      { icon: '\u{1F4DD}' },    // 📝
  important: { icon: '\u{1F525}' },    // 🔥
}

/**
 * Type aliases — maps alternative type names to their canonical equivalents.
 * Backported from flowershow/remark-callouts.
 */
export const CALLOUT_ALIASES: Record<string, string> = {
  // abstract aliases
  summary: 'abstract',
  tldr: 'abstract',

  // tip aliases
  hint: 'tip',

  // success aliases
  check: 'success',
  done: 'success',

  // question aliases
  help: 'question',
  faq: 'question',

  // warning aliases
  caution: 'warning',
  attention: 'warning',

  // failure aliases
  fail: 'failure',
  missing: 'failure',

  // danger aliases
  error: 'danger',

  // quote aliases
  cite: 'quote',
}

/** Default icon for unknown callout types */
export const DEFAULT_CALLOUT_ICON = '\u270E' // ✎
