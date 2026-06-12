/**
 * codemirror-ext: Inline Suggestion Module
 *
 * Provides GitHub Copilot-style inline ghost text suggestions.
 * Based on codemirror-companion-extension (rizerphe fork) with enhancements:
 * - Stabilized API with proper TypeScript types
 * - Configurable fetch function with debounce
 * - Tab to accept (customizable)
 * - Optional auto-continue after accepting
 * - Forceable trigger for programmatic suggestions
 *
 * NOTE: This is an editing assistance tool — no rendering engine.
 */

import { StateEffect, StateField, type Extension, Prec } from '@codemirror/state'
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view'
import type { EditorState } from '@codemirror/state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Suggestion {
  /** The text that gets inserted when the user accepts */
  complete_suggestion: string
  /** The text shown as ghost text (can differ from what's inserted) */
  display_suggestion: string
  /** Optional callback when suggestion is accepted */
  accept_hook?: () => void
}

export interface InlineSuggestionOptions {
  /** Async function that returns the suggestion text or Suggestion object */
  fetchFn: (state: EditorState) => Promise<string | Suggestion>
  /** Debounce delay in ms before fetching suggestion (default: 500) */
  delay?: number
  /** Auto-retrigger after accepting (default: false) */
  continue_suggesting?: boolean
  /** Key to accept suggestion (default: 'Tab'). Set to null to disable. */
  accept_shortcut?: string | null
}

// ─── State ─────────────────────────────────────────────────────────────────────

type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; suggestion: Suggestion; from: number }
  | { status: 'accepted' }

const setSuggestion = StateEffect.define<SuggestionState>()

const suggestionField = StateField.define<SuggestionState>({
  create: () => ({ status: 'idle' }),
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setSuggestion)) return effect.value
    }
    // Reset on document change (unless we just accepted)
    if (tr.docChanged && value.status === 'ready') {
      return { status: 'idle' }
    }
    return value
  },
})

// ─── Ghost Text Widget ─────────────────────────────────────────────────────────

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-inline-suggestion'
    span.textContent = this.text
    return span
  }

  ignoreEvent() { return true }
}

// ─── Decoration Plugin ─────────────────────────────────────────────────────────

const suggestionDecorator = ViewPlugin.fromClass(class implements PluginValue {
  decorations: DecorationSet

  constructor(readonly view: EditorView) {
    this.decorations = this.buildDecorations()
  }

  update(update: ViewUpdate) {
    if (update.state.field(suggestionField) !== update.startState.field(suggestionField) || update.docChanged) {
      this.decorations = this.buildDecorations()
    }
  }

  buildDecorations(): DecorationSet {
    const state = this.view.state.field(suggestionField)
    if (state.status !== 'ready') return Decoration.none

    const widget = Decoration.widget({
      widget: new GhostTextWidget(state.suggestion.display_suggestion),
      side: 1,
    })

    return Decoration.set([widget.range(state.from)])
  }
}, {
  decorations: v => v.decorations,
})

// ─── Fetch Plugin ──────────────────────────────────────────────────────────────

function createFetchPlugin(
  fetchFn: (state: EditorState) => Promise<string | Suggestion>,
  delay: number,
  continueSuggesting: boolean,
  forceFnRef: { current: (() => void) | null },
): Extension {
  const plugin = ViewPlugin.fromClass(class implements PluginValue {
    private destroyed = false
    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    constructor(readonly view: EditorView) {}

    update(update: ViewUpdate) {
      // Fetch on document change
      if (update.docChanged) {
        this.scheduleFetch()
      }
      // Re-trigger after accept if continue_suggesting is on
      if (update.transactions.some(tr => tr.effects.some(e => e.is(setSuggestion) && (e.value as SuggestionState).status === 'accepted'))) {
        if (continueSuggesting) {
          this.scheduleFetch()
        }
      }
    }

    scheduleFetch() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => this.fetch(), delay)
    }

    async fetch() {
      if (this.destroyed) return
      const state = this.view.state
      try {
        this.view.dispatch({ effects: setSuggestion.of({ status: 'loading' }) })
        const result = await fetchFn(state)
        if (this.destroyed) return

        let suggestion: Suggestion
        if (typeof result === 'string') {
          suggestion = { complete_suggestion: result, display_suggestion: result }
        } else {
          suggestion = result
        }

        if (!suggestion.complete_suggestion || !suggestion.display_suggestion) {
          this.view.dispatch({ effects: setSuggestion.of({ status: 'idle' }) })
          return
        }

        // Place suggestion at current cursor position
        const pos = this.view.state.selection.main.head
        this.view.dispatch({ effects: setSuggestion.of({ status: 'ready', suggestion, from: pos }) })
      } catch {
        this.view.dispatch({ effects: setSuggestion.of({ status: 'idle' }) })
      }
    }

    destroy() {
      this.destroyed = true
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
    }
  })

  // Expose force_fetch
  forceFnRef.current = () => {
    const view = (plugin as any).value?.view
    if (view) {
      const fetch = (view as any).plugin(plugin)
      if (fetch) (fetch as any).fetch()
    }
  }

  return plugin
}

// ─── Accept Keymap ─────────────────────────────────────────────────────────────

function createAcceptKeymap(acceptShortcut: string | null): Extension {
  if (acceptShortcut === null) return []

  const key = acceptShortcut || 'Tab'

  return Prec.highest(keymap.of([{
    key,
    run(view: EditorView): boolean {
      const state = view.state.field(suggestionField)
      if (state.status !== 'ready') return false

      // Insert the suggestion text
      view.dispatch({
        changes: { from: state.from, insert: state.suggestion.complete_suggestion },
        selection: { anchor: state.from + state.suggestion.complete_suggestion.length },
        effects: setSuggestion.of({ status: 'accepted' }),
      })

      // Call accept hook if provided
      state.suggestion.accept_hook?.()

      return true
    },
  }]))
}

// ─── Dismiss on Escape ─────────────────────────────────────────────────────────

const dismissKeymap = keymap.of([{
  key: 'Escape',
  run(view: EditorView): boolean {
    const state = view.state.field(suggestionField)
    if (state.status === 'ready' || state.status === 'loading') {
      view.dispatch({ effects: setSuggestion.of({ status: 'idle' }) })
      return true
    }
    return false
  },
}])

// ─── Styles ────────────────────────────────────────────────────────────────────

const suggestionStyles = EditorView.baseTheme({
  '.cm-inline-suggestion': {
    opacity: '0.4',
    pointerEvents: 'none',
  },
})

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an inline suggestion extension for CodeMirror 6.
 *
 * Usage:
 * ```ts
 * import { inlineSuggestion } from '@/lib/codemirror-ext'
 *
 * const extensions = [
 *   inlineSuggestion({
 *     fetchFn: async (state) => {
 *       const text = state.doc.toString()
 *       const suggestion = await callAI(text)
 *       return suggestion
 *     },
 *     delay: 500,
 *     continue_suggesting: true,
 *   }),
 * ]
 * ```
 */
export function inlineSuggestion(options: InlineSuggestionOptions): Extension[] {
  const {
    fetchFn,
    delay = 500,
    continue_suggesting = false,
    accept_shortcut = 'Tab',
  } = options

  const forceFnRef: { current: (() => void) | null } = { current: null }

  return [
    suggestionField,
    suggestionDecorator,
    createFetchPlugin(fetchFn, delay, continue_suggesting, forceFnRef),
    createAcceptKeymap(accept_shortcut),
    dismissKeymap,
    suggestionStyles,
  ]
}


