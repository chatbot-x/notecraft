'use client'

import { useNotesStore, Note } from '@/lib/store'
import { Sidebar } from '@/components/sidebar'
import { CodeMirrorEditor } from '@/components/editor'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Moon, Sun } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

export function NoteApp() {
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const createNote = useNotesStore((s) => s.createNote)
  const setActiveNoteId = useNotesStore((s) => s.setActiveNoteId)
  const [isDark, setIsDark] = useState(getInitialDarkMode)

  // Derive active note from state (proper reactivity)
  const activeNote: Note | undefined = notes.find((n) => n.id === activeNoteId)

  // Watch for dark mode changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDarkMode = document.documentElement.classList.contains('dark')
      setIsDark(isDarkMode)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle('dark')
  }, [])

  // Auto-select first note if none selected
  useEffect(() => {
    if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id)
    }
  }, [activeNoteId, notes, setActiveNoteId])

  const handleCreateNote = () => {
    createNote()
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">
                  {activeNote.title}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {activeNote.content.length} chars
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="h-8 w-8"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* CodeMirror Editor */}
            <div className="flex-1 overflow-hidden">
              <CodeMirrorEditor
                key={activeNote.id}
                initialValue={activeNote.content}
                noteId={activeNote.id}
                isDark={isDark}
              />
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="rounded-full bg-muted p-6">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {notes.length === 0 ? 'No notes yet' : 'Select a note'}
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                {notes.length === 0
                  ? 'Create your first note to get started. Your notes are saved locally in the browser.'
                  : 'Choose a note from the sidebar or create a new one.'}
              </p>
            </div>
            <Button onClick={handleCreateNote} className="gap-2">
              <Plus className="h-4 w-4" />
              Create a Note
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
