/**
 * Custom markdown-it plugin for Obsidian-style inline comments.
 *
 * Syntax: %%comment text%%
 *
 * In Obsidian, text wrapped in %% is hidden in reading mode.
 * This plugin strips %%delimited content%% from the output entirely,
 * or wraps it in an HTML comment for source visibility.
 *
 * No remark equivalent exists for this syntax — this is implemented
 * from scratch based on Obsidian's behavior.
 *
 * Options:
 *   - strip: boolean (default: true) — If true, remove comments entirely.
 *     If false, wrap in HTML comment <!-- ... --> for source visibility.
 */

import type MarkdownIt from 'markdown-it'

const COMMENT_RE = /%%(.*?)%%/g

export interface CommentPluginOptions {
  /** Strip comments entirely (true) or wrap in HTML comment (false) */
  strip?: boolean
}

export default function commentPlugin(md: MarkdownIt, opts: CommentPluginOptions = {}): void {
  const strip = opts.strip ?? true

  // Inline rule: scan text tokens for %%...%% patterns
  md.core.ruler.after('inline', 'comment', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline') continue
      if (!token.children) continue

      let modified = false
      const newChildren: any[] = []

      for (const child of token.children) {
        if (child.type !== 'text' || !child.content.includes('%%')) {
          newChildren.push(child)
          continue
        }

        // Split on %% patterns
        const parts = child.content.split(COMMENT_RE)
        if (parts.length <= 1) {
          newChildren.push(child)
          continue
        }

        modified = true
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          if (i % 2 === 0) {
            // Regular text (outside %%)
            if (part) {
              const textToken = new state.Token('text', '', 0)
              textToken.content = part
              newChildren.push(textToken)
            }
          } else {
            // Comment text (inside %%)
            if (strip) {
              // Strip entirely — don't add any token
            } else {
              // Wrap in HTML comment
              const commentToken = new state.Token('html_inline', '', 0)
              commentToken.content = `<!-- ${part} -->`
              newChildren.push(commentToken)
            }
          }
        }
      }

      if (modified) {
        token.children = newChildren
        // Rebuild content from children
        token.content = newChildren
          .map((c: any) => c.content || '')
          .join('')
      }
    }
  })
}
