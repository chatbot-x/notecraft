/**
 * Custom markdown-it plugin for Obsidian-style block references.
 *
 * Supports two features:
 *
 * 1. Block ID definition: A paragraph ending with ^block-id defines a block ID.
 *    In Obsidian, this looks like:
 *      This is a paragraph with some content.
 *      ^abc123
 *
 *    The ^block-id is stripped from visible output, and the paragraph gets
 *    a data-block-id attribute for anchor linking.
 *
 * 2. The rendering of ![[note#^block-id]] references is handled by the
 *    embed-plugin.ts — this plugin only handles the definition side.
 *
 * Backport reference:
 *   - @heavycircle/remark-obsidian: block reference syntax
 *   - Obsidian help docs: https://help.obsidian.md/Linking_notes_and_files/Internal_links#Link_to_a_block_in_a_note
 */

import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

export interface BlockRefPluginOptions {
  /** CSS class for the block reference indicator. Default: "block-ref-id" */
  indicatorClass?: string
  /** Whether to show a small indicator for the block ID. Default: true */
  showIndicator?: boolean
}

// Block ID pattern: ^ followed by word characters (letters, digits, hyphens, underscores)
// Must be at the end of a line/paragraph, optionally preceded by a newline
const BLOCK_ID_RE = /\n?\^([a-zA-Z0-9_-]+)\s*$/

// Standalone block ID (the entire paragraph is just ^block-id)
const STANDALONE_BLOCK_ID_RE = /^\^([a-zA-Z0-9_-]+)\s*$/

export default function blockRefPlugin(md: MarkdownIt, opts: BlockRefPluginOptions = {}): void {
  const indicatorClass = opts.indicatorClass ?? 'block-ref-id'
  const showIndicator = opts.showIndicator ?? true

  md.core.ruler.after('inline', 'block_refs', (state: StateCore) => {
    const tokens = state.tokens

    for (let i = 0; i < tokens.length; i++) {
      // Look for paragraph_open tokens
      if (tokens[i].type !== 'paragraph_open') continue

      // Find the matching paragraph_close
      let closeIdx = -1
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'paragraph_close') {
          closeIdx = j
          break
        }
      }
      if (closeIdx === -1) continue

      // Find the inline token inside the paragraph
      let inlineIdx = -1
      for (let j = i + 1; j < closeIdx; j++) {
        if (tokens[j].type === 'inline') {
          inlineIdx = j
          break
        }
      }
      if (inlineIdx === -1) continue

      const inlineToken = tokens[inlineIdx]
      const content = inlineToken.content

      // Check for block ID at the end of the content
      const match = content.match(BLOCK_ID_RE)
      if (!match) continue

      const blockId = match[1]

      // Add data-block-id attribute to the paragraph_open token
      tokens[i].attrPush(['data-block-id', blockId])

      // Check if this is a standalone block ID (^block-id on its own line)
      const isStandalone = STANDALONE_BLOCK_ID_RE.test(content.trim())

      if (isStandalone) {
        // Remove the entire paragraph (it's just a block ID marker)
        // But keep the paragraph with the attribute for the PREVIOUS paragraph
        // In Obsidian, ^block-id on its own line attaches to the preceding block
        // So we need to find the preceding block and move the attribute there

        // Remove the standalone block-id paragraph
        tokens.splice(i, closeIdx - i + 1)

        // Find the preceding block-level token
        for (let k = i - 1; k >= 0; k--) {
          const prevToken = tokens[k]
          if (
            prevToken.type === 'paragraph_open' ||
            prevToken.type === 'heading_open' ||
            prevToken.type === 'blockquote_open' ||
            prevToken.type === 'list_item_open' ||
            prevToken.type === 'bullet_list_open' ||
            prevToken.type === 'ordered_list_open'
          ) {
            // Add the block ID to the preceding block
            prevToken.attrPush(['data-block-id', blockId])

            // Optionally show a small indicator
            if (showIndicator) {
              // Find the inline token in the preceding block
              for (let m = k + 1; m < tokens.length; m++) {
                if (tokens[m].type === 'inline' && tokens[m].children) {
                  // Add indicator at the end of the inline content
                  const indicator = new state.Token('block_ref_indicator', 'span', 1)
                  indicator.attrPush(['class', indicatorClass])
                  indicator.attrPush(['data-block-id', blockId])

                  const indicatorText = new state.Token('text', '', 0)
                  indicatorText.content = ` ^${blockId}`

                  const indicatorClose = new state.Token('block_ref_indicator_close', 'span', -1)

                  tokens[m].children!.push(indicator, indicatorText, indicatorClose)
                  break
                }
                if (tokens[m].type === 'paragraph_close' || tokens[m].type === 'heading_close') break
              }
            }

            break
          }
        }

        // Adjust index since we removed tokens
        i--
        continue
      }

      // Non-standalone: the block ID is at the end of a paragraph with other content
      // Strip the ^block-id from the visible content
      const markerText = match[0]

      // Update inline content
      inlineToken.content = content.slice(0, content.length - markerText.length)

      // Strip from text children
      if (inlineToken.children) {
        // Work backwards through children to remove the block ID
        let remaining = markerText
        for (let c = inlineToken.children.length - 1; c >= 0 && remaining.length > 0; c--) {
          const child = inlineToken.children[c]
          if (child.type === 'text') {
            if (child.content.endsWith(remaining)) {
              child.content = child.content.slice(0, child.content.length - remaining.length)
              remaining = ''
            } else if (remaining.includes(child.content)) {
              // The child content is part of the marker
              remaining = remaining.slice(child.content.length)
              child.content = ''
            }
          } else if (child.type === 'softbreak' && remaining.startsWith('\n')) {
            remaining = remaining.slice(1)
          }
        }

        // Clean up empty text children
        inlineToken.children = inlineToken.children.filter(
          (c: any) => !(c.type === 'text' && c.content === '')
        )
      }

      // Optionally add a small indicator
      if (showIndicator && inlineToken.children) {
        const indicator = new state.Token('block_ref_indicator', 'span', 1)
        indicator.attrPush(['class', indicatorClass])
        indicator.attrPush(['data-block-id', blockId])

        const indicatorText = new state.Token('text', '', 0)
        indicatorText.content = ` ^${blockId}`

        const indicatorClose = new state.Token('block_ref_indicator_close', 'span', -1)

        inlineToken.children.push(indicator, indicatorText, indicatorClose)
      }
    }
  })

  // Register renderers for custom token types
  md.renderer.rules['block_ref_indicator'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules['block_ref_indicator_close'] = function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }
}
