// Type declarations for markdown-it plugins without @types
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithOptions<{
    enabled?: boolean
    label?: boolean
    lineNumber?: boolean
  }>
  export default plugin
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-attrs' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it'
  export const full: MarkdownIt.PluginSimple
  export const light: MarkdownIt.PluginSimple
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-front-matter' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithParams<(raw: string) => void>
  export default plugin
}

declare module '@traptitech/markdown-it-katex' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginWithOptions<{
    throwOnError?: boolean
    output?: string
  }>
  export default plugin
}

declare module 'codemirror-markdown-tables' {
  import type { Extension } from '@codemirror/state'
  import type { CompletionSource } from '@codemirror/autocomplete'
  export function markdownTables(options?: { theme?: { light: number; dark: number } }): Extension
  export function markdownTableAutocompleter(): CompletionSource
  export const TableTheme: { githubLight: number; githubDark: number }
  export function insertEmptyMarkdownTable(): Extension
}

declare module 'codemirror-lang-mermaid' {
  import type { LanguageSupport } from '@codemirror/language'
  export function mermaid(): LanguageSupport
}

declare module 'medium-zoom' {
  interface ZoomOptions {
    background?: string
    margin?: number
    template?: (svg: SVGElement) => SVGElement
  }
  interface Zoom {
    attach(...elements: HTMLElement[]): Zoom
    detach(...elements: HTMLElement[]): Zoom
    open(target?: HTMLElement): Zoom
    close(): Zoom
    toggle(target?: HTMLElement): Zoom
    update(): Zoom
    clone(options?: ZoomOptions): Zoom
    on(type: string, callback: (event: { zoom: { target: HTMLElement } }) => void): Zoom
    off(type: string, callback: (event: { zoom: { target: HTMLElement } }) => void): Zoom
  }
  export default function mediumZoom(selector: string | HTMLElement[] | NodeList, options?: ZoomOptions): Zoom
  export type { Zoom, ZoomOptions }
}

declare module 'dompurify' {
  interface Config {
    ALLOWED_TAGS?: string[]
    ALLOWED_ATTR?: string[]
    ADD_ATTR?: string[]
    ADD_TAGS?: string[]
    ADD_DATA_URI_TAGS?: string[]
  }
  const purify: {
    sanitize(source: string, config?: Config): string
  }
  export default purify
}
