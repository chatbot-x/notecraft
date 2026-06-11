'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
  content: string
  isDark: boolean
  fontSize: number
}

export function MarkdownPreview({ content, isDark, fontSize }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Start writing to see the preview...
      </div>
    )
  }

  return (
    <div
      className="markdown-preview h-full overflow-auto px-8 py-6"
      style={{ fontSize: `${fontSize}px` }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold tracking-tight mt-8 mb-4 first:mt-0 border-b border-border pb-3">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold tracking-tight mt-6 mb-3 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-5 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="leading-7 mb-4 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className={isDark
                    ? 'bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono'
                    : 'bg-black/5 rounded px-1.5 py-0.5 text-sm font-mono'
                  }
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className} block text-sm`} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre
              className={`rounded-lg p-4 overflow-x-auto my-4 text-sm ${
                isDark ? 'bg-white/5' : 'bg-black/5'
              }`}
            >
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-6 border-border" />
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className={isDark ? 'bg-white/5' : 'bg-black/5'}>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2">{children}</td>
          ),
          strong: ({ children }) => (
            <strong className="font-bold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
