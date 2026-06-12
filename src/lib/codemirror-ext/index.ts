/**
 * codemirror-ext — All-in-one CodeMirror 6 extensions for markdown editing
 *
 * Combines and improves upon:
 * - codemirror-toolbar (yeliex) → Custom React toolbar with Lucide icons
 * - codemirror-markdown-commands (yeliex) → Enhanced toggle-aware markdown commands
 * - codemirror-markdown-image (yeliex) → Image upload with progress, drag-drop, paste
 * - codemirror-companion-extension (rizerphe) → Stabilized inline AI suggestions
 * - codemirror-final-newline (yeliex) → Configurable trailing newline
 * - NEW: Slash commands via @codemirror/autocomplete
 * - NEW: Heading slug utilities (heading anchor generation, panel removed)
 * - NEW: Hybrid render — Obsidian-style Live Preview decorations
 *
 * Usage:
 * ```ts
 * import { toolbarPlugin, slashCommands, editorExtTheme, imageUpload, inlineSuggestion, finalNewline, hybridRender } from '@/lib/codemirror-ext'
 * import { bold, italic, h1 } from '@/lib/codemirror-ext'
 * ```
 */

// Commands
export {
  // Inline formatting
  bold, italic, strikethrough, inlineCode, underline, highlight,
  // Headings
  h1, h2, h3, h4, h5, h6, createHeading,
  // Block formatting
  blockquote, unorderedList, orderedList, todoList,
  // Insert commands
  link, image, codeBlock, horizontalRule, table,
  // Document formatting
  formatDocument, createFormatCommand,
  // List factory
  createList,
  // Callout commands
  createCallout,
} from './commands'
export type { FormatDocumentOptions } from './commands'

// Toolbar
export { Toolbar, defaultToolbarItems } from './toolbar/component'
export { toolbarPlugin, getToolbarContainer, executeToolbarCommand } from './toolbar/plugin'
export type { ToolbarItem, ToolbarItemConfig, ToolbarSeparator, ToolbarSpacer, ToolbarGroup, ToolbarDropdown, ToolbarDropdownItem } from './toolbar/types'

// Slash commands
export { slashCommands, registerSlashCommands } from './slash'
export type { SlashCommandOption } from './slash'

// Theme
export { editorExtTheme } from './theme'

// Image upload
export { imageUpload, createImageUploadCommand, imageStatusLinter } from './image'
export type { ImageUploadOptions, UploadCallback, UploadActionParams } from './image'

// Inline suggestion
export { inlineSuggestion, forceableInlineSuggestion } from './inline-suggestion'
export type { InlineSuggestionOptions, Suggestion, ForceableInlineSuggestionResult } from './inline-suggestion'

// Slug utilities (heading anchor/slug generation — panel removed)
export {
  jumpToHeading,
  generateSlug, generateSlugWithSlugger, parseHeading, scanDocumentHeadings,
  getCurrentHeadingSlug,
} from './slug'

// Final newline
export { finalNewline } from './final-newline'
export type { FinalNewlineOptions } from './final-newline'

// Hybrid render (Obsidian-style Live Preview decorations)
export { hybridRender } from './hybrid-render'

// Lezer grammar extensions (Obsidian-flavored Markdown syntax tree nodes)
export { obsidianExtensions } from './lezer-extensions'
