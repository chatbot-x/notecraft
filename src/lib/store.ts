'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'edit' | 'preview' | 'split'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

interface NotesState {
  notes: Note[]
  activeNoteId: string | null
  searchQuery: string
  sidebarOpen: boolean
  viewMode: ViewMode
  fontSize: number
  saveStatus: 'idle' | 'saving' | 'saved'
  commandPaletteOpen: boolean
  hasHydrated: boolean

  // Actions
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSidebarOpen: (open: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setFontSize: (size: number) => void
  setSaveStatus: (status: 'idle' | 'saving' | 'saved') => void
  setCommandPaletteOpen: (open: boolean) => void
  setHasHydrated: (hydrated: boolean) => void
  createNote: () => string
  deleteNote: (id: string) => void
  duplicateNote: (id: string) => string | null
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => void
  getFilteredNotes: () => Note[]
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

function getNoteTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim()
  if (!firstLine) return 'Untitled'
  const cleaned = firstLine.replace(/^#+\s*/, '').trim()
  return cleaned || 'Untitled'
}

export const WELCOME_NOTE_ID = '__welcome__'

export const WELCOME_CONTENT = `# Welcome to NoteCraft 👋

Your markdown note-taking app, powered by **CodeMirror 6**.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| \`Ctrl + N\` | Create new note |
| \`Ctrl + K\` | Open command palette |
| \`Ctrl + B\` | Toggle sidebar |
| \`Ctrl + \\\`\` | Toggle edit / preview / split |
| \`Ctrl + +\` | Increase font size |
| \`Ctrl + -\` | Decrease font size |
| \`Ctrl + F\` | Search in editor |
| \`Ctrl + Z\` | Undo |
| \`Ctrl + Shift + Z\` | Redo |

## Features

- **Markdown editing** with syntax highlighting & code folding
- **Dark / Light mode** toggle
- **Auto-save** to browser localStorage
- **Multiple notes** with instant switching
- **Search & filter** across all notes
- **Edit / Preview / Split** view modes
- **Command palette** for quick navigation
- **Duplicate notes** for easy templating

---

Start writing! Everything is saved locally in your browser.
`

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      activeNoteId: null,
      searchQuery: '',
      sidebarOpen: true,
      viewMode: 'edit' as ViewMode,
      fontSize: 15,
      saveStatus: 'idle' as 'idle' | 'saving' | 'saved',
      commandPaletteOpen: false,
      hasHydrated: false,

      setActiveNoteId: (id) => set({ activeNoteId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setFontSize: (size) => set({ fontSize: Math.max(12, Math.min(24, size)) }),
      setSaveStatus: (status) => set({ saveStatus: status }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      createNote: () => {
        const id = generateId()
        const now = Date.now()
        const newNote: Note = {
          id,
          title: 'Untitled',
          content: '',
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          notes: [newNote, ...state.notes],
          activeNoteId: id,
          viewMode: 'edit' as ViewMode,
        }))
        return id
      },

      deleteNote: (id) => {
        set((state) => {
          const newNotes = state.notes.filter((n) => n.id !== id)
          const newActiveId =
            state.activeNoteId === id
              ? newNotes.length > 0
                ? newNotes[0].id
                : null
              : state.activeNoteId
          return { notes: newNotes, activeNoteId: newActiveId }
        })
      },

      duplicateNote: (id) => {
        const { notes } = get()
        const note = notes.find((n) => n.id === id)
        if (!note) return null
        const newId = generateId()
        const now = Date.now()
        const duplicate: Note = {
          id: newId,
          title: `${note.title} (copy)`,
          content: note.content,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          notes: [duplicate, ...state.notes],
          activeNoteId: newId,
        }))
        return newId
      },

      updateNote: (id, updates) => {
        set((state) => ({
          notes: state.notes.map((note) => {
            if (note.id !== id) return note
            const title = updates.content !== undefined
              ? getNoteTitle(updates.content)
              : updates.title !== undefined
                ? updates.title
                : note.title
            return {
              ...note,
              ...updates,
              title,
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      getFilteredNotes: () => {
        const { notes, searchQuery } = get()
        if (!searchQuery.trim()) return notes
        const q = searchQuery.toLowerCase()
        return notes.filter(
          (note) =>
            note.title.toLowerCase().includes(q) ||
            note.content.toLowerCase().includes(q)
        )
      },
    }),
    {
      name: 'notecraft-storage',
      partialize: (state) => ({
        notes: state.notes,
        activeNoteId: state.activeNoteId,
        sidebarOpen: state.sidebarOpen,
        viewMode: state.viewMode,
        fontSize: state.fontSize,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true)
        }
      },
    }
  )
)
