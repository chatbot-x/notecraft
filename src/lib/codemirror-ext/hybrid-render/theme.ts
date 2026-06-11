/**
 * Unified theme for all hybrid rendering decorations.
 *
 * Uses EditorView.baseTheme with &dark selectors for dark mode.
 * All CSS class names follow the `cm-hybrid-*` convention.
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

  // ─── Wikilink label ─────────────────────────────────────────────────────
  '.cm-hybrid-wikilink-label': {
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
  },

  // ─── Blockquote mark (faded >) ──────────────────────────────────────────
  '.cm-hybrid-quote-mark': {
    opacity: '0.3',
    fontSize: '0.85em',
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

  // ────────────────────────────────────────────────────────────────────────
  // ─── Dark Mode Overrides ───────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────

  '&dark .cm-hybrid-wikilink-label': {
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
})
