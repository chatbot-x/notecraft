'use client'

import { useRef, useEffect, useCallback } from 'react'
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
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap } from '@codemirror/lint'
import { useNotesStore } from '@/lib/store'

// Compartments for dynamic configuration
const themeCompartment = new Compartment()

interface CodeMirrorEditorProps {
  initialValue: string
  noteId: string
  isDark: boolean
}

export function CodeMirrorEditor({ initialValue, noteId, isDark }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)
  const updateNote = useNotesStore((s) => s.updateNote)

  const getExtensions = useCallback((): Extension[] => {
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
      autocompletion(),
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
      ]),
      markdown({ base: markdownLanguage }),
      themeCompartment.of(isDark ? oneDark : []),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isUpdatingRef.current) {
          const content = update.state.doc.toString()
          updateNote(noteId, { content })
        }
      }),
      // Custom theme adjustments
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '15px',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--font-geist-mono), monospace',
        },
        '.cm-content': {
          padding: '16px 0',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: '1px solid var(--border)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--muted)',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'var(--primary)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--accent) !important',
        },
      }),
    ]
  }, [noteId, isDark, updateNote])

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

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [noteId]) // Re-create editor when note changes

  // Update theme when dark mode changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : []),
    })
  }, [isDark])

  // Sync content when noteId changes (but not from our own edits)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== initialValue) {
      isUpdatingRef.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: initialValue,
        },
      })
      isUpdatingRef.current = false
    }
  }, [noteId, initialValue])

  return (
    <div
      ref={editorRef}
      className="h-full w-full codemirror-editor"
    />
  )
}
