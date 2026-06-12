'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { renderMarkdownSync, renderMarkdown, type RenderResult } from '@/lib/renderer'
import mediumZoom, { type Zoom } from 'medium-zoom'
import { toast } from '@/hooks/use-toast'
import { logger } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarkdownPreviewProps {
  content: string
  isDark: boolean
  fontSize: number
  /** Callback when a task list checkbox is toggled */
  onTaskToggle?: (lineNumber: number, checked: boolean) => void
  /** Callback when a heading is clicked (for scroll sync) */
  onHeadingClick?: (headingId: string) => void
  /** Callback when an Obsidian tag is clicked */
  onTagClick?: (tagName: string) => void
  /** Callback when an embed note is clicked */
  onEmbedClick?: (source: string, heading?: string, blockId?: string) => void
  /** Notes data for resolving embed placeholders */
  notes?: Array<{ title: string; content: string }>
  /** Ref to the scroll container (for parent scroll sync) */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarkdownPreview({
  content,
  isDark,
  fontSize,
  onTaskToggle,
  onHeadingClick,
  onTagClick,
  onEmbedClick,
  notes,
  scrollContainerRef,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderResult, setRenderResult] = useState<RenderResult>({ html: '', headings: [], frontMatter: null })
  const [isRendering, setIsRendering] = useState(false)
  const zoomRef = useRef<Zoom | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderVersionRef = useRef(0)

  // ─── Render Markdown ──────────────────────────────────────────────────

  const renderContent = useCallback(async () => {
    if (!content.trim()) {
      setRenderResult({ html: '', headings: [], frontMatter: null })
      return
    }

    // Increment version counter to detect stale async renders
    const version = ++renderVersionRef.current

    setIsRendering(true)
    try {
      // Use sync render first for fast initial paint
      const syncResult = renderMarkdownSync(content, { isDark })
      setRenderResult(syncResult)

      // Then do async render with Shiki highlighting
      const asyncResult = await renderMarkdown(content, { isDark })
      // Discard stale result if a newer render has started
      if (renderVersionRef.current !== version) return
      setRenderResult(asyncResult)
    } catch (err) {
      if (renderVersionRef.current !== version) return
      logger.error('[MarkdownPreview] Render error:', err)
      // Fallback to sync render
      const fallback = renderMarkdownSync(content, { isDark })
      setRenderResult(fallback)
    } finally {
      if (renderVersionRef.current === version) {
        setIsRendering(false)
      }
    }
  }, [content, isDark])

  // Debounced rendering
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(renderContent, 150)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [renderContent])

  // ─── Resolve Embed Placeholders ────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || !notes || notes.length === 0) return

    const placeholders = containerRef.current.querySelectorAll('.embed-note-content[data-embed-placeholder="true"]')
    if (placeholders.length === 0) return

    // Track resolved sources to prevent recursive/circular embeds
    const resolving = new Set<string>()

    for (const placeholder of placeholders) {
      const embedContainer = placeholder.closest('.embed-note') as HTMLElement | null
      if (!embedContainer) continue

      const source = embedContainer.dataset.embedSrc
      if (!source) continue

      // Skip if already resolving this source (prevents infinite recursion)
      if (resolving.has(source.toLowerCase())) continue
      resolving.add(source.toLowerCase())

      // Find the matching note by title (case-insensitive)
      const matchedNote = notes.find(
        (n) => n.title.toLowerCase() === source.toLowerCase()
      )

      if (matchedNote) {
        // Render the embedded note's content (sync for speed)
        try {
          const result = renderMarkdownSync(matchedNote.content, { isDark })
          placeholder.innerHTML = result.html
          placeholder.removeAttribute('data-embed-placeholder')
          placeholder.classList.add('embed-resolved')
        } catch {
          // If rendering fails, show a link to the note instead
          placeholder.innerHTML = `<p class="embed-error">Could not render embedded note.</p>`
          placeholder.removeAttribute('data-embed-placeholder')
        }
      } else {
        placeholder.innerHTML = `<p class="embed-not-found">Note "${source}" not found. Click header to create it.</p>`
        placeholder.removeAttribute('data-embed-placeholder')
      }
    }
  }, [renderResult.html, isDark, notes])

  // ─── Initialize Medium Zoom ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    // Detach previous zoom instance
    if (zoomRef.current) {
      zoomRef.current.detach()
    }

    // Attach zoom to all images in the preview
    const images = containerRef.current.querySelectorAll('img')
    if (images.length > 0) {
      zoomRef.current = mediumZoom(images, {
        background: 'var(--background)',
        margin: 24,
      })
    }

    return () => {
      if (zoomRef.current) {
        zoomRef.current.detach()
        zoomRef.current = null
      }
    }
  }, [renderResult.html, isDark])

  // ─── Render Mermaid Diagrams ─────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const mermaidContainers = containerRef.current.querySelectorAll('.mermaid-container[data-mermaid-source]')

    if (mermaidContainers.length === 0) return

    let cancelled = false

    async function renderMermaidDiagrams() {
      try {
        // Dynamic import — Mermaid is heavy (~200KB), only load when needed
        const mermaid = (await import('mermaid')).default

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })

        let mermaidCounter = 0
        for (const container of mermaidContainers) {
          if (cancelled) break

          const source = (container as HTMLElement).dataset.mermaidSource
          if (!source) continue

          try {
            const id = `mermaid-${++mermaidCounter}`
            const { svg } = await mermaid.render(id, source)
            if (!cancelled) {
              container.innerHTML = svg
              container.removeAttribute('data-mermaid-source')
            }
          } catch (err) {
            logger.warn('[Mermaid] Render failed:', err)
            if (!cancelled) {
              container.innerHTML = `<div class="mermaid-error"><p>Failed to render diagram</p><pre><code>${source}</code></pre></div>`
              container.removeAttribute('data-mermaid-source')
            }
          }
        }
      } catch (err) {
        logger.warn('[Mermaid] Library load failed:', err)
      }
    }

    renderMermaidDiagrams()

    return () => {
      cancelled = true
    }
  }, [renderResult.html, isDark])

  // ─── Event Delegation ────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement

      // ── Copy code button ──────────────────────────────────────────
      const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
      if (copyBtn) {
        e.preventDefault()
        const code = copyBtn.dataset.code
        if (code) {
          // Decode HTML entities from the data attribute
          const decoded = code
            .replace(/&#10;/g, '\n')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')

          navigator.clipboard.writeText(decoded).then(() => {
            const originalTitle = copyBtn.getAttribute('title')
            copyBtn.setAttribute('title', 'Copied!')
            copyBtn.classList.add('copied')
            toast({ title: 'Copied!', description: 'Code copied to clipboard' })
            setTimeout(() => {
              copyBtn.setAttribute('title', originalTitle ?? 'Copy code')
              copyBtn.classList.remove('copied')
            }, 2000)
          }).catch(() => {
            toast({ title: 'Copy failed', description: 'Could not copy to clipboard' })
          })
        }
        return
      }

      // ── Task list checkbox toggle ─────────────────────────────────
      const checkbox = target.closest('input[type="checkbox"]') as HTMLInputElement | null
      if (checkbox && checkbox.closest('.contains-task-list')) {
        e.preventDefault()
        const lineNumber = checkbox.dataset.line
          ? parseInt(checkbox.dataset.line, 10)
          : -1
        onTaskToggle?.(lineNumber, !checkbox.checked)
        return
      }

      // ── Obsidian tag click ───────────────────────────────────────
      const tagEl = target.closest('a.obsidian-tag') as HTMLAnchorElement | null
      if (tagEl) {
        e.preventDefault()
        const tagName = tagEl.dataset.tag
        if (tagName) {
          onTagClick?.(tagName)
        }
        return
      }

      // ── Embed note click ─────────────────────────────────────────
      const embedNote = target.closest('.embed-note-header') as HTMLElement | null
      if (embedNote) {
        e.preventDefault()
        const embedContainer = embedNote.closest('.embed-note') as HTMLElement | null
        if (embedContainer) {
          const source = embedContainer.dataset.embedSrc
          const heading = embedContainer.dataset.embedHeading
          const blockId = embedContainer.dataset.embedBlock
          if (source) {
            onEmbedClick?.(source, heading, blockId)
          }
        }
        return
      }

      // ── Block reference indicator click ──────────────────────────
      const blockRef = target.closest('.block-ref-id') as HTMLElement | null
      if (blockRef) {
        e.preventDefault()
        const blockId = blockRef.dataset.blockId
        if (blockId) {
          // Navigate to or highlight the block
          const targetEl = containerRef.current?.querySelector(`[data-block-id="${blockId}"]`)
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
        return
      }

      // ── Heading click (for scroll sync) ──────────────────────────
      const heading = target.closest('h1, h2, h3, h4, h5, h6') as HTMLElement | null
      if (heading?.id) {
        onHeadingClick?.(heading.id)
        return
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [onTaskToggle, onHeadingClick, onTagClick, onEmbedClick])

  // ─── Empty State ─────────────────────────────────────────────────────

  if (!content.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Start writing to see the preview...
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="relative h-full">
      {isRendering && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/80 backdrop-blur-sm rounded-md px-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rendering...
        </div>
      )}
      <div
        ref={(el) => {
          // Merge both refs
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          if (scrollContainerRef) scrollContainerRef.current = el
        }}
        className="markdown-preview h-full overflow-auto px-8 py-6"
        style={{ fontSize: `${fontSize}px` }}
        dangerouslySetInnerHTML={{ __html: renderResult.html }}
      />
    </div>
  )
}
