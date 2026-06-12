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
} from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
import { jumpToHeading } from '@/lib/codemirror-ext/slug'
import { toast } from '@/hooks/use-toast'

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
  const updateNote = useNotesStore((s) => s.updateNote)
  const setActiveNoteId = useNotesStore((s) => s.setActiveNoteId)
  const setSidebarOpen = useNotesStore((s) => s.setSidebarOpen)
  const setViewMode = useNotesStore((s) => s.setViewMode)
  const setFontSize = useNotesStore((s) => s.setFontSize)
  const setCommandPaletteOpen = useNotesStore((s) => s.setCommandPaletteOpen)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const storeIsDark = useNotesStore((s) => s.isDark)
  const hasHydrated = useNotesStore((s) => s.hasHydrated)

  const [isDark, setIsDark] = useState(getInitialDarkMode)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const editorViewRef = useRef<import('@codemirror/view').EditorView | null>(null)
  const editorScrollRef = useRef<HTMLDivElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const syncScrollRef = useRef<'editor' | 'preview' | null>(null)

  const activeNote: Note | undefined = notes.find((n) => n.id === activeNoteId)

  // Sync dark mode from store to DOM on mount and when store changes
  useEffect(() => {
    const classList = document.documentElement.classList
    if (storeIsDark && !classList.contains('dark')) {
      classList.add('dark')
    } else if (!storeIsDark && classList.contains('dark')) {
      classList.remove('dark')
    }
    setIsDark(storeIsDark)
  }, [storeIsDark])

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
    const newIsDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark')
    useNotesStore.setState({ isDark: newIsDark })
    setIsDark(newIsDark)
  }, [])

  // Auto-select first note
  useEffect(() => {
    if (!activeNoteId && notes.length > 0) {
      setActiveNoteId(notes[0].id)
    }
  }, [activeNoteId, notes, setActiveNoteId])

  // Create welcome note on first visit (uses store state instead of separate localStorage key)
  useEffect(() => {
    if (!hasHydrated) return
    if (notes.length === 0) {
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
    }
  }, [hasHydrated, notes.length])

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

  // Memoize notes for preview to avoid unnecessary re-renders
  const notesForPreview = useMemo(() => notes.map(n => ({ title: n.title, content: n.content })), [notes])

  const handleCreateNote = () => {
    createNote()
  }

  const handleSaveStatusChange = useCallback((status: 'idle' | 'saving' | 'saved') => {
    setSaveStatus(status)
  }, [])

  // Store editor view reference for focus restoration
  const handleEditorCreated = useCallback((view: import('@codemirror/view').EditorView | null) => {
    editorViewRef.current = view
  }, [])

  // Restore editor focus when switching to edit mode from preview (fixes mobile keyboard/cursor bug)
  useEffect(() => {
    if (viewMode === 'edit' && editorViewRef.current) {
      // Use requestAnimationFrame to ensure layout is stable before focusing.
      // Previously a 50ms setTimeout was used, but that fired during the CSS
      // transition (200ms), corrupting CodeMirror's coordinate mappings on touch.
      // Now we skip transitions entirely (no transition-all), so rAF is enough.
      const raf = requestAnimationFrame(() => {
        const view = editorViewRef.current
        if (view) {
          view.requestMeasure()  // Force CodeMirror to recalculate layout
          view.focus()
        }
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [viewMode])

  // Split-view scroll sync — percentage-based bidirectional sync
  useEffect(() => {
    if (viewMode !== 'split') return

    // Reset sync direction tracking to avoid stale state from previous mode
    syncScrollRef.current = null

    // The preview scroll container is set by MarkdownPreview's ref callback.
    // Find the actual scrollable element inside the preview div.
    const editorEl = editorScrollRef.current
    const previewEl = previewScrollRef.current
    if (!editorEl || !previewEl) return

    let cancelled = false
    let cleanupFn: (() => void) | null = null

    function attachSync(editorScroller: HTMLElement) {
      const handleEditorScroll = () => {
        if (syncScrollRef.current === 'preview') {
          syncScrollRef.current = null
          return
        }
        syncScrollRef.current = 'editor'
        const maxScroll = editorScroller.scrollHeight - editorScroller.clientHeight
        if (maxScroll <= 0) return
        const ratio = editorScroller.scrollTop / maxScroll
        const previewMaxScroll = previewEl!.scrollHeight - previewEl!.clientHeight
        previewEl!.scrollTop = ratio * previewMaxScroll
      }

      const handlePreviewScroll = () => {
        if (syncScrollRef.current === 'editor') {
          syncScrollRef.current = null
          return
        }
        syncScrollRef.current = 'preview'
        const maxScroll = previewEl!.scrollHeight - previewEl!.clientHeight
        if (maxScroll <= 0) return
        const ratio = previewEl!.scrollTop / maxScroll
        const editorMaxScroll = editorScroller.scrollHeight - editorScroller.clientHeight
        editorScroller.scrollTop = ratio * editorMaxScroll
      }

      editorScroller.addEventListener('scroll', handleEditorScroll)
      previewEl!.addEventListener('scroll', handlePreviewScroll)

      cleanupFn = () => {
        editorScroller.removeEventListener('scroll', handleEditorScroll)
        previewEl!.removeEventListener('scroll', handlePreviewScroll)
      }
    }

    // CM6 creates .cm-scroller asynchronously after mounting.
    // Retry with a small delay if it's not available yet (race condition on note switch).
    const editorScroller = editorEl.querySelector('.cm-scroller') as HTMLElement | null
    if (editorScroller) {
      attachSync(editorScroller)
    } else {
      const retryTimer = setTimeout(() => {
        if (cancelled) return
        const scroller = editorEl.querySelector('.cm-scroller') as HTMLElement | null
        if (scroller) attachSync(scroller)
      }, 100)
      return () => {
        cancelled = true
        clearTimeout(retryTimer)
        cleanupFn?.()
      }
    }

    return () => {
      cancelled = true
      cleanupFn?.()
    }
  }, [viewMode, activeNoteId])

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      <Sidebar />
      <CommandPalette />

      {/* Hydration guard — prevent flash of empty state before localStorage rehydrates */}
      {!hasHydrated ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notes...
          </div>
        </main>
      ) : (
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
              {/* Editor — always mounted to prevent mobile keyboard/cursor bugs on view mode switch.
                  Uses absolute + invisible + pointer-events-none instead of display:none so
                  CodeMirror keeps its full layout and the IntersectionObserver can detect
                  visibility changes. No CSS transitions on width/height to avoid corrupting
                  CodeMirror's coordinate mappings (breaks touch input on mobile). */}
              <div ref={editorScrollRef} className={cn(
                'h-full overflow-hidden',
                viewMode === 'edit' ? 'w-full relative' : viewMode === 'split' ? 'w-1/2 border-r border-border relative' : 'absolute invisible pointer-events-none w-full'
              )}>
                <CodeMirrorEditor
                  key={activeNote.id}
                  initialValue={activeNote.content}
                  noteId={activeNote.id}
                  isDark={isDark}
                  fontSize={fontSize}
                  onSaveStatusChange={handleSaveStatusChange}
                  onEditorViewChange={handleEditorCreated}
                />
              </div>

              {/* Preview */}
              <div className={cn(
                'h-full overflow-hidden',
                viewMode === 'preview' ? 'w-full relative' : viewMode === 'split' ? 'w-1/2 relative' : 'absolute invisible pointer-events-none w-full'
              )}>
                <MarkdownPreview
                    content={activeNote.content}
                    isDark={isDark}
                    fontSize={fontSize}
                    notes={notesForPreview}
                    scrollContainerRef={previewScrollRef}
                    onTaskToggle={(lineNumber, checked) => {
                      // Toggle the checkbox in the editor source
                      const lines = activeNote.content.split('\n')
                      if (lineNumber >= 0 && lineNumber < lines.length) {
                        const line = lines[lineNumber]
                        // Guard: verify the line still contains a checkbox pattern
                        // (content may have changed since the preview was rendered)
                        if (checked && !line.includes('[ ]') && !line.includes('[x]')) return
                        if (!checked && !line.includes('[x]') && !line.includes('[ ]')) return
                        if (checked) {
                          lines[lineNumber] = line.replace('[ ]', '[x]')
                        } else {
                          lines[lineNumber] = line.replace('[x]', '[ ]')
                        }
                        updateNote(activeNote.id, { content: lines.join('\n') })
                      }
                    }}
                    onHeadingClick={(headingId) => {
                      // Jump to the heading in the editor
                      if (editorViewRef.current) {
                        jumpToHeading(headingId)(editorViewRef.current)
                        // Only switch to edit mode if not already in split view
                        if (viewMode === 'preview') {
                          setViewMode('edit')
                        }
                      }
                    }}
                    onTagClick={(tagName) => {
                      // Search for notes containing this tag
                      setSidebarOpen(true)
                      setSearchQuery(`#${tagName}`)
                      toast({ title: 'Searching', description: `Showing notes with #${tagName}` })
                    }}
                    onEmbedClick={(source, heading, blockId) => {
                      // Navigate to the embedded note
                      const matchedNote = notes.find(
                        (n) => n.title.toLowerCase() === source.toLowerCase()
                      )
                      if (matchedNote) {
                        setActiveNoteId(matchedNote.id)
                        // Only switch to edit mode if currently in preview-only mode
                        if (viewMode === 'preview') {
                          setViewMode('edit')
                        }
                      } else {
                        // No matching note — create one using the store's createNote pattern
                        const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
                        const now = Date.now()
                        const newNote: Note = {
                          id,
                          title: source,
                          content: heading ? `# ${heading}\n\n` : '',
                          createdAt: now,
                          updatedAt: now,
                        }
                        useNotesStore.setState((state) => ({
                          notes: [newNote, ...state.notes],
                          activeNoteId: id,
                        }))
                        // Switch to edit mode if in preview-only; keep split view if already in split
                        if (viewMode !== 'split') {
                          setViewMode('edit')
                        }
                        toast({ title: 'Note created', description: `Created "${source}" — click to start editing` })
                      }
                    }}
                  />
              </div>
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
      )}
    </div>
  )
}
