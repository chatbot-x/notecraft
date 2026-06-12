/**
 * codemirror-ext: Toolbar Plugin
 *
 * A CodeMirror 6 ViewPlugin that renders a toolbar above the editor.
 * Unlike yeliex's DOM-only approach, this exposes the editor view
 * so a React component can interact with it for richer UI.
 */
'use client'

import { EditorView, type PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view'

/**
 * The toolbar plugin stores a reference to the EditorView
 * and creates a container element above the editor.
 */
class ToolbarPlugin implements PluginValue {
  readonly container: HTMLDivElement

  constructor(readonly view: EditorView) {
    this.container = document.createElement('div')
    this.container.className = 'cm-toolbar-container'
    this.container.setAttribute('role', 'toolbar')
    this.container.setAttribute('aria-label', 'Formatting toolbar')
    this.view.dom.prepend(this.container)
  }

  update(_update: ViewUpdate) {
    // Dispatch custom event so React can re-read active states
    this.container.dispatchEvent(new CustomEvent('cm-toolbar-update'))
  }

  destroy() {
    this.container.remove()
  }
}

export const toolbarPlugin = ViewPlugin.define((view) => new ToolbarPlugin(view))

/**
 * Get the toolbar container element from a CodeMirror editor view.
 */
export function getToolbarContainer(view: EditorView): HTMLDivElement | null {
  const plugin = view.plugin(toolbarPlugin)
  return plugin?.container ?? null
}
