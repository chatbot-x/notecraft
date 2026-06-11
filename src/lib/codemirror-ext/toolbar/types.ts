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

export interface ToolbarDropdownItem {
  /** Unique key for the dropdown sub-item */
  key: string
  /** Display label */
  label: string
  /** Icon or emoji shown beside the label */
  icon?: React.ReactNode
  /** CodeMirror command to execute when selected */
  command: Command
  /** Optional description shown as muted text */
  description?: string
}

export interface ToolbarDropdown {
  type: 'dropdown'
  /** Unique key for the dropdown */
  key: string
  /** Display label (used as tooltip on the trigger button) */
  label: string
  /** Icon element for the trigger button */
  icon: React.ReactNode
  /** Items in the dropdown menu */
  items: ToolbarDropdownItem[]
}

export type ToolbarItemConfig = ToolbarItem | ToolbarSeparator | ToolbarSpacer | ToolbarGroup | ToolbarDropdown
