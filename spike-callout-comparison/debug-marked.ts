import { Marked, type TokenizerAndRendererExtension } from 'marked'

// Minimal debug extension
const debugExt: TokenizerAndRendererExtension = {
  name: 'callout',
  level: 'block',
  start(src: string) {
    const idx = src.match(/^>[ \t]+\[!/m)?.index
    console.log('  [start] src starts with:', JSON.stringify(src.slice(0, 80)), '→ index:', idx)
    return idx
  },
  tokenizer(this: any, src: string): any {
    console.log('  [tokenizer] src starts with:', JSON.stringify(src.slice(0, 80)))

    // Try different regex approaches
    const r1 = /^>[ \t]+\[!([^\]]+)\]/.exec(src)
    console.log('  [regex1] /^>[ \\t]+\\[!/ match:', r1 ? r1[0] : null)

    const r2 = /^>[ \t]+\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/m.exec(src)
    console.log('  [regex2] with m flag:', r2 ? r2[0] : null)

    const r3 = /^>[ \t]+\[!([^\]]+)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/.exec(src)
    console.log('  [regex3] without m flag:', r3 ? r3[0] : null)

    // Try simple match
    if (src.startsWith('> [!')) {
      console.log('  [direct] src starts with "> [!"')
      const match = src.match(/^> \[!(\w+)\](\+|-)?(?:[ \t]+(.*?))?\n/)
      console.log('  [direct regex]:', match ? match[0] : null)
    }

    return undefined // Let other tokenizers handle it for now
  },
}

const marked = new Marked()
marked.use({ gfm: true, extensions: [debugExt] })

console.log('Input: > [!note] Hello World\n> This is the body\n')
const result = marked.parse('> [!note] Hello World\n> This is the body')
console.log('\nResult:', result)
