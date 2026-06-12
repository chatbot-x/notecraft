'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { obsidianExtensions } from '@/lib/codemirror-ext'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  foldKeymap,
  codeFolding,
} from '@codemirror/language'
import {
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'
import { useNotesStore } from '@/lib/store'
import {
  toolbarPlugin, slashCommands, editorExtTheme,
  imageUpload,
  finalNewline,
  formatDocument,
  hybridRender,
  inlineSuggestion,
} from '@/lib/codemirror-ext'
import { Toolbar } from '@/lib/codemirror-ext'

// Separate packages
import { markdownTables, markdownTableAutocompleter, TableTheme } from 'codemirror-markdown-tables'
import { mermaid } from 'codemirror-lang-mermaid'
import { imageDataUrlHandler } from '@/lib/image-upload'

const themeCompartment = new Compartment()
const fontSizeCompartment = new Compartment()
const colorThemeCompartment = new Compartment()

// ─── Editor Component ──────────────────────────────────────────────────────────

interface CodeMirrorEditorProps {
  initialValue: string
  noteId: string
  isDark: boolean
  fontSize: number
  onSaveStatusChange: (status: 'idle' | 'saving' | 'saved') => void
  onEditorViewChange?: (view: EditorView | null) => void
}

export function CodeMirrorEditor({ initialValue, noteId, isDark, fontSize, onSaveStatusChange, onEditorViewChange }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateNote = useNotesStore((s) => s.updateNote)
  const [editorView, setEditorView] = useState<EditorView | null>(null)

  const getExtensions = useCallback((): Extension[] => {
    // Markdown language with GFM support + Obsidian Lezer extensions
    const mdLang = markdown({
      base: markdownLanguage,
      extensions: obsidianExtensions,
    })

    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      codeFolding(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      // Slash commands (Notion-style "/" menu)
      slashCommands(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
        // Format document shortcut
        { key: 'Ctrl-Shift-f', run: formatDocument },
        { key: 'Cmd-Shift-f', run: formatDocument },
      ]),
      // Markdown language
      mdLang,
      // Mermaid syntax highlighting (separate package)
      mermaid(),
      // Interactive Markdown tables (separate package)
      markdownTables({
        theme: {
          light: TableTheme.githubLight,
          dark: TableTheme.githubDark,
        },
      }),
      mdLang.language.data.of({ autocomplete: markdownTableAutocompleter() }),
      // Toolbar plugin (creates container for React portal)
      toolbarPlugin,
      // Theme for toolbar + slash command styling
      editorExtTheme,
      // Image upload with drag-drop and paste support
      imageUpload({
        action: imageDataUrlHandler,
        enableDrop: true,
        enablePaste: true,
      }),
      // Final newline (ensures doc ends with newline on focus change)
      finalNewline({ enabled: true, onFocusOnly: true }),
      // Hybrid render — Obsidian-style Live Preview decorations
      // (checkboxes, image thumbs, math, link styling)
      hybridRender(),
      // Inline AI suggestion — ghost text with Tab-to-accept
      // Replace fetchFn with your AI backend for real suggestions
      ...inlineSuggestion({
        fetchFn: async () => '',  // no-op until AI backend is wired
        delay: 1000,
        accept_shortcut: 'Tab',
      }),

      themeCompartment.of(isDark ? oneDark : []),
      colorThemeCompartment.of(EditorView.theme({
        '.cm-content': {
          caretColor: isDark ? '#e2e8f0' : '#1e293b',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: 'none',
          color: isDark ? '#64748b' : '#94a3b8',
          paddingLeft: '8px',
          paddingRight: '8px',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
          color: isDark ? '#94a3b8' : '#64748b',
          fontWeight: '600',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: isDark ? '#60a5fa' : '#3b82f6',
          borderLeftWidth: '2px',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: isDark ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.15)',
        },
        '.cm-activeLine': {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        },
        '.cm-strikethrough': {
          textDecoration: 'line-through',
          opacity: '0.6',
        },
        '.cm-inline-code': {
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          borderRadius: '3px',
          padding: '1px 4px',
        },
      })),
      fontSizeCompartment.of(EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
      })),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isUpdatingRef.current) {
          const content = update.state.doc.toString()
          updateNote(noteId, { content })

          // Debounced save indicator
          onSaveStatusChange('saving')
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = setTimeout(() => {
            onSaveStatusChange('saved')
            setTimeout(() => onSaveStatusChange('idle'), 1500)
          }, 600)
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: `${fontSize}px`,
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--font-geist-mono), monospace',
        },
        '.cm-content': {
          padding: '20px 4px',
        },
        '.cm-foldGutter': {
          opacity: '0.5',
          transition: 'opacity 0.15s',
        },
        '.cm-foldGutter:hover': {
          opacity: '1',
        },
        '&.cm-focused': {
          outline: 'none',
        },
        '.cm-line': {
          padding: '0 12px',
        },
        // Markdown heading styles
        '.cm-header-1': {
          fontWeight: '700',
          fontSize: '1.6em',
          letterSpacing: '-0.02em',
          lineHeight: '1.4',
        },
        '.cm-header-2': {
          fontWeight: '600',
          fontSize: '1.3em',
          letterSpacing: '-0.01em',
          lineHeight: '1.4',
        },
        '.cm-header-3': {
          fontWeight: '600',
          fontSize: '1.1em',
          lineHeight: '1.4',
        },
        '.cm-strong': {
          fontWeight: '700',
        },
        '.cm-em': {
          fontStyle: 'italic',
        },
        '.cm-link': {
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
        },
        '.cm-url': {
          opacity: '0.6',
        },
        '.cm-hr': {
          opacity: '0.3',
        },
      }),
    ]
  }, [noteId, isDark, fontSize, updateNote, onSaveStatusChange])

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: initialValue,
      extensions: getExtensions(),
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view
    setEditorView(view)
    onEditorViewChange?.(view)

    return () => {
      view.destroy()
      viewRef.current = null
      setEditorView(null)
      onEditorViewChange?.(null)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [noteId])

  // Update theme when dark mode changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(isDark ? oneDark : []),
        colorThemeCompartment.reconfigure(EditorView.theme({
          '.cm-content': {
            caretColor: isDark ? '#e2e8f0' : '#1e293b',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: 'none',
            color: isDark ? '#64748b' : '#94a3b8',
            paddingLeft: '8px',
            paddingRight: '8px',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'transparent',
            color: isDark ? '#94a3b8' : '#64748b',
            fontWeight: '600',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: isDark ? '#60a5fa' : '#3b82f6',
            borderLeftWidth: '2px',
          },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: isDark ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.15)',
          },
          '.cm-activeLine': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          },
          '.cm-strikethrough': {
            textDecoration: 'line-through',
            opacity: '0.6',
          },
          '.cm-inline-code': {
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            borderRadius: '3px',
            padding: '1px 4px',
          },
        })),
      ],
    })
  }, [isDark])

  // Update font size
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({ '&': { fontSize: `${fontSize}px` } })
      ),
    })
  }, [fontSize])

  // Sync content when noteId changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== initialValue) {
      isUpdatingRef.current = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: initialValue },
      })
      isUpdatingRef.current = false
    }
  }, [noteId, initialValue])

  // Restore focus when becoming visible after being hidden (mobile keyboard/cursor fix)
  // The parent component also calls focus() via onEditorViewChange callback when
  // switching view modes, but this IntersectionObserver provides a belt-and-suspenders
  // approach that works regardless of how the editor becomes visible.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    let wasVisible = true

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting && entry.intersectionRatio > 0
        if (isVisible && !wasVisible && viewRef.current) {
          requestAnimationFrame(() => {
            if (viewRef.current) {
              viewRef.current.focus()
            }
          })
        }
        wasVisible = isVisible
      },
      { threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [noteId])

  return (
    <div className="h-full w-full flex flex-col codemirror-editor">
      {/* Toolbar rendered via React portal into CM6's toolbar container */}
      <Toolbar view={editorView} />
      <div
        ref={editorRef}
        className="flex-1 overflow-hidden"
      />
    </div>
  )
}
