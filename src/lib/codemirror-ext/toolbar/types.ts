/**
 * codemirror-ext: Toolbar Types
 */
import type { Command } from '@codemirror/view'

export interface ToolbarItem {
  /** Unique key for the item */
  key: string
  /** Display label (used as tooltip) */
  label: string
  /** Icon element (React node) */
  icon: React.ReactNode
  /** CodeMirror command to execute */
  command: Command
  /** Keyboard shortcut hint */
  shortcut?: string
  /** Whether the item is active (for toggle buttons) */
  active?: (view: { state: { selection: { main: { from: number; to: number } }; doc: { lineAt: (pos: number) => { text: string } }; sliceDoc: (from: number, to: number) => string } }) => boolean
}

export interface ToolbarSeparator {
  type: 'separator'
}

export interface ToolbarSpacer {
  type: 'spacer'
}

export interface ToolbarGroup {
  type: 'group'
  label?: string
  items: ToolbarItemConfig[]
}

export type ToolbarItemConfig = ToolbarItem | ToolbarSeparator | ToolbarSpacer | ToolbarGroup
