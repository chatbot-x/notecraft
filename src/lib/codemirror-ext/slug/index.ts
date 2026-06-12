/**
 * codemirror-ext: Slug Module
 *
 * Provides heading slug/anchor utilities for CodeMirror 6 markdown editor.
 * This is an editing-only module — no rendering engine.
 *
 * Features:
 * - Generate GitHub-style slugs from heading text (via github-slugger)
 * - Copy slug to clipboard command
 * - Generate heading ID attributes for markdown export
 * - Detect duplicate headings with suffix numbering
 * - Support explicit {#custom-slug} syntax
 */

import { EditorView, type Command, showPanel, type Panel } from '@codemirror/view'
import { EditorSelection, StateEffect, StateField } from '@codemirror/state'

// ─── Slug Generation ───────────────────────────────────────────────────────────

/**
 * Parse a heading line to extract level, title text, and optional custom slug.
 *
 * Examples:
 * - "## My Title" → { level: 2, title: "My Title", customSlug: null }
 * - "## My Title {#my-id}" → { level: 2, title: "My Title", customSlug: "my-id" }
 */
export function parseHeading(line: string): { level: number; title: string; customSlug: string | null } | null {
  const match = line.match(/^(#{1,6})\s+(.*)/)
  if (!match) return null

  const level = match[1].length
  let title = match[2]
  let customSlug: string | null = null

  // Check for explicit {#slug} syntax
  const slugMatch = title.match(/\s*\{#([^}]+)\}\s*$/)
  if (slugMatch) {
    customSlug = slugMatch[1]
    title = title.replace(/\s*\{#[^}]+\}\s*$/, '')
  }

  return { level, title: title.trim(), customSlug }
}

/**
 * Generate a slug from heading text using GitHub-style rules.
 * This mirrors github-slugger's algorithm without the runtime dependency
 * for the basic case. For full GitHub compatibility with emoji/unicode,
 * use `generateSlugWithSlugger()` instead.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove punctuation (except hyphens and spaces)
    .replace(/[^\w\s-]/g, '')
    // Replace spaces and consecutive hyphens with single hyphen
    .replace(/[\s_]+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
}

// Lazy-loaded github-slugger for full compatibility
let SluggerClass: any = null

async function loadSlugger(): Promise<any> {
  if (!SluggerClass) {
    const mod = await import('github-slugger')
    SluggerClass = mod.default || mod
  }
  return new SluggerClass()
}

/**
 * Generate a slug using the full github-slugger library.
 * Handles emoji, unicode, and duplicate heading suffixes correctly.
 */
export async function generateSlugWithSlugger(text: string, seenSlugs?: Set<string>): Promise<string> {
  const slugger = await loadSlugger()
  // If we have seen slugs, replay them for proper duplicate tracking
  if (seenSlugs) {
    for (const slug of seenSlugs) {
      slugger.slug(slug)
    }
  }
  return slugger.slug(text)
}

/**
 * Scan all headings in the document and return their slugs with duplicate tracking.
 * Returns a Map of heading line number → slug string.
 */
export function scanDocumentHeadings(doc: string): Map<number, { level: number; title: string; slug: string; hasCustomSlug: boolean }> {
  const result = new Map<number, { level: number; title: string; slug: string; hasCustomSlug: boolean }>()
  const seenSlugs = new Map<string, number>()

  const lines = doc.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseHeading(lines[i])
    if (!parsed) continue

    let slug: string
    if (parsed.customSlug) {
      slug = parsed.customSlug
    } else {
      slug = generateSlug(parsed.title)
    }

    // Handle duplicates
    const count = seenSlugs.get(slug) ?? 0
    if (count > 0) {
      slug = `${slug}-${count + 1}`
    }
    seenSlugs.set(slug.replace(/-\d+$/, ''), (seenSlugs.get(slug.replace(/-\d+$/, '')) ?? 0) + 1)

    result.set(i, {
      level: parsed.level,
      title: parsed.title,
      slug,
      hasCustomSlug: !!parsed.customSlug,
    })
  }

  return result
}

// ─── Commands ──────────────────────────────────────────────────────────────────

/**
 * Copy the slug of the heading at the current cursor position to clipboard.
 * Returns true if a heading was found, false otherwise.
 */
export const copyHeadingSlug: Command = (view) => {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const parsed = parseHeading(line.text)

  if (!parsed) return false

  const slug = parsed.customSlug || generateSlug(parsed.title)

  // Copy to clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(`#${slug}`).catch(() => {
      // Fallback: use execCommand
      const textarea = document.createElement('textarea')
      textarea.value = `#${slug}`
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    })
  }

  return true
}

// ─── Slug Input Panel (replaces browser prompt()) ─────────────────────────────

const openSlugPanel = StateEffect.define<{ defaultSlug: string; lineFrom: number; lineTo: number; hasCustomSlug: boolean }>()
const closeSlugPanel = StateEffect.define<null>()

const slugPanelOpen = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(openSlugPanel)) return true
      if (effect.is(closeSlugPanel)) return false
    }
    return value
  },
})

function createSlugPanel(view: EditorView): Panel {
  const dom = document.createElement('div')
  dom.className = 'cm-slug-panel'
  dom.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--cm-border, #e0e0e0);background:var(--cm-background, #fff);font-size:13px;'

  const label = document.createElement('label')
  label.textContent = 'Heading ID:'
  label.style.cssText = 'white-space:nowrap;color:var(--cm-text, #333);'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'my-heading-id'
  input.style.cssText = 'flex:1;padding:4px 8px;border:1px solid var(--cm-border, #ccc);border-radius:4px;font-size:13px;background:var(--cm-background, #fff);color:var(--cm-text, #333);outline:none;'

  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = 'Set'
  confirmBtn.style.cssText = 'padding:4px 12px;border-radius:4px;background:#3b82f6;color:#fff;border:none;cursor:pointer;font-size:13px;'

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'Cancel'
  cancelBtn.style.cssText = 'padding:4px 8px;border-radius:4px;background:transparent;color:var(--cm-text, #666);border:1px solid var(--cm-border, #ccc);cursor:pointer;font-size:13px;'

  dom.appendChild(label)
  dom.appendChild(input)
  dom.appendChild(confirmBtn)
  dom.appendChild(cancelBtn)

  let pendingEffect: { defaultSlug: string; lineFrom: number; lineTo: number; hasCustomSlug: boolean } | null = null

  // Apply slug on confirm
  function applySlug() {
    const slug = input.value.trim()
    if (!slug || !pendingEffect) {
      view.dispatch({ effects: closeSlugPanel.of(null) })
      view.focus()
      return
    }

    const { lineFrom, lineTo, hasCustomSlug } = pendingEffect
    const line = view.state.doc.lineAt(lineFrom)
    let newLineText: string
    if (hasCustomSlug) {
      newLineText = line.text.replace(/\{#[^}]+\}/, `{#${slug}}`)
    } else {
      newLineText = `${line.text} {#${slug}}`
    }

    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newLineText },
      effects: closeSlugPanel.of(null),
    })
    view.focus()
  }

  function cancel() {
    view.dispatch({ effects: closeSlugPanel.of(null) })
    view.focus()
  }

  confirmBtn.addEventListener('click', applySlug)
  cancelBtn.addEventListener('click', cancel)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applySlug() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })

  return {
    dom,
    update(update) {
      for (const effect of update.transactions.flatMap(t => t.effects)) {
        if (effect.is(openSlugPanel)) {
          pendingEffect = effect.value
          input.value = effect.value.defaultSlug
          requestAnimationFrame(() => input.select())
        }
      }
    },
    destroy() {
      confirmBtn.removeEventListener('click', applySlug)
      cancelBtn.removeEventListener('click', cancel)
    },
  }
}

const slugPanelExtension = showPanel.of(createSlugPanel)

/**
 * Insert or update an explicit {#slug} attribute on the heading at cursor.
 * Shows an inline panel below the editor (no browser prompt()).
 */
export const setHeadingSlug: Command = (view) => {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const parsed = parseHeading(line.text)

  if (!parsed) return false

  const defaultSlug = parsed.customSlug || generateSlug(parsed.title)

  view.dispatch({
    effects: openSlugPanel.of({
      defaultSlug,
      lineFrom: line.from,
      lineTo: line.to,
      hasCustomSlug: !!parsed.customSlug,
    }),
  })
  return true
}

/**
 * Remove the explicit {#slug} attribute from the heading at cursor.
 */
export const removeHeadingSlug: Command = (view) => {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const parsed = parseHeading(line.text)

  if (!parsed || !parsed.customSlug) return false

  const newLineText = line.text.replace(/\s*\{#[^}]+\}/, '')
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: newLineText },
  })
  view.focus()
  return true
}

/**
 * Jump to a heading by its slug. Searches the document for a heading
 * whose generated or custom slug matches the input.
 */
export function jumpToHeading(slug: string): Command {
  return (view) => {
    const doc = view.state.doc.toString()
    const headings = scanDocumentHeadings(doc)

    for (const [_lineNum, info] of headings) {
      if (info.slug === slug) {
        // Found — scroll to it
        const line = view.state.doc.line(_lineNum + 1) // Map 0-indexed to 1-indexed
        view.dispatch({
          selection: EditorSelection.cursor(line.from),
          effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        })
        view.focus()
        return true
      }
    }
    return false
  }
}

/**
 * Get the slug of the heading at the current cursor position.
 * Returns null if not on a heading line.
 */
export function getCurrentHeadingSlug(view: EditorView): string | null {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const parsed = parseHeading(line.text)
  if (!parsed) return null
  return parsed.customSlug || generateSlug(parsed.title)
}

/** Extensions required for the slug input panel (add to editor extensions array) */
export const slugPanelExtensions = [slugPanelOpen, slugPanelExtension]
