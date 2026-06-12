'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { renderMarkdownSync, renderMarkdown, type RenderResult } from '@/lib/renderer'
import mediumZoom, { type Zoom } from 'medium-zoom'

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
  /** Callback when a wikilink is clicked */
  onWikilinkClick?: (pageName: string, heading?: string, blockId?: string) => void
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
  onWikilinkClick,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderResult, setRenderResult] = useState<RenderResult>({ html: '', headings: [], frontMatter: null })
  const [isRendering, setIsRendering] = useState(false)
  const zoomRef = useRef<Zoom | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Render Markdown ──────────────────────────────────────────────────

  const renderContent = useCallback(async () => {
    if (!content.trim()) {
      setRenderResult({ html: '', headings: [], frontMatter: null })
      return
    }

    setIsRendering(true)
    try {
      // Use sync render first for fast initial paint
      const syncResult = renderMarkdownSync(content, { isDark })
      setRenderResult(syncResult)

      // Then do async render with Shiki highlighting
      const asyncResult = await renderMarkdown(content, { isDark })
      setRenderResult(asyncResult)
    } catch (err) {
      console.error('[MarkdownPreview] Render error:', err)
      // Fallback to sync render
      const fallback = renderMarkdownSync(content, { isDark })
      setRenderResult(fallback)
    } finally {
      setIsRendering(false)
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

  // ─── Initialize Medium Zoom ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    // Detach previous zoom instance
    if (zoomRef.current) {
      zoomRef.current.detach()
    }

    // Attach zoom to all images in the preview
    const images = containerRef.current.querySelectorAll('.markdown-preview img')
    if (images.length > 0) {
      zoomRef.current = mediumZoom(images, {
        background: isDark ? 'var(--background)' : 'var(--background)',
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
          securityLevel: 'loose',
          fontFamily: 'inherit',
        })

        for (const container of mermaidContainers) {
          if (cancelled) break

          const source = (container as HTMLElement).dataset.mermaidSource
          if (!source) continue

          try {
            const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
            const { svg } = await mermaid.render(id, source)
            if (!cancelled) {
              container.innerHTML = svg
              container.removeAttribute('data-mermaid-source')
            }
          } catch (err) {
            console.warn('[Mermaid] Render failed:', err)
            if (!cancelled) {
              container.innerHTML = `<div class="mermaid-error"><p>Failed to render diagram</p><pre><code>${source}</code></pre></div>`
              container.removeAttribute('data-mermaid-source')
            }
          }
        }
      } catch (err) {
        console.warn('[Mermaid] Library load failed:', err)
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
            setTimeout(() => {
              copyBtn.setAttribute('title', originalTitle ?? 'Copy code')
              copyBtn.classList.remove('copied')
            }, 2000)
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

      // ── Wikilink click ─────────────────────────────────────────
      const wikilink = target.closest('a.obsidian-wikilink') as HTMLAnchorElement | null
      if (wikilink) {
        e.preventDefault()
        const page = wikilink.dataset.wikilinkPage
        const heading = wikilink.dataset.wikilinkHeading
        const blockId = wikilink.dataset.wikilinkBlock
        if (page !== undefined) {
          onWikilinkClick?.(page || '', heading, blockId)
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
  }, [onTaskToggle, onHeadingClick, onTagClick, onEmbedClick, onWikilinkClick])

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
    <div
      ref={containerRef}
      className={`markdown-preview h-full overflow-auto px-8 py-6 ${isDark ? 'dark-preview' : 'light-preview'}`}
      style={{ fontSize: `${fontSize}px` }}
      dangerouslySetInnerHTML={{ __html: renderResult.html }}
    />
  )
}
