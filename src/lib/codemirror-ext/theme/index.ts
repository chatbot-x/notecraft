/**
 * codemirror-ext: Theme Extension
 *
 * EditorView.baseTheme styles for the toolbar, slash commands,
 * and autocomplete dropdown. Uses CSS variables from the app's
 * design system for dark/light mode consistency.
 */

import { EditorView } from '@codemirror/view'

export const editorExtTheme = EditorView.baseTheme({
  // ─── Toolbar Container ───────────────────────────────────────────────────
  '.cm-toolbar-container': {
    minHeight: '0px',
    position: 'relative',
    zIndex: '2',
  },

  // ─── Autocomplete / Slash Command Dropdown ───────────────────────────────
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      maxHeight: '280px',
      minWidth: '200px',
      fontFamily: 'var(--font-sans)',
      fontSize: '13px',
      borderRadius: '8px',
      padding: '4px',
      border: '1px solid var(--border)',
      background: 'var(--popover)',
      color: 'var(--popover-foreground)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    },
    '& > ul > li': {
      padding: '6px 10px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
    },
    '& > ul > li[aria-selected]': {
      background: 'var(--accent)',
      color: 'var(--accent-foreground)',
    },
    '& > ul > li .cm-completionDetail': {
      fontSize: '11px',
      color: 'var(--muted-foreground)',
      marginLeft: 'auto',
      fontStyle: 'normal',
    },
    '& > ul > li[aria-selected] .cm-completionDetail': {
      color: 'var(--accent-foreground)',
      opacity: '0.7',
    },
  },

  // ─── Slash Command Specific Styles ───────────────────────────────────────
  '.cm-completionLabel': {
    fontWeight: '500',
  },
})
