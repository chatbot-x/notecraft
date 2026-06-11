'use client'

import { useNotesStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Search,
  Trash2,
  FileText,
  PanelLeftClose,
  PanelLeft,
  X,
  Copy,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'

export function Sidebar() {
  const {
    notes,
    activeNoteId,
    searchQuery,
    sidebarOpen,
    setActiveNoteId,
    setSearchQuery,
    setSidebarOpen,
    createNote,
    deleteNote,
    duplicateNote,
    getFilteredNotes,
    setCommandPaletteOpen,
  } = useNotesStore()

  const filteredNotes = getFilteredNotes()

  const handleCreateNote = () => {
    createNote()
  }

  const handleDeleteNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    deleteNote(id)
  }

  const handleDuplicateNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    duplicateNote(id)
  }

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed md:relative z-30 h-full flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'
        )}
      >
        <div
          className={cn(
            'flex flex-col h-full min-w-[288px]',
            !sidebarOpen && 'overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              <h1 className="text-base font-semibold tracking-tight">NoteCraft</h1>
            </div>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen(false)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Toggle sidebar
                  <kbd className="ml-2 bg-muted rounded px-1 py-0.5">Ctrl+B</kbd>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative group">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-foreground transition-colors" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-8 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 flex items-center justify-center transition-colors"
                >
                  <X className="h-2.5 w-2.5 text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* New Note + Command Palette Buttons */}
          <div className="px-3 pb-2 flex gap-1.5">
            <Button
              onClick={handleCreateNote}
              className="flex-1 justify-start gap-2 h-8 text-xs"
              size="sm"
              variant="default"
            >
              <Plus className="h-3.5 w-3.5" />
              New Note
            </Button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setCommandPaletteOpen(true)}
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Command Palette
                  <kbd className="ml-2 bg-muted rounded px-1 py-0.5">Ctrl+K</kbd>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Notes List */}
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-0.5 pb-4">
              {filteredNotes.length === 0 && (
                <div className="text-center py-12 px-4">
                  <div className="h-10 w-10 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'No notes match your search' : 'No notes yet'}
                  </p>
                  {!searchQuery && (
                    <Button
                      onClick={handleCreateNote}
                      variant="link"
                      className="mt-1 text-xs h-auto p-0"
                    >
                      Create your first note
                    </Button>
                  )}
                </div>
              )}
              <AnimatePresence initial={false}>
                {filteredNotes.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div
                      onClick={() => setActiveNoteId(note.id)}
                      className={cn(
                        'group relative flex flex-col gap-0.5 rounded-lg px-3 py-2 cursor-pointer transition-all',
                        activeNoteId === note.id
                          ? 'bg-primary/8 ring-1 ring-primary/20'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          'text-sm truncate flex-1',
                          activeNoteId === note.id ? 'font-medium' : 'font-normal'
                        )}>
                          {note.title}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <TooltipProvider delayDuration={500}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => handleDuplicateNote(note.id, e)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Duplicate</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete note?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete &quot;{note.title}&quot;. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={(e) => handleDeleteNote(note.id, e)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(note.updatedAt, { addSuffix: true })}
                        </span>
                        {note.content && (
                          <>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground line-clamp-1 flex-1">
                              {note.content.split('\n').slice(1).find((l) => l.trim()) || note.content.split('\n')[0]}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-border">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted rounded px-1 py-0.5 text-[10px]">Ctrl+K</kbd>
                commands
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Toggle button when sidebar is closed */}
      <AnimatePresence>
        {!sidebarOpen && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="fixed top-3 left-3 z-20 h-9 w-9 bg-card border border-border shadow-sm hover:shadow"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
