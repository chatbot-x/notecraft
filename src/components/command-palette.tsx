'use client'

import { useNotesStore } from '@/lib/store'
import { useEffect, useRef, useState } from 'react'
import { Search, FileText, Plus, Trash2, Copy, PanelLeft, Sun, Moon, Eye, PenLine, Columns2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Command {
  id: string
  label: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  category: 'note' | 'view' | 'action'
}

export function CommandPalette() {
  const {
    notes,
    activeNoteId,
    sidebarOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveNoteId,
    createNote,
    deleteNote,
    duplicateNote,
    setSidebarOpen,
    setViewMode,
  } = useNotesStore()

  const [isDark, setIsDark] = useState(false)

  // Track dark mode reactively
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const toggleDark = () => {
    const newIsDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark')
    useNotesStore.setState({ isDark: newIsDark })
  }

  const commands: Command[] = [
    // Note commands
    ...notes.map((note) => ({
      id: `goto-${note.id}`,
      label: `Go to "${note.title}"`,
      icon: <FileText className="h-4 w-4" />,
      action: () => {
        setActiveNoteId(note.id)
        setCommandPaletteOpen(false)
      },
      category: 'note' as const,
    })),
    {
      id: 'new-note',
      label: 'Create new note',
      shortcut: 'Ctrl+N',
      icon: <Plus className="h-4 w-4" />,
      action: () => {
        createNote()
        setCommandPaletteOpen(false)
      },
      category: 'action',
    },
    ...(activeNoteId
      ? [
          {
            id: 'duplicate-note',
            label: 'Duplicate current note',
            icon: <Copy className="h-4 w-4" />,
            action: () => {
              if (activeNoteId) duplicateNote(activeNoteId)
              setCommandPaletteOpen(false)
            },
            category: 'action' as const,
          },
          {
            id: 'delete-note',
            label: 'Delete current note',
            icon: <Trash2 className="h-4 w-4" />,
            action: () => {
              if (activeNoteId) deleteNote(activeNoteId)
              setCommandPaletteOpen(false)
            },
            category: 'action' as const,
          },
        ]
      : []),
    // View commands
    {
      id: 'toggle-sidebar',
      label: sidebarOpen ? 'Close sidebar' : 'Open sidebar',
      shortcut: 'Ctrl+B',
      icon: <PanelLeft className="h-4 w-4" />,
      action: () => {
        setSidebarOpen(!sidebarOpen)
        setCommandPaletteOpen(false)
      },
      category: 'view',
    },
    {
      id: 'toggle-theme',
      label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
      icon: isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      action: () => {
        toggleDark()
        setCommandPaletteOpen(false)
      },
      category: 'view',
    },
    {
      id: 'view-edit',
      label: 'Editor view',
      shortcut: 'Ctrl+\\ 1',
      icon: <PenLine className="h-4 w-4" />,
      action: () => {
        setViewMode('edit')
        setCommandPaletteOpen(false)
      },
      category: 'view',
    },
    {
      id: 'view-preview',
      label: 'Preview view',
      shortcut: 'Ctrl+\\ 2',
      icon: <Eye className="h-4 w-4" />,
      action: () => {
        setViewMode('preview')
        setCommandPaletteOpen(false)
      },
      category: 'view',
    },
    {
      id: 'view-split',
      label: 'Split view',
      shortcut: 'Ctrl+\\ 3',
      icon: <Columns2 className="h-4 w-4" />,
      action: () => {
        setViewMode('split')
        setCommandPaletteOpen(false)
      },
      category: 'view',
    },
  ]

  const filtered = query.trim()
    ? commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  // Group by category
  const categories = [
    { key: 'action', label: 'Actions' },
    { key: 'note', label: 'Notes' },
    { key: 'view', label: 'View' },
  ] as const

  // Reset state and focus input when opening
  useEffect(() => {
    if (commandPaletteOpen) {
      // Use a callback in setTimeout to avoid the "setState in effect" lint warning
      // This is genuinely needed to reset the palette state when it opens
      const timer = setTimeout(() => {
        setQuery('')
        setSelectedIndex(0)
        inputRef.current?.focus()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [commandPaletteOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!commandPaletteOpen) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        filtered[selectedIndex]?.action()
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, filtered, selectedIndex, setCommandPaletteOpen])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Close on click outside
  useEffect(() => {
    if (!commandPaletteOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-command-palette]')) {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setCommandPaletteOpen(false)}
          />
          <div
            data-command-palette
            className="fixed inset-x-0 top-[15%] z-50 mx-auto max-w-lg px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search notes and commands..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedIndex(0)
                  }}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                  Esc
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-72 overflow-auto py-1">
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No results found
                  </div>
                )}
                {categories.map((cat) => {
                  const items = filtered.filter((c) => c.category === cat.key)
                  if (items.length === 0) return null
                  let globalIndex = filtered.indexOf(items[0])
                  return (
                    <div key={cat.key}>
                      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {cat.label}
                      </div>
                      {items.map((cmd, i) => {
                        const idx = filtered.indexOf(cmd)
                        return (
                          <div
                            key={cmd.id}
                            data-index={idx}
                            className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                              idx === selectedIndex
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => cmd.action()}
                            onMouseEnter={() => setSelectedIndex(idx)}
                          >
                            <span className="text-muted-foreground shrink-0">
                              {cmd.icon}
                            </span>
                            <span className="text-sm flex-1 truncate">
                              {cmd.label}
                            </span>
                            {cmd.shortcut && (
                              <kbd className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                {cmd.shortcut}
                              </kbd>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <kbd className="bg-muted rounded px-1 py-0.5">↑↓</kbd> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="bg-muted rounded px-1 py-0.5">↵</kbd> Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="bg-muted rounded px-1 py-0.5">Esc</kbd> Close
                </span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
