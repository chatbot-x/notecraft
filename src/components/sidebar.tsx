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
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

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
    getFilteredNotes,
  } = useNotesStore()

  const filteredNotes = getFilteredNotes()

  const handleCreateNote = () => {
    createNote()
  }

  const handleDeleteNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    deleteNote(id)
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold tracking-tight">NoteCraft</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="h-8 w-8"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* New Note Button */}
          <div className="px-3 pb-2">
            <Button
              onClick={handleCreateNote}
              className="w-full justify-start gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              New Note
            </Button>
          </div>

          {/* Notes List */}
          <ScrollArea className="flex-1 px-3">
            <div className="space-y-1 pb-4">
              {filteredNotes.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery ? 'No notes found' : 'No notes yet. Create one!'}
                </div>
              )}
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setActiveNoteId(note.id)}
                  className={cn(
                    'group relative flex flex-col gap-1 rounded-lg px-3 py-2.5 cursor-pointer transition-colors',
                    activeNoteId === note.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate pr-6">
                      {note.title}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(note.updatedAt, { addSuffix: true })}
                  </span>
                  {note.content && (
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {note.content.split('\n').find((l) => l.trim()) || 'Empty note'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-3 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} &middot; Saved locally
            </p>
          </div>
        </div>
      </aside>

      {/* Toggle button when sidebar is closed */}
      {!sidebarOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 left-3 z-20 h-9 w-9 bg-card border border-border shadow-sm"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}
