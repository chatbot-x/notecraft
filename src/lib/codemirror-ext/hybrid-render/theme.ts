/**
 * Unified theme for all hybrid rendering decorations.
 *
 * Uses EditorView.baseTheme with &dark selectors for dark mode.
 * All CSS class names follow the `cm-hybrid-*` convention.
 *
 * Includes smooth CSS transitions for mark hide/show animations,
 * which is a key part of the Obsidian Live Preview feel.
 */

import { EditorView } from '@codemirror/view'

export const hybridRenderTheme = EditorView.baseTheme({
  // ─── Hidden text (syntax markers) ───────────────────────────────────────
  '.cm-hybrid-hidden': {
    fontSize: '0',
    lineHeight: '0',
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    verticalAlign: 'middle',
    position: 'absolute',
    pointerEvents: 'none',
  },

  // ─── Active state (cursor inside → raw syntax shown) ────────────────────
  '.cm-hybrid-active': {
    backgroundColor: 'rgba(100, 140, 220, 0.08)',
    borderRadius: '3px',
  },

  // ─── Faded text ─────────────────────────────────────────────────────────
  '.cm-hybrid-faded': {
    opacity: '0.35',
    fontSize: '0.85em',
  },

  // ─── Embed label (non-image embed targets) ─────────────────────────────
  '.cm-hybrid-embed-label': {
    color: '#7c5cfc',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },

  // ─── Link label ─────────────────────────────────────────────────────────
  '.cm-hybrid-link-label': {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },

  // ─── Link URL markers (brackets, parens) ────────────────────────────────
  '.cm-hybrid-link-faded': {
    opacity: '0.35',
    fontSize: '0.85em',
  },

  // ─── Tag badge ──────────────────────────────────────────────────────────
  '.cm-hybrid-tag': {
    color: '#7c5cfc',
    backgroundColor: 'rgba(124, 92, 252, 0.1)',
    borderRadius: '4px',
    padding: '1px 5px',
    fontSize: '0.9em',
    cursor: 'pointer',
    fontWeight: '500',
  },

  // ─── Math expression ────────────────────────────────────────────────────
  '.cm-hybrid-math': {
    color: '#b45309',
    fontFamily: 'var(--font-geist-mono), monospace',
    fontSize: '0.9em',
  },

  // ─── Math preview widgets ───────────────────────────────────────────────
  '.cm-hybrid-math-inline': {
    display: 'inline',
  },
  '.cm-hybrid-math-display': {
    display: 'block',
    textAlign: 'center' as string,
    margin: '0.5em 0',
  },
  '.cm-hybrid-math-raw': {
    fontFamily: 'var(--font-geist-mono), monospace',
    color: '#b45309',
    opacity: '0.8',
  },

  // ─── Checkbox widget ────────────────────────────────────────────────────
  '.cm-hybrid-checkbox': {
    appearance: 'none',
    WebkitAppearance: 'none',
    width: '1em',
    height: '1em',
    border: '2px solid #94a3b8',
    borderRadius: '3px',
    cursor: 'pointer',
    verticalAlign: 'middle',
    position: 'relative',
    background: 'transparent',
    transition: 'all 0.15s',
    margin: '0 0.3em 0 0',
    display: 'inline-block',
  },
  '.cm-hybrid-checkbox:checked': {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  '.cm-hybrid-checkbox:checked::after': {
    content: '""',
    position: 'absolute' as string,
    top: '1px',
    left: '3px',
    width: '5px',
    height: '9px',
    border: 'solid white',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)',
  },
  '.cm-hybrid-checkbox:hover': {
    borderColor: '#3b82f6',
  },

  // ─── Image thumbnail ────────────────────────────────────────────────────
  '.cm-hybrid-image-container': {
    display: 'inline-block',
    maxWidth: '200px',
    maxHeight: '150px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.1)',
    verticalAlign: 'middle',
    margin: '0 0.2em',
    cursor: 'zoom-in',
    transition: 'box-shadow 0.2s, border-color 0.2s',
  },
  '.cm-hybrid-image-container:hover': {
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    borderColor: 'rgba(0,0,0,0.2)',
  },
  '.cm-hybrid-image-thumb': {
    maxWidth: '100%',
    maxHeight: '150px',
    objectFit: 'cover' as string,
    display: 'block',
  },
  '.cm-hybrid-image-error .cm-hybrid-image-thumb': {
    minWidth: '80px',
    minHeight: '40px',
    padding: '4px 8px',
    objectFit: 'unset',
    fontSize: '0.8em',
  },
  '.cm-hybrid-image-pending .cm-hybrid-image-thumb': {
    minWidth: '60px',
    minHeight: '30px',
    background: 'rgba(0,0,0,0.03)',
  },

  // ─── Inline code ────────────────────────────────────────────────────────
  '.cm-hybrid-inline-code': {
    borderRadius: '3px',
    padding: '0 3px',
  },

  // ─── Heading mark (faded #) ─────────────────────────────────────────────
  '.cm-hybrid-heading-mark': {
    opacity: '0.3',
    fontSize: '0.85em',
    transition: 'opacity 0.2s ease, font-size 0.2s ease',
  },

  // ─── Heading size styling (H1-H6) ──────────────────────────────────────
  '.cm-hybrid-h1': {
    fontSize: '1.6em',
    fontWeight: '700',
    lineHeight: '1.3',
  },
  '.cm-hybrid-h2': {
    fontSize: '1.4em',
    fontWeight: '600',
    lineHeight: '1.3',
  },
  '.cm-hybrid-h3': {
    fontSize: '1.2em',
    fontWeight: '600',
    lineHeight: '1.3',
  },
  '.cm-hybrid-h4': {
    fontSize: '1.1em',
    fontWeight: '600',
    lineHeight: '1.3',
  },
  '.cm-hybrid-h5': {
    fontSize: '1em',
    fontWeight: '600',
    lineHeight: '1.3',
  },
  '.cm-hybrid-h6': {
    fontSize: '0.9em',
    fontWeight: '600',
    lineHeight: '1.3',
    color: '#666',
  },

  // ─── Emphasis marks (hidden **, *, etc.) ────────────────────────────────
  '.cm-hybrid-emphasis-mark': {
    fontSize: '0',
    lineHeight: '0',
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    verticalAlign: 'middle',
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'font-size 0.15s ease, width 0.15s ease, opacity 0.15s ease',
  },

  // ─── Strikethrough marks (hidden ~~) ────────────────────────────────────
  '.cm-hybrid-strikethrough-mark': {
    fontSize: '0',
    lineHeight: '0',
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    verticalAlign: 'middle',
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'font-size 0.15s ease, width 0.15s ease, opacity 0.15s ease',
  },

  // ─── Blockquote mark (faded >) ──────────────────────────────────────────
  '.cm-hybrid-quote-mark': {
    opacity: '0.3',
    fontSize: '0.85em',
    transition: 'opacity 0.2s ease',
  },

  // ─── Callout decorations ────────────────────────────────────────────────
  '.cm-hybrid-callout': {
    borderLeft: '3px solid #448aff',
    paddingLeft: '8px',
    marginLeft: '-4px',
    background: 'rgba(68, 138, 255, 0.04)',
    borderRadius: '0 4px 4px 0',
  },
  '.cm-hybrid-callout-note': {
    borderLeftColor: '#448aff',
    background: 'rgba(68, 138, 255, 0.04)',
  },
  '.cm-hybrid-callout-info': {
    borderLeftColor: '#448aff',
    background: 'rgba(68, 138, 255, 0.04)',
  },
  '.cm-hybrid-callout-tip': {
    borderLeftColor: '#00c853',
    background: 'rgba(0, 200, 83, 0.04)',
  },
  '.cm-hybrid-callout-success': {
    borderLeftColor: '#00c853',
    background: 'rgba(0, 200, 83, 0.04)',
  },
  '.cm-hybrid-callout-question': {
    borderLeftColor: '#ffab00',
    background: 'rgba(255, 171, 0, 0.04)',
  },
  '.cm-hybrid-callout-warning': {
    borderLeftColor: '#ff9100',
    background: 'rgba(255, 145, 0, 0.05)',
  },
  '.cm-hybrid-callout-failure': {
    borderLeftColor: '#ff5252',
    background: 'rgba(255, 82, 82, 0.04)',
  },
  '.cm-hybrid-callout-danger': {
    borderLeftColor: '#ff1744',
    background: 'rgba(255, 23, 68, 0.05)',
  },
  '.cm-hybrid-callout-bug': {
    borderLeftColor: '#e040fb',
    background: 'rgba(224, 64, 251, 0.04)',
  },
  '.cm-hybrid-callout-example': {
    borderLeftColor: '#7c4dff',
    background: 'rgba(124, 77, 255, 0.04)',
  },
  '.cm-hybrid-callout-quote': {
    borderLeftColor: '#9e9e9e',
    background: 'rgba(158, 158, 158, 0.04)',
  },
  '.cm-hybrid-callout-abstract': {
    borderLeftColor: '#00b8d4',
    background: 'rgba(0, 184, 212, 0.04)',
  },
  '.cm-hybrid-callout-todo': {
    borderLeftColor: '#448aff',
    background: 'rgba(68, 138, 255, 0.04)',
  },
  '.cm-hybrid-callout-important': {
    borderLeftColor: '#ff9100',
    background: 'rgba(255, 145, 0, 0.05)',
  },

  // Callout marker badge
  '.cm-hybrid-callout-marker': {
    display: 'inline-block',
    borderRadius: '3px',
    padding: '0 4px',
    fontSize: '0.85em',
    fontWeight: '600',
    marginRight: '4px',
  },
  '.cm-hybrid-callout-marker-note': { color: '#448aff', backgroundColor: 'rgba(68, 138, 255, 0.1)' },
  '.cm-hybrid-callout-marker-tip': { color: '#00c853', backgroundColor: 'rgba(0, 200, 83, 0.1)' },
  '.cm-hybrid-callout-marker-warning': { color: '#ff9100', backgroundColor: 'rgba(255, 145, 0, 0.1)' },
  '.cm-hybrid-callout-marker-danger': { color: '#ff1744', backgroundColor: 'rgba(255, 23, 68, 0.1)' },
  '.cm-hybrid-callout-marker-question': { color: '#ffab00', backgroundColor: 'rgba(255, 171, 0, 0.1)' },
  '.cm-hybrid-callout-marker-success': { color: '#00c853', backgroundColor: 'rgba(0, 200, 83, 0.1)' },
  '.cm-hybrid-callout-marker-failure': { color: '#ff5252', backgroundColor: 'rgba(255, 82, 82, 0.1)' },
  '.cm-hybrid-callout-marker-bug': { color: '#e040fb', backgroundColor: 'rgba(224, 64, 251, 0.1)' },
  '.cm-hybrid-callout-marker-example': { color: '#7c4dff', backgroundColor: 'rgba(124, 77, 255, 0.1)' },
  '.cm-hybrid-callout-marker-quote': { color: '#9e9e9e', backgroundColor: 'rgba(158, 158, 158, 0.1)' },
  '.cm-hybrid-callout-marker-abstract': { color: '#00b8d4', backgroundColor: 'rgba(0, 184, 212, 0.1)' },
  '.cm-hybrid-callout-marker-todo': { color: '#448aff', backgroundColor: 'rgba(68, 138, 255, 0.1)' },
  '.cm-hybrid-callout-marker-important': { color: '#ff9100', backgroundColor: 'rgba(255, 145, 0, 0.1)' },
  '.cm-hybrid-callout-marker-info': { color: '#448aff', backgroundColor: 'rgba(68, 138, 255, 0.1)' },

  // Callout prefix (> marker)
  '.cm-hybrid-callout-prefix': {
    opacity: '0',
    width: '0',
    display: 'inline-block',
    overflow: 'hidden',
    position: 'absolute',
    pointerEvents: 'none',
  },

  // ─── Code block line decoration ─────────────────────────────────────────
  '.cm-hybrid-code-block-line': {
    background: 'rgba(0, 0, 0, 0.03)',
  },

  // Code block language badge
  '.cm-hybrid-code-lang-badge': {
    display: 'inline-block',
    fontSize: '0.7em',
    lineHeight: '1',
    padding: '1px 5px',
    borderRadius: '3px',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    color: '#666',
    verticalAlign: 'middle',
    marginRight: '4px',
    fontFamily: 'var(--font-geist-mono), monospace',
    fontWeight: '500',
  },

  // ─── Horizontal rule widget ─────────────────────────────────────────────
  '.cm-hybrid-hr': {
    borderTop: '2px solid rgba(0, 0, 0, 0.12)',
    margin: '0.5em 0',
    height: '0',
  },

  // ─── Comment indicator ──────────────────────────────────────────────────
  '.cm-hybrid-comment-indicator': {
    display: 'inline',
    color: '#94a3b8',
    fontSize: '0.6em',
    verticalAlign: 'super',
    cursor: 'default',
    userSelect: 'none',
  },

  // ─── Comment active state ───────────────────────────────────────────────
  '.cm-hybrid-comment': {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderRadius: '2px',
  },

  // ─── Block reference styling ────────────────────────────────────────────
  '.cm-hybrid-block-ref': {
    color: '#7c5cfc',
    backgroundColor: 'rgba(124, 92, 252, 0.08)',
    borderRadius: '2px',
    padding: '0 2px',
    fontSize: '0.85em',
    cursor: 'pointer',
    fontFamily: 'var(--font-geist-mono), monospace',
  },

  // ─── Embed transclusion widget ──────────────────────────────────────────
  '.cm-hybrid-embed-transclusion': {
    border: '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: '6px',
    padding: '8px 12px',
    margin: '4px 0',
    background: 'rgba(0, 0, 0, 0.02)',
    fontSize: '0.9em',
  },
  '.cm-hybrid-embed-header': {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '4px',
    color: '#7c5cfc',
    fontWeight: '500',
  },
  '.cm-hybrid-embed-icon': {
    fontSize: '0.8em',
    opacity: '0.7',
  },
  '.cm-hybrid-embed-name': {
    color: '#7c5cfc',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '.cm-hybrid-embed-heading': {
    color: '#666',
    fontSize: '0.85em',
  },
  '.cm-hybrid-embed-block': {
    color: '#999',
    fontSize: '0.85em',
    fontFamily: 'var(--font-geist-mono), monospace',
  },
  '.cm-hybrid-embed-content': {
    color: '#888',
    fontSize: '0.85em',
    fontStyle: 'italic',
  },

  // ─── Frontmatter collapsed widget ───────────────────────────────────────
  '.cm-hybrid-frontmatter-collapsed': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    margin: '2px 0',
    background: 'rgba(0, 0, 0, 0.03)',
    borderRadius: '4px',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '0.9em',
    color: '#666',
    transition: 'background 0.15s ease',
  },
  '.cm-hybrid-frontmatter-collapsed:hover': {
    background: 'rgba(0, 0, 0, 0.06)',
  },
  '.cm-hybrid-frontmatter-expanded': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 8px',
    margin: '2px 0',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '0.85em',
    color: '#888',
  },
  '.cm-hybrid-frontmatter-toggle': {
    fontSize: '0.7em',
    transition: 'transform 0.15s ease',
  },
  '.cm-hybrid-frontmatter-label': {
    fontWeight: '500',
    letterSpacing: '0.02em',
  },
  '.cm-hybrid-frontmatter-line': {
    // Subtle indicator for frontmatter lines
  },

  // ─── Admonition (code-block callout) ────────────────────────────────────
  '.cm-hybrid-admonition': {
    // Additional class on top of cm-hybrid-callout for code-block admonitions
  },

  // ─── WYSIWYG Table ──────────────────────────────────────────────────────
  '.cm-hybrid-table': {
    // Container line decoration for table first line
  },
  '.cm-hybrid-table-row': {
    // Row-level line decoration
    padding: '0 2px',
  },
  '.cm-hybrid-table-header': {
    // Header row — distinct styling
    fontWeight: '600',
  },
  '.cm-hybrid-table-header .cm-hybrid-table-cell': {
    fontWeight: '600',
  },
  '.cm-hybrid-table-separator': {
    // Visual pipe separator between cells
    opacity: '0.15',
    fontSize: '0',
    display: 'inline-block',
    width: '8px',
    overflow: 'hidden',
    position: 'relative',
    pointerEvents: 'none',
    borderLeft: '1px solid rgba(0, 0, 0, 0.15)',
    verticalAlign: 'middle',
    transition: 'opacity 0.15s ease',
  },
  '.cm-hybrid-table-cell': {
    // Cell content styling (used for alignment)
    display: 'inline-block',
    minWidth: '1em',
  },
  '.cm-hybrid-table-align-center': {
    textAlign: 'center' as string,
  },
  '.cm-hybrid-table-align-right': {
    textAlign: 'right' as string,
  },
  '.cm-hybrid-table-badge': {
    display: 'inline-block',
    fontSize: '0.65em',
    lineHeight: '1',
    padding: '1px 4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    color: '#888',
    verticalAlign: 'middle',
    marginRight: '4px',
    fontFamily: 'var(--font-geist-mono), monospace',
    fontWeight: '400',
  },

  // ─── Emphasis active state ──────────────────────────────────────────────
  '.cm-hybrid-emphasis-active': {
    // Shown when cursor is inside emphasis range — subtle indicator
    opacity: '0.5',
    fontSize: '0.85em',
    transition: 'opacity 0.15s ease',
  },
  '.cm-hybrid-strikethrough-active': {
    opacity: '0.5',
    fontSize: '0.85em',
    transition: 'opacity 0.15s ease',
  },

  // ─── Mid-typing emphasis supplement styling ──────────────────────────────
  '.cm-hybrid-strong': {
    fontWeight: '700',
  },
  '.cm-hybrid-em': {
    fontStyle: 'italic',
  },
  '.cm-hybrid-strike': {
    textDecoration: 'line-through',
    opacity: '0.7',
  },

  // ─── Footnotes ──────────────────────────────────────────────────────────
  '.cm-hybrid-footnote-ref': {
    color: '#7c5cfc',
    fontSize: '0.8em',
    verticalAlign: 'super',
    cursor: 'pointer',
    fontWeight: '500',
    lineHeight: '1',
  },
  '.cm-hybrid-footnote-inline-bracket': {
    fontSize: '0',
    lineHeight: '0',
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    position: 'absolute',
    pointerEvents: 'none',
  },
  '.cm-hybrid-footnote-inline-content': {
    color: '#7c5cfc',
    fontSize: '0.85em',
    verticalAlign: 'super',
    cursor: 'pointer',
    backgroundColor: 'rgba(124, 92, 252, 0.06)',
    borderRadius: '2px',
    padding: '0 2px',
  },
  '.cm-hybrid-footnote-def-line': {
    // Line decoration for footnote definition lines
    paddingLeft: '8px',
    borderLeft: '2px solid rgba(124, 92, 252, 0.2)',
    marginLeft: '-4px',
  },
  '.cm-hybrid-footnote-def-prefix': {
    color: '#7c5cfc',
    fontSize: '0.85em',
    fontWeight: '500',
    opacity: '0.7',
  },

  // ────────────────────────────────────────────────────────────────────────
  // ─── Dark Mode Overrides ───────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────

  '&dark .cm-hybrid-embed-label': {
    color: '#a78bfa',
  },
  '&dark .cm-hybrid-link-label': {
    color: '#60a5fa',
  },
  '&dark .cm-hybrid-math': {
    color: '#fbbf24',
  },
  '&dark .cm-hybrid-math-raw': {
    color: '#fbbf24',
  },
  '&dark .cm-hybrid-checkbox': {
    borderColor: '#64748b',
  },
  '&dark .cm-hybrid-checkbox:checked': {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  '&dark .cm-hybrid-checkbox:hover': {
    borderColor: '#60a5fa',
  },
  '&dark .cm-hybrid-image-container': {
    borderColor: 'rgba(255,255,255,0.1)',
  },
  '&dark .cm-hybrid-image-container:hover': {
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  '&dark .cm-hybrid-active': {
    backgroundColor: 'rgba(100, 140, 220, 0.12)',
  },
  '&dark .cm-hybrid-link-faded': {
    opacity: '0.4',
  },
  '&dark .cm-hybrid-tag': {
    color: '#a78bfa',
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
  },
  '&dark .cm-hybrid-heading-mark': {
    opacity: '0.25',
  },
  '&dark .cm-hybrid-h6': {
    color: '#999',
  },
  '&dark .cm-hybrid-quote-mark': {
    opacity: '0.25',
  },
  '&dark .cm-hybrid-code-block-line': {
    background: 'rgba(255, 255, 255, 0.03)',
  },
  '&dark .cm-hybrid-code-lang-badge': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#aaa',
  },
  '&dark .cm-hybrid-hr': {
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  '&dark .cm-hybrid-callout': {
    background: 'rgba(68, 138, 255, 0.06)',
  },
  '&dark .cm-hybrid-callout-note': { background: 'rgba(68, 138, 255, 0.06)' },
  '&dark .cm-hybrid-callout-tip': { background: 'rgba(0, 200, 83, 0.06)' },
  '&dark .cm-hybrid-callout-warning': { background: 'rgba(255, 145, 0, 0.08)' },
  '&dark .cm-hybrid-callout-danger': { background: 'rgba(255, 23, 68, 0.08)' },
  '&dark .cm-hybrid-callout-marker-note': { backgroundColor: 'rgba(68, 138, 255, 0.15)' },
  '&dark .cm-hybrid-callout-marker-tip': { backgroundColor: 'rgba(0, 200, 83, 0.15)' },
  '&dark .cm-hybrid-callout-marker-warning': { backgroundColor: 'rgba(255, 145, 0, 0.15)' },
  '&dark .cm-hybrid-callout-marker-danger': { backgroundColor: 'rgba(255, 23, 68, 0.15)' },
  '&dark .cm-hybrid-image-pending .cm-hybrid-image-thumb': {
    background: 'rgba(255,255,255,0.05)',
  },

  // ─── Dark mode: new features ────────────────────────────────────────────
  '&dark .cm-hybrid-comment-indicator': {
    color: '#64748b',
  },
  '&dark .cm-hybrid-comment': {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  '&dark .cm-hybrid-block-ref': {
    color: '#a78bfa',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
  },
  '&dark .cm-hybrid-embed-transclusion': {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  '&dark .cm-hybrid-embed-header': {
    color: '#a78bfa',
  },
  '&dark .cm-hybrid-embed-name': {
    color: '#a78bfa',
  },
  '&dark .cm-hybrid-embed-heading': {
    color: '#aaa',
  },
  '&dark .cm-hybrid-embed-block': {
    color: '#777',
  },
  '&dark .cm-hybrid-embed-content': {
    color: '#777',
  },
  '&dark .cm-hybrid-frontmatter-collapsed': {
    background: 'rgba(255, 255, 255, 0.04)',
    color: '#aaa',
  },
  '&dark .cm-hybrid-frontmatter-collapsed:hover': {
    background: 'rgba(255, 255, 255, 0.08)',
  },
  '&dark .cm-hybrid-frontmatter-expanded': {
    color: '#888',
  },

  // ─── Dark mode: tables ─────────────────────────────────────────────────
  '&dark .cm-hybrid-table-separator': {
    borderLeftColor: 'rgba(255, 255, 255, 0.12)',
  },
  '&dark .cm-hybrid-table-badge': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#aaa',
  },
  '&dark .cm-hybrid-table-header': {
    color: '#ddd',
  },

  // ─── Dark mode: emphasis active ────────────────────────────────────────
  '&dark .cm-hybrid-emphasis-active': {
    opacity: '0.6',
  },
  '&dark .cm-hybrid-strikethrough-active': {
    opacity: '0.6',
  },
  '&dark .cm-hybrid-strong': {
    color: '#e0e0e0',
  },
  '&dark .cm-hybrid-strike': {
    opacity: '0.6',
  },

  // ─── Dark mode: footnotes ──────────────────────────────────────────────
  '&dark .cm-hybrid-footnote-ref': {
    color: '#a78bfa',
  },
  '&dark .cm-hybrid-footnote-inline-content': {
    color: '#a78bfa',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
  },
  '&dark .cm-hybrid-footnote-def-line': {
    borderLeftColor: 'rgba(167, 139, 250, 0.25)',
  },
  '&dark .cm-hybrid-footnote-def-prefix': {
    color: '#a78bfa',
  },
})
