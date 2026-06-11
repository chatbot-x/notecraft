'use client'

import { useNotesStore, Note, ViewMode, WELCOME_NOTE_ID, WELCOME_CONTENT } from '@/lib/store'
import { Sidebar } from '@/components/sidebar'
import { CodeMirrorEditor } from '@/components/editor'
import { MarkdownPreview } from '@/components/markdown-preview'
import { CommandPalette } from '@/components/command-palette'
import { Button } from '@/components/ui/button'
import {
  Plus,
  FileText,
  Moon,
  Sun,
  Eye,
  PenLine,
  Columns2,
  Minus,
  PlusCircle,
  Check,
  Loader2,
  Search,
  ChevronDown,
} from 'lucide-react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function getLineCount(text: string): number {
  return text.split('\n').length
}

const viewModes: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
  { key: 'edit', label: 'Editor', icon: <PenLine className="h-3.5 w-3.5" /> },
  { key: 'preview', label: 'Preview', icon: <Eye className="h-3.5 w-3.5" /> },
  { key: 'split', label: 'Split', icon: <Columns2 className="h-3.5 w-3.5" /> },
]

export function NoteApp() {
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const viewMode = useNotesStore((s) => s.viewMode)
  const fontSize = useNotesStore((s) => s.fontSize)
  const sidebarOpen = useNotesStore((s) => s.sidebarOpen)
  const createNote = useNotesStore((s) => s.createNote)
  const setActiveNoteId = useNotesStore((s) => s.setActiveNoteId)
  const setSidebarOpen = useNotesStore((s) => s.setSidebarOpen)
  const setViewMode = useNotesStore((s) => s.setViewMode)
  const setFontSize = useNotesStore((s) => s.setFontSize)
  const setCommandPaletteOpen = useNotesStore((s) => s.setCommandPaletteOpen)

  const [isDark, setIsDark] = useState(getInitialDarkMode)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const activeNote: Note | undefined = notes.find((n) => n.id === activeNoteId)

  // Watch for dark mode changes
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

  // Auto-select first note
  useEffect(() => {
    if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id)
    }
  }, [activeNoteId, notes, setActiveNoteId])

  // Create welcome note on first visit
  useEffect(() => {
    const hasVisited = localStorage.getItem('notecraft-visited')
    if (!hasVisited && notes.length === 0) {
      const now = Date.now()
      const welcomeNote: Note = {
        id: WELCOME_NOTE_ID,
        title: 'Welcome to NoteCraft',
        content: WELCOME_CONTENT,
        createdAt: now,
        updatedAt: now,
      }
      useNotesStore.setState({
        notes: [welcomeNote],
        activeNoteId: WELCOME_NOTE_ID,
      })
      localStorage.setItem('notecraft-visited', 'true')
    }
  }, [notes.length])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'n') {
        e.preventDefault()
        createNote()
      } else if (mod && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen(!sidebarOpen)
      } else if (mod && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        const modes: ViewMode[] = ['edit', 'preview', 'split']
        const currentIdx = modes.indexOf(viewMode)
        setViewMode(modes[(currentIdx + 1) % modes.length])
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setFontSize(fontSize + 1)
      } else if (mod && e.key === '-') {
        e.preventDefault()
        setFontSize(fontSize - 1)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote, sidebarOpen, setSidebarOpen, setCommandPaletteOpen, viewMode, setViewMode, fontSize, setFontSize])

  const handleCreateNote = () => {
    createNote()
  }

  const handleSaveStatusChange = useCallback((status: 'idle' | 'saving' | 'saved') => {
    setSaveStatus(status)
  }, [])

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      <Sidebar />
      <CommandPalette />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeNote ? (
          <>
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {activeNote.title}
                  </span>
                  {/* Save indicator */}
                  <AnimatePresence mode="wait">
                    {saveStatus === 'saving' && (
                      <motion.span
                        key="saving"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving
                      </motion.span>
                    )}
                    {saveStatus === 'saved' && (
                      <motion.span
                        key="saved"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1 text-[11px] text-emerald-600"
                      >
                        <Check className="h-3 w-3" />
                        Saved
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                  {getWordCount(activeNote.content)} words · {getLineCount(activeNote.content)} lines
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                {/* View Mode Switcher */}
                <div className="flex items-center bg-muted/50 rounded-md p-0.5 mr-1">
                  {viewModes.map((mode) => (
                    <TooltipProvider key={mode.key} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewMode(mode.key)}
                            className={cn(
                              'h-6 w-7 rounded-sm',
                              viewMode === mode.key
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {mode.icon}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{mode.label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>

                {/* Font Size */}
                <div className="flex items-center gap-0.5 mr-1">
                  <TooltipProvider delayDuration={500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFontSize(fontSize - 1)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={fontSize <= 12}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Decrease font</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-[11px] text-muted-foreground w-7 text-center tabular-nums">
                    {fontSize}
                  </span>
                  <TooltipProvider delayDuration={500}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFontSize(fontSize + 1)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={fontSize >= 24}
                        >
                          <PlusCircle className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Increase font</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Theme Toggle */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        {isDark ? (
                          <Sun className="h-3.5 w-3.5" />
                        ) : (
                          <Moon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {isDark ? 'Light mode' : 'Dark mode'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Editor / Preview Area */}
            <div className="flex-1 overflow-hidden flex">
              {/* Editor */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className={cn(
                  'h-full overflow-hidden',
                  viewMode === 'split' ? 'w-1/2 border-r border-border' : 'w-full'
                )}>
                  <CodeMirrorEditor
                    key={activeNote.id}
                    initialValue={activeNote.content}
                    noteId={activeNote.id}
                    isDark={isDark}
                    fontSize={fontSize}
                    onSaveStatusChange={handleSaveStatusChange}
                  />
                </div>
              )}

              {/* Preview */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={cn(
                  'h-full overflow-hidden',
                  viewMode === 'split' ? 'w-1/2' : 'w-full'
                )}>
                  <MarkdownPreview
                    content={activeNote.content}
                    isDark={isDark}
                    fontSize={fontSize}
                    onWikilinkClick={(pageName) => {
                      // TODO: Navigate to note with matching title
                      console.log('[Wikilink] Navigate to:', pageName)
                    }}
                    onTaskToggle={(lineNumber, checked) => {
                      // Toggle the checkbox in the editor source
                      const lines = activeNote.content.split('\n')
                      if (lineNumber >= 0 && lineNumber < lines.length) {
                        const line = lines[lineNumber]
                        if (checked) {
                          lines[lineNumber] = line.replace('[ ]', '[x]')
                        } else {
                          lines[lineNumber] = line.replace('[x]', '[ ]')
                        }
                        updateNote(activeNote.id, { content: lines.join('\n') })
                      }
                    }}
                    onHeadingClick={(headingId) => {
                      // Scroll to heading in the editor (future: scroll sync)
                      console.log('[Heading] Click:', headingId)
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="rounded-2xl bg-muted/50 p-6 mx-auto mb-6 w-fit">
                <FileText className="h-12 w-12 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight mb-2">
                {notes.length === 0 ? 'No notes yet' : 'Select a note'}
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-6">
                {notes.length === 0
                  ? 'Create your first note to get started. Everything is saved locally in your browser.'
                  : 'Choose a note from the sidebar or create a new one.'}
              </p>
              <Button onClick={handleCreateNote} className="gap-2">
                <Plus className="h-4 w-4" />
                Create a Note
              </Button>

              {/* Keyboard shortcut hints */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span><kbd className="bg-muted rounded px-1.5 py-0.5">Ctrl+N</kbd> New note</span>
                <span><kbd className="bg-muted rounded px-1.5 py-0.5">Ctrl+K</kbd> Commands</span>
                <span><kbd className="bg-muted rounded px-1.5 py-0.5">Ctrl+B</kbd> Sidebar</span>
                <span><kbd className="bg-muted rounded px-1.5 py-0.5">Ctrl+\</kbd> View mode</span>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  )
}
