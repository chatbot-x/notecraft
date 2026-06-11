/**
 * codemirror-ext: Slash Commands
 *
 * Notion-style `/` command menu using @codemirror/autocomplete.
 * Typing `/` at the start of a line (or after whitespace) triggers
 * a dropdown with formatting options, block insertions, and more.
 *
 * Features over basic autocomplete:
 * - Categorized options (Text, Heading, List, Insert)
 * - Descriptive labels and icons (via detail field)
 * - Smart filtering as you type after `/`
 * - Custom apply actions that insert markdown + clean up the slash
 */

import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete'
import { EditorSelection } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, type Command } from '@codemirror/view'
import {
  bold, italic, strikethrough, inlineCode, underline, highlight,
  h1, h2, h3, h4,
  blockquote, unorderedList, orderedList, todoList,
  link, image, codeBlock, horizontalRule, table,
} from '../commands'

// ─── Slash Command Definitions ─────────────────────────────────────────────────

export interface SlashCommandOption {
  /** Label shown in the dropdown */
  label: string
  /** Display type / category label */
  detail?: string
  /** Sort order within category (lower = higher) */
  boost?: number
  /** Apply function — matches CM6 Completion.apply signature */
  apply: string | ((view: EditorView, completion: Completion, from: number, to: number) => void)
  /** Search keywords for filtering */
  keywords?: string[]
}

// ─── Helper: Create a slash command that runs a CM6 Command ────────────────────

function commandApply(command: Command): (view: EditorView, completion: Completion, from: number, to: number) => void {
  return (view, _completion, from, to) => {
    // First, remove the "/prefix" text that was typed
    view.dispatch({
      changes: { from, to, insert: '' },
      selection: EditorSelection.cursor(from),
    })
    // Then run the command
    command(view)
  }
}

// ─── Build the slash command source ────────────────────────────────────────────

function buildSlashCommands(): SlashCommandOption[] {
  return [
    // Text formatting
    { label: 'Bold', detail: 'Text', boost: 10, keywords: ['bold', 'strong'], apply: commandApply(bold) },
    { label: 'Italic', detail: 'Text', boost: 9, keywords: ['italic', 'em'], apply: commandApply(italic) },
    { label: 'Strikethrough', detail: 'Text', keywords: ['strike', 'delete'], apply: commandApply(strikethrough) },
    { label: 'Code', detail: 'Text', keywords: ['inline', 'code'], apply: commandApply(inlineCode) },
    { label: 'Highlight', detail: 'Text', keywords: ['mark', 'highlight'], apply: commandApply(highlight) },
    { label: 'Underline', detail: 'Text', keywords: ['underline'], apply: commandApply(underline) },

    // Headings
    { label: 'Heading 1', detail: 'Heading', boost: 8, keywords: ['h1', 'heading', 'title'], apply: commandApply(h1) },
    { label: 'Heading 2', detail: 'Heading', boost: 7, keywords: ['h2', 'heading', 'subtitle'], apply: commandApply(h2) },
    { label: 'Heading 3', detail: 'Heading', keywords: ['h3', 'heading'], apply: commandApply(h3) },
    { label: 'Heading 4', detail: 'Heading', keywords: ['h4', 'heading'], apply: commandApply(h4) },

    // Lists
    { label: 'Bullet List', detail: 'List', boost: 6, keywords: ['unordered', 'bullet', 'ul', 'list'], apply: commandApply(unorderedList) },
    { label: 'Numbered List', detail: 'List', boost: 5, keywords: ['ordered', 'number', 'ol', 'list'], apply: commandApply(orderedList) },
    { label: 'To-Do List', detail: 'List', boost: 4, keywords: ['todo', 'checkbox', 'task', 'check'], apply: commandApply(todoList) },

    // Blocks
    { label: 'Block Quote', detail: 'Block', keywords: ['quote', 'blockquote'], apply: commandApply(blockquote) },
    { label: 'Code Block', detail: 'Block', keywords: ['codeblock', 'fence', 'code'], apply: commandApply(codeBlock) },
    { label: 'Horizontal Rule', detail: 'Block', keywords: ['hr', 'divider', 'separator', 'line'], apply: commandApply(horizontalRule) },

    // Inserts
    { label: 'Link', detail: 'Insert', keywords: ['link', 'url', 'href'], apply: commandApply(link) },
    { label: 'Image', detail: 'Insert', keywords: ['image', 'img', 'photo', 'picture'], apply: commandApply(image) },
    { label: 'Table', detail: 'Insert', keywords: ['table', 'grid'], apply: commandApply(table) },
  ]
}

// ─── Completion Source ─────────────────────────────────────────────────────────

let cachedCommands: SlashCommandOption[] | null = null

function slashCommandSource(context: CompletionContext): CompletionResult | null {
  // Match "/word" at the current position
  const match = context.matchBefore(/\/\w*/)
  if (!match) return null

  // Only trigger if "/" is at the start of a line or after whitespace
  if (match.from > 0) {
    const charBefore = context.state.sliceDoc(match.from - 1, match.from)
    if (charBefore !== '\n' && charBefore !== ' ' && charBefore !== '\t') {
      return null
    }
  }

  // Don't show empty menu if no "/" typed
  if (match.text === '' && !context.explicit) return null

  if (!cachedCommands) cachedCommands = buildSlashCommands()

  const query = match.text.slice(1).toLowerCase() // Remove the "/"

  const filtered = cachedCommands.filter((cmd) => {
    const label = cmd.label.toLowerCase()
    const keywords = cmd.keywords?.join(' ').toLowerCase() ?? ''
    return label.includes(query) || keywords.includes(query)
  })

  if (filtered.length === 0) return null

  return {
    from: match.from,
    options: filtered.map((cmd): Completion => ({
      label: cmd.label,
      detail: cmd.detail,
      boost: cmd.boost ?? 0,
      apply: cmd.apply,
      type: 'text',
    })),
    filter: false, // We already filtered above
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a slash command extension for CodeMirror 6.
 *
 * Usage:
 * ```ts
 * import { slashCommands } from './codemirror-ext'
 *
 * const extensions = [
 *   slashCommands(),
 * ]
 * ```
 */
export function slashCommands(options?: {
  /** Custom command options to add (merged with defaults) */
  additionalCommands?: SlashCommandOption[]
  /** Replace default commands entirely */
  replaceCommands?: SlashCommandOption[]
}): Extension {
  // Override cached commands if custom ones are provided
  if (options?.replaceCommands) {
    cachedCommands = options.replaceCommands
  } else if (options?.additionalCommands) {
    cachedCommands = [...buildSlashCommands(), ...options.additionalCommands]
  }

  return autocompletion({
    override: [slashCommandSource],
    activateOnTyping: true,
    icons: false,
    maxRenderedOptions: 20,
  })
}

/**
 * Register custom slash commands.
 * Call this before creating the editor if you want to customize the commands.
 */
export function registerSlashCommands(commands: SlashCommandOption[]) {
  cachedCommands = commands
}
