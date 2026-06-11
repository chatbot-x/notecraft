/**
 * codemirror-ext — All-in-one CodeMirror 6 extensions for markdown editing
 *
 * Combines and improves upon:
 * - codemirror-toolbar (yeliex) → Custom React toolbar with Lucide icons
 * - codemirror-markdown-commands (yeliex) → Enhanced toggle-aware markdown commands
 * - NEW: Slash commands via @codemirror/autocomplete
 *
 * Usage:
 * ```ts
 * import { toolbarPlugin, slashCommands, editorExtTheme } from '@/lib/codemirror-ext'
 * import { bold, italic, h1 } from '@/lib/codemirror-ext/commands'
 *
 * const extensions = [
 *   toolbarPlugin,
 *   slashCommands(),
 *   editorExtTheme,
 * ]
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
  // List factory
  createList,
} from './commands'

// Toolbar
export { Toolbar, defaultToolbarItems } from './toolbar/component'
export { toolbarPlugin, getToolbarContainer, executeToolbarCommand } from './toolbar/plugin'
export type { ToolbarItem, ToolbarItemConfig, ToolbarSeparator, ToolbarSpacer, ToolbarGroup } from './toolbar/types'

// Slash commands
export { slashCommands, registerSlashCommands } from './slash'
export type { SlashCommandOption } from './slash'

// Theme
export { editorExtTheme } from './theme'
