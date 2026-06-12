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
  isDark: boolean

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

export const WELCOME_CONTENT = `---
title: Welcome to NoteCraft
tags: [welcome, demo, obsidian]
---

# Welcome to NoteCraft

Your Obsidian-level markdown note-taking app, powered by **CodeMirror 6** and **markdown-it**.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| \`Ctrl + N\` | Create new note |
| \`Ctrl + K\` | Open command palette |
| \`Ctrl + B\` | Toggle sidebar |
| \`Ctrl + \\\`\` | Toggle edit / preview / split |
| \`Ctrl + Shift + F\` | Format document with Prettier |

## Markdown Features

- **Bold**, *italic*, ~~strikethrough~~, and ==highlighted== text
- H~2~O (subscript) and E=mc^2^ (superscript)
- Embeds for inter-note linking
- Task lists with interactive checkboxes
- Footnotes[^1]
- Custom attributes {.text-red}
- Emoji shortcuts :rocket: :fire: :star:

## Code Blocks

\`\`\`typescript
interface NoteCraft {
  editor: "CodeMirror 6"
  renderer: "markdown-it"
  features: string[]
}

const app: NoteCraft = {
  editor: "CodeMirror 6",
  renderer: "markdown-it",
  features: ["callouts", "math", "mermaid", "katex", "emoji"]
}
\`\`\`

## Math (KaTeX)

Inline math: $E = mc^2$

Display math:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## Mermaid Diagrams

\`\`\`mermaid
graph LR
    A[NoteCraft] --> B[Editor]
    A --> C[Preview]
    B --> D[CodeMirror 6]
    C --> E[markdown-it]
    E --> F[KaTeX]
    E --> G[Mermaid]
    E --> H[Callouts]
\`\`\`

## Callouts

> [!note] Note
> This is a note callout — great for highlighting important information.

> [!important] Important
> Click any heading in preview mode to jump straight to it in the editor.

> [!tip] Tip
> Try using \`Ctrl + Shift + F\` to format your Markdown with Prettier!

> [!warning]+ Expandable Warning
> This callout starts expanded. Click the title to collapse it.

> [!tip]- Collapsed Tip
> This callout starts collapsed. Click the title to expand it.

> [!danger] Danger
> Clearing browser data will delete all your notes!

## Definition Lists

Markdown
: A lightweight markup language created by John Gruber

CodeMirror 6
: A versatile text editor implemented in JavaScript for the browser

## Comments

This text is visible. %%This text is hidden in the preview%% And this is also visible.

## Task Lists

- [x] Set up CodeMirror 6 editor
- [x] Build custom extension plugin
- [x] Implement markdown-it rendering engine
- [x] Add emoji, definition lists, front matter, foldable callouts
- [x] Add scroll sync between editor and preview (split view)
- [x] Add note search within content

## Tables

| Feature | Engine | Status |
|---|---|---|
| Syntax Highlighting | Shiki | Active |
| Math Rendering | KaTeX | Active |
| Diagrams | Mermaid | Active |
| Callouts | Custom Plugin | Active |
| Embeds | Custom Plugin | Active |
| Emoji | markdown-it-emoji | Active |
| Def Lists | markdown-it-deflist | Active |
| Front Matter | markdown-it-front-matter | Active |
| Comments | Custom Plugin | Active |
| Foldable Callouts | Custom Plugin | Active |

---

Start writing! Everything is saved locally in your browser.

[^1]: This is a footnote example — click the reference number to jump here.
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
      isDark: false,

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
        isDark: state.isDark,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true)
        }
      },
    }
  )
)
