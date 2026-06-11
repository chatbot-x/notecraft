/**
 * codemirror-ext: Toolbar React Component
 *
 * Renders inside the CM6 toolbar container via a portal.
 * Replaces yeliex's static DOM buttons with a rich React UI
 * using Lucide icons and full tooltip/shortcut support.
 */
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold, Italic, Strikethrough, Code, Underline, Highlighter,
  Heading1, Heading2, Heading3, Heading4,
  List, ListOrdered, CheckSquare,
  Quote, Link, ImagePlus, Table, FileCode,
  SeparatorHorizontal, Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolbarItemConfig, ToolbarItem } from './types'
import type { Command, EditorView } from '@codemirror/view'
import {
  bold, italic, strikethrough, inlineCode, underline, highlight,
  h1, h2, h3, h4,
  blockquote, unorderedList, orderedList, todoList,
  link, image, codeBlock, horizontalRule, table,
} from '../commands'
import { createImageUploadCommand } from '../image'

// ─── Image upload command factory ──────────────────────────────────────────────

/** Default image upload handler — converts to data URL for local storage */
function defaultImageUploadHandler({ file, callback }: { id: string; file: File; callback: { progress: (n: number) => void; fail: (e: Error) => void; success: (u: string) => void } }) {
  const reader = new FileReader()
  reader.onprogress = (e) => { if (e.lengthComputable) callback.progress(Math.round((e.loaded / e.total) * 100)) }
  reader.onload = () => callback.success(reader.result as string)
  reader.onerror = () => callback.fail(new Error('Failed to read file'))
  reader.readAsDataURL(file)
}

const imageUploadCommand = createImageUploadCommand({
  action: defaultImageUploadHandler,
  enableDrop: true,
  enablePaste: true,
})

// ─── UI Primitives ────────────────────────────────────────────────────────────

const ToolbarSeparator = () => (
  <div className="w-px h-5 bg-border mx-0.5 shrink-0" role="separator" />
)

const ToolbarSpacer = () => <div className="flex-1" />

// ─── Default Toolbar Items ────────────────────────────────────────────────────

export const defaultToolbarItems: ToolbarItemConfig[] = [
  { key: 'bold', label: 'Bold', icon: <Bold className="h-3.5 w-3.5" />, command: bold, shortcut: 'Ctrl+B' },
  { key: 'italic', label: 'Italic', icon: <Italic className="h-3.5 w-3.5" />, command: italic, shortcut: 'Ctrl+I' },
  { key: 'strikethrough', label: 'Strikethrough', icon: <Strikethrough className="h-3.5 w-3.5" />, command: strikethrough },
  { key: 'code', label: 'Inline Code', icon: <Code className="h-3.5 w-3.5" />, command: inlineCode, shortcut: 'Ctrl+`' },
  { key: 'underline', label: 'Underline', icon: <Underline className="h-3.5 w-3.5" />, command: underline },
  { key: 'highlight', label: 'Highlight', icon: <Highlighter className="h-3.5 w-3.5" />, command: highlight },
  { type: 'separator' },
  { key: 'h1', label: 'Heading 1', icon: <Heading1 className="h-3.5 w-3.5" />, command: h1 },
  { key: 'h2', label: 'Heading 2', icon: <Heading2 className="h-3.5 w-3.5" />, command: h2 },
  { key: 'h3', label: 'Heading 3', icon: <Heading3 className="h-3.5 w-3.5" />, command: h3 },
  { key: 'h4', label: 'Heading 4', icon: <Heading4 className="h-3.5 w-3.5" />, command: h4 },
  { type: 'separator' },
  { key: 'quote', label: 'Block Quote', icon: <Quote className="h-3.5 w-3.5" />, command: blockquote },
  { key: 'ul', label: 'Bullet List', icon: <List className="h-3.5 w-3.5" />, command: unorderedList },
  { key: 'ol', label: 'Numbered List', icon: <ListOrdered className="h-3.5 w-3.5" />, command: orderedList },
  { key: 'todo', label: 'To-Do List', icon: <CheckSquare className="h-3.5 w-3.5" />, command: todoList },
  { type: 'separator' },
  { key: 'link', label: 'Insert Link', icon: <Link className="h-3.5 w-3.5" />, command: link },
  { key: 'image', label: 'Insert Image', icon: <ImagePlus className="h-3.5 w-3.5" />, command: image },
  { key: 'upload', label: 'Upload Image', icon: <Upload className="h-3.5 w-3.5" />, command: imageUploadCommand, shortcut: 'Ctrl+Shift+I' },
  { key: 'codeblock', label: 'Code Block', icon: <FileCode className="h-3.5 w-3.5" />, command: codeBlock },
  { key: 'table', label: 'Insert Table', icon: <Table className="h-3.5 w-3.5" />, command: table },
  { key: 'hr', label: 'Horizontal Rule', icon: <SeparatorHorizontal className="h-3.5 w-3.5" />, command: horizontalRule },
]

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarButton({
  item,
  onCommand,
}: {
  item: ToolbarItem
  onCommand: (command: Command) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex items-center justify-center',
        'h-7 w-7 rounded-md',
        'text-muted-foreground hover:text-foreground',
        'hover:bg-muted/80',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      aria-label={item.label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onCommand(item.command)
      }}
    >
      {item.icon}
    </button>
  )
}

// ─── Main Toolbar Component ───────────────────────────────────────────────────

interface ToolbarProps {
  /** The CodeMirror EditorView instance */
  view: EditorView | null
  /** Custom items to render (defaults to defaultToolbarItems) */
  items?: ToolbarItemConfig[]
  /** Additional CSS class for the toolbar container */
  className?: string
}

export function Toolbar({ view, items = defaultToolbarItems, className }: ToolbarProps) {
  const [, setTick] = useState(0)

  // Re-render on editor updates (for active state detection)
  useEffect(() => {
    const container = view?.dom.querySelector('.cm-toolbar-container')
    if (!container) return

    const handler = () => setTick((t) => t + 1)
    container.addEventListener('cm-toolbar-update', handler)
    return () => container.removeEventListener('cm-toolbar-update', handler)
  }, [view])

  const handleCommand = useCallback(
    (command: Command) => {
      if (view) {
        command(view)
        view.focus()
      }
    },
    [view],
  )

  if (!view) return null

  const toolbarContainer = view.dom.querySelector('.cm-toolbar-container')
  if (!toolbarContainer) return null

  return createPortal(
    <div
      className={cn(
        'flex items-center gap-0.5 px-2 py-1',
        'border-b border-border bg-card/95 backdrop-blur-sm',
        'select-none',
        className,
      )}
    >
      {items.map((item, idx) => {
        if ('type' in item) {
          if (item.type === 'separator') return <ToolbarSeparator key={`sep-${idx}`} />
          if (item.type === 'spacer') return <ToolbarSpacer key={`space-${idx}`} />
          if (item.type === 'group') {
            return (
              <React.Fragment key={`group-${idx}`}>
                {item.items.map((subItem, subIdx) => {
                  if ('type' in subItem) {
                    if (subItem.type === 'separator') return <ToolbarSeparator key={`sep-${idx}-${subIdx}`} />
                    if (subItem.type === 'spacer') return <ToolbarSpacer key={`space-${idx}-${subIdx}`} />
                  }
                  return (
                    <ToolbarButton
                      key={(subItem as ToolbarItem).key}
                      item={subItem as ToolbarItem}
                      onCommand={handleCommand}
                    />
                  )
                })}
              </React.Fragment>
            )
          }
        }
        return (
          <ToolbarButton
            key={(item as ToolbarItem).key}
            item={item as ToolbarItem}
            onCommand={handleCommand}
          />
        )
      })}
    </div>,
    toolbarContainer,
  )
}
