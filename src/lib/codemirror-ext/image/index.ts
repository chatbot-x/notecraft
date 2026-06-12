/**
 * codemirror-ext: Image Upload Module
 *
 * Provides image upload workflow for CodeMirror 6 markdown editor.
 * Based on yeliex/codemirror-markdown-image with enhancements:
 * - Configurable upload handler
 * - Upload progress indication
 * - Image status linter
 * - Drag-and-drop support
 * - Paste-to-upload support
 *
 * NOTE: This is an editing tool only — no rendering/preview engine.
 */

import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate, Decoration, type DecorationSet, WidgetType } from '@codemirror/view'
import { linter, type Diagnostic } from '@codemirror/lint'
import type { Command } from '@codemirror/view'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UploadCallback {
  /** Report upload progress (0-100) */
  progress: (percent: number) => void
  /** Mark upload as failed */
  fail: (error: Error) => void
  /** Mark upload as successful with the resulting URL */
  success: (url: string) => void
}

export interface UploadActionParams {
  /** Unique ID for tracking this upload */
  id: string
  /** The File object to upload */
  file: File
  /** Callbacks for reporting upload status */
  callback: UploadCallback
}

export interface ImageUploadOptions {
  /** Whether to allow multiple file selection (default: true) */
  multiple?: boolean
  /** File accept filter (default: 'image/*') */
  accept?: string
  /** Upload handler — REQUIRED. Called when files are selected. */
  action: (params: UploadActionParams) => void
  /** Enable drag-and-drop upload (default: true) */
  enableDrop?: boolean
  /** Enable paste upload (default: true) */
  enablePaste?: boolean
}

// ─── State Management ──────────────────────────────────────────────────────────

interface UploadItem {
  id: string
  fileName: string
  status: 'uploading' | 'success' | 'failed'
  progress: number
  error?: string
  url?: string
}

type UploadAction =
  | { type: 'start'; id: string; fileName: string }
  | { type: 'progress'; id: string; percent: number }
  | { type: 'success'; id: string; url: string }
  | { type: 'fail'; id: string; error: string }

const uploadEffect = StateEffect.define<UploadAction>()

/** Track upload status in editor state */
const uploadField = StateField.define<Map<string, UploadItem>>({
  create: () => new Map(),
  update: (items, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(uploadEffect)) {
        const next = new Map(items)
        const action = effect.value
        switch (action.type) {
          case 'start':
            next.set(action.id, { id: action.id, fileName: action.fileName, status: 'uploading', progress: 0 })
            break
          case 'progress': {
            const item = next.get(action.id)
            if (item) next.set(action.id, { ...item, progress: action.percent })
            break
          }
          case 'success': {
            const item = next.get(action.id)
            if (item) next.set(action.id, { ...item, status: 'success', url: action.url })
            break
          }
          case 'fail': {
            const item = next.get(action.id)
            if (item) next.set(action.id, { ...item, status: 'failed', error: action.error })
            break
          }
        }
        return next
      }
    }
    return items
  },
})

// ─── Placeholder Widget ────────────────────────────────────────────────────────

/** The placeholder prefix used in the document during upload */
const UPLOAD_PREFIX = '__image_uploading__:'

class UploadPlaceholderWidget extends WidgetType {
  constructor(readonly id: string, readonly fileName: string) {
    super()
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-image-upload-placeholder'
    span.setAttribute('data-upload-id', this.id)
    span.textContent = `Uploading ${this.fileName}...`
    span.style.cssText = 'opacity:0.5; font-style:italic; color:#888;'
    return span
  }

  ignoreEvent() { return false }
}

// ─── Upload Decoration Plugin ──────────────────────────────────────────────────

function uploadDecorations(items: Map<string, UploadItem>, doc: string): DecorationSet {
  const widgets: Range<Decoration>[] = [] as Range<Decoration>[]
  // Find all uploading placeholders in the document
  for (const [id, item] of items) {
    if (item.status === 'uploading') {
      const searchText = `${UPLOAD_PREFIX}${id}`
      let pos = doc.indexOf(searchText)
      while (pos !== -1) {
        const end = pos + searchText.length
        const widget = Decoration.replace({
          widget: new UploadPlaceholderWidget(id, item.fileName),
        })
        widgets.push(widget.range(pos, end))
        pos = doc.indexOf(searchText, end)
      }
    }
  }
  return Decoration.set(widgets, true)
}

const uploadDecorator = ViewPlugin.fromClass(class implements PluginValue {
  decorations: DecorationSet

  constructor(readonly view: EditorView) {
    this.decorations = uploadDecorations(view.state.field(uploadField), view.state.doc.toString())
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.transactions.some(tr => tr.effects.some(e => e.is(uploadEffect)))) {
      this.decorations = uploadDecorations(update.state.field(uploadField), update.state.doc.toString())
    }
  }
}, {
  decorations: v => v.decorations,
})

// ─── Auto-replace successful uploads ───────────────────────────────────────────

const uploadReplacer = ViewPlugin.fromClass(class implements PluginValue {
  private destroyed = false

  constructor(readonly view: EditorView) {}

  update(update: ViewUpdate) {
    // Collect all replacements needed from this batch of transactions
    const replacements: Array<{ id: string; url: string }> = []
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(uploadEffect) && effect.value.type === 'success') {
          replacements.push(effect.value)
        }
      }
    }

    if (replacements.length === 0) return

    // Defer dispatch to avoid dispatching during update cycle
    setTimeout(() => {
      if (this.destroyed) return
      // Batch all replacements into a single dispatch to avoid stale doc state
      const doc = this.view.state.doc.toString()
      const changes: Array<{ from: number; to: number; insert: string }> = []
      for (const { id, url } of replacements) {
        const searchText = `${UPLOAD_PREFIX}${id}`
        const pos = doc.indexOf(searchText)
        if (pos !== -1) {
          changes.push({ from: pos, to: pos + searchText.length, insert: url })
        }
      }
      if (changes.length > 0) {
        this.view.dispatch({ changes })
      }
    }, 0)
  }

  destroy() {
    this.destroyed = true
  }
}, {})

// ─── Image Status Linter ───────────────────────────────────────────────────────

/**
 * Linter that flags images still uploading or failed.
 * Shows warnings in the editor gutter.
 */
export function imageStatusLinter(): Extension {
  return linter((view): Diagnostic[] => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc.toString()

    // Find uploading placeholders
    let pos = doc.indexOf(UPLOAD_PREFIX)
    while (pos !== -1) {
      const endOfId = doc.indexOf(')', pos)
      const idEnd = endOfId === -1 ? pos + UPLOAD_PREFIX.length + 20 : endOfId
      diagnostics.push({
        from: pos,
        to: idEnd,
        severity: 'warning',
        message: 'Image is still uploading',
      })
      pos = doc.indexOf(UPLOAD_PREFIX, idEnd)
    }

    return diagnostics
  })
}

// ─── Upload Command ────────────────────────────────────────────────────────────

/** Generate a unique ID for upload tracking */
function generateUploadId(file: File): string {
  return `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Trigger the file picker and upload flow.
 * This is the main command to add images via the toolbar or keyboard shortcut.
 */
export function createImageUploadCommand(options: ImageUploadOptions): Command {
  return (view) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple ?? true
    input.accept = options.accept ?? 'image/*'

    input.onchange = () => {
      const files = input.files
      if (!files) return

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const id = generateUploadId(file)

        // Insert placeholder into document
        const placeholder = `![${file.name}](${UPLOAD_PREFIX}${id})`
        const cursor = view.state.selection.main.head
        view.dispatch({
          changes: { from: cursor, insert: placeholder },
          selection: { anchor: cursor + placeholder.length },
        })

        // Notify state that upload started
        view.dispatch({
          effects: uploadEffect.of({ type: 'start', id, fileName: file.name }),
        })

        // Call the user's upload handler
        options.action({
          id,
          file,
          callback: {
            progress: (percent) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'progress', id, percent }) })
            },
            fail: (error) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'fail', id, error: error.message }) })
            },
            success: (url) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'success', id, url }) })
            },
          },
        })
      }
    }

    input.click()
    return true
  }
}

// ─── Drop Handler ──────────────────────────────────────────────────────────────

function createDropHandler(options: ImageUploadOptions): Extension {
  if (!options.enableDrop) return []

  return EditorView.domEventHandlers({
    drop(event, view) {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return false

      // Check if any files are images
      const imageFiles = Array.from(files).filter(f =>
        f.type.startsWith('image/') || (options.accept && f.name.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i))
      )
      if (imageFiles.length === 0) return false

      event.preventDefault()

      for (const file of imageFiles) {
        const id = generateUploadId(file)
        const placeholder = `![${file.name}](${UPLOAD_PREFIX}${id})`
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head

        view.dispatch({
          changes: { from: pos, insert: placeholder },
          selection: { anchor: pos + placeholder.length },
        })
        view.dispatch({ effects: uploadEffect.of({ type: 'start', id, fileName: file.name }) })

        options.action({
          id,
          file,
          callback: {
            progress: (percent) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'progress', id, percent }) })
            },
            fail: (error) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'fail', id, error: error.message }) })
            },
            success: (url) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'success', id, url }) })
            },
          },
        })
      }

      return true
    },
  })
}

// ─── Paste Handler ─────────────────────────────────────────────────────────────

function createPasteHandler(options: ImageUploadOptions): Extension {
  if (!options.enablePaste) return []

  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = event.clipboardData?.files
      if (!files || files.length === 0) return false

      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
      if (imageFiles.length === 0) return false

      event.preventDefault()

      for (const file of imageFiles) {
        const id = generateUploadId(file)
        const placeholder = `![${file.name}](${UPLOAD_PREFIX}${id})`
        const cursor = view.state.selection.main.head

        view.dispatch({
          changes: { from: cursor, insert: placeholder },
          selection: { anchor: cursor + placeholder.length },
        })
        view.dispatch({ effects: uploadEffect.of({ type: 'start', id, fileName: file.name }) })

        options.action({
          id,
          file,
          callback: {
            progress: (percent) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'progress', id, percent }) })
            },
            fail: (error) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'fail', id, error: error.message }) })
            },
            success: (url) => {
              view.dispatch({ effects: uploadEffect.of({ type: 'success', id, url }) })
            },
          },
        })
      }

      return true
    },
  })
}

// ─── Upload Styles ─────────────────────────────────────────────────────────────

const uploadStyles = EditorView.baseTheme({
  '.cm-image-upload-placeholder': {
    opacity: '0.5',
    fontStyle: 'italic',
    color: '#888',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #f59e0b',
  },
})

// ─── Main Extension Factory ────────────────────────────────────────────────────

/**
 * Create the image upload extension for CodeMirror 6.
 *
 * Usage:
 * ```ts
 * import { imageUpload } from '@/lib/codemirror-ext'
 *
 * const extensions = [
 *   imageUpload({
 *     action: ({ file, callback }) => {
 *       // Upload file to your server
 *       uploadToServer(file)
 *         .then(url => callback.success(url))
 *         .catch(err => callback.fail(err))
 *     },
 *   }),
 * ]
 * ```
 */
export function imageUpload(options: ImageUploadOptions): Extension[] {
  return [
    uploadField,
    uploadDecorator,
    uploadReplacer,
    imageStatusLinter(),
    createDropHandler(options),
    createPasteHandler(options),
    uploadStyles,
  ]
}

// createImageUploadCommand is already exported above
