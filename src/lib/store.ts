'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

  // Actions
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSidebarOpen: (open: boolean) => void
  createNote: () => string
  deleteNote: (id: string) => void
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content'>>) => void
  getActiveNote: () => Note | undefined
  getFilteredNotes: () => Note[]
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

function getNoteTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim()
  if (!firstLine) return 'Untitled'
  // Remove markdown heading markers
  const cleaned = firstLine.replace(/^#+\s*/, '').trim()
  return cleaned || 'Untitled'
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      activeNoteId: null,
      searchQuery: '',
      sidebarOpen: true,

      setActiveNoteId: (id) => set({ activeNoteId: id }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

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

      getActiveNote: () => {
        const { notes, activeNoteId } = get()
        return notes.find((n) => n.id === activeNoteId)
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
      }),
    }
  )
)
