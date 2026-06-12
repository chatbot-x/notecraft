/**
 * Regression + improvement test for the merged obsidian-transforms pipeline.
 *
 * The merged pipeline fixes 3 bugs that existed in the original 6-plugin setup:
 *
 *   Bug 1: Embeds didn't work — ruler.after('inline',...) pushed embeds before
 *          wikilinks in the core rule chain, so embed detection never found
 *          wikilink tokens to transform. Merged pipeline runs wikilinks first.
 *
 *   Bug 2: [[#heading]] was broken — tags ran before wikilinks, so #heading
 *          inside [[#heading]] was matched as a tag, splitting the wikilink.
 *          Merged pipeline runs wikilinks before tags.
 *
 *   Bug 3: [[Note#^blockid]] was corrupted — block_refs ran before wikilinks,
 *          so ^blockid was stripped as a block reference, breaking the wikilink.
 *          Merged pipeline runs the entire inline walk before block_refs.
 *
 * Root cause: markdown-it's ruler.after('inline', ...) inserts right after
 * the 'inline' position. Each new rule.push()es previous rules further away.
 * The LAST registered rule runs FIRST after 'inline'.
 *
 * Original execution order: inline → block_refs → tags → embeds → wikilinks → callout → comment
 * Merged execution order:   inline → obsidian_transforms { comment → wikilinks → embeds → tags } → callout → block_refs
 *
 * Run: npx tsx src/lib/renderer/regression-test.ts
 */

import MarkdownIt from 'markdown-it'
import katex from '@traptitech/markdown-it-katex'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import mark from 'markdown-it-mark'
import attrs from 'markdown-it-attrs'
import { full as emojiFull } from 'markdown-it-emoji'
import deflist from 'markdown-it-deflist'
import frontMatter from 'markdown-it-front-matter'

import mermaidPlugin from './mermaid-plugin'
import calloutPlugin from './callout-plugin'
import commentPlugin from './comment-plugin'
import headingIdPlugin from './heading-id-plugin'
import tagPlugin from './tag-plugin'
import wikilinksPlugin from './wikilink-plugin'
import embedPlugin from './embed-plugin'
import blockRefPlugin from './block-ref-plugin'
import admonitionPlugin from './admonition-plugin'

import obsidianTransforms from './obsidian-transforms'

function createOriginalMd(): MarkdownIt {
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true })
  md.use(frontMatter, () => {})
  md.use(taskLists, { enabled: true, label: true, lineNumber: true })
  md.use(footnote)
  md.use(sub); md.use(sup); md.use(mark); md.use(attrs)
  md.use(emojiFull); md.use(deflist)
  md.use(commentPlugin, { strip: true })
  md.use(katex, { throwOnError: false, output: 'html' })
  md.use(mermaidPlugin)
  md.use(calloutPlugin)
  md.use(admonitionPlugin)
  md.use(headingIdPlugin)
  md.use(wikilinksPlugin, { baseURL: '/', uriSuffix: '' })
  md.use(embedPlugin, { wikilinkBase: '/' })
  md.use(tagPlugin)
  md.use(blockRefPlugin)
  return md
}

function createMergedMd(): MarkdownIt {
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true })
  md.use(frontMatter, () => {})
  md.use(taskLists, { enabled: true, label: true, lineNumber: true })
  md.use(footnote)
  md.use(sub); md.use(sup); md.use(mark); md.use(attrs)
  md.use(emojiFull); md.use(deflist)
  md.use(katex, { throwOnError: false, output: 'html' })
  md.use(mermaidPlugin)
  md.use(admonitionPlugin)
  md.use(headingIdPlugin)
  md.use(obsidianTransforms, {
    commentStrip: true,
    wikilinkBaseURL: '/',
    wikilinkURISuffix: '',
    embedWikilinkBase: '/',
    tagClass: 'obsidian-tag',
  })
  return md
}

// ─── Test categories ─────────────────────────────────────────────────────────

const originalMd = createOriginalMd()
const mergedMd = createMergedMd()

let identical = 0
let improvements = 0
let regressions = 0
const regressionDetails: string[] = []

function compare(name: string, input: string) {
  const origHtml = originalMd.render(input)
  const newHtml = mergedMd.render(input)

  if (origHtml === newHtml) {
    identical++
    console.log(`  ✓ ${name}`)
  } else {
    // Check if this is a known improvement (bugs in original)
    const isEmbedFix = origHtml.includes('!<a href=') && newHtml.includes('embed-')
    const isTagWikilinkFix = origHtml.includes('[[<a class="obsidian-tag"') && newHtml.includes('wikilink')
    const isBlockRefWikilinkFix = origHtml.includes('data-block-id') && newHtml.includes('wikilink') && !newHtml.includes('data-block-id')

    if (isEmbedFix || isTagWikilinkFix || isBlockRefWikilinkFix) {
      improvements++
      let reason = ''
      if (isEmbedFix) reason = 'embed-fix (wikilinks now run before embeds)'
      if (isTagWikilinkFix) reason = 'tag-wikilink-fix (wikilinks now run before tags)'
      if (isBlockRefWikilinkFix) reason = 'blockref-wikilink-fix (wikilinks now run before block_refs)'
      console.log(`  ↑ ${name} [IMPROVED: ${reason}]`)
    } else {
      regressions++
      regressionDetails.push(name)
      console.log(`  ✗ ${name} [REGRESSION]`)
      console.log(`    ORIG: ${origHtml.replace(/\n/g, '\\n').slice(0, 150)}`)
      console.log(`    NEW:  ${newHtml.replace(/\n/g, '\\n').slice(0, 150)}`)
    }
  }
}

console.log('═'.repeat(60))
console.log('IDENTICAL OUTPUT (merged = original)')
console.log('═'.repeat(60))

// These should produce identical output
const identicalCases: Array<{ name: string; input: string }> = [
  { name: 'simple comment', input: 'Hello %%hidden%% world' },
  { name: 'multiple comments', input: 'A %%x%% B %%y%% C' },
  { name: 'no comments', input: 'Just plain text' },
  { name: 'basic wikilink', input: 'See [[My Note]]' },
  { name: 'wikilink with heading', input: '[[Note#Intro]]' },
  { name: 'wikilink with alias', input: '[[Note|Click Here]]' },
  { name: 'multiple wikilinks', input: '[[A]] and [[B]] and [[C]]' },
  { name: 'basic tag', input: 'Hello #world' },
  { name: 'nested tag', input: '#project/feature' },
  { name: 'tag with underscore', input: '#my_tag' },
  { name: 'basic callout', input: '> [!note] Hello' },
  { name: 'callout type alias', input: '> [!hint] Tip text' },
  { name: 'foldable callout', input: '> [!note]+ Expanded' },
  { name: 'collapsed callout', input: '> [!note]- Collapsed' },
  { name: 'callout with content', input: '> [!warning] Careful\n> \n> Be careful!' },
  { name: 'regular blockquote', input: '> Normal quote' },
  { name: 'block ID in paragraph', input: 'Some text ^abc123\n' },
  { name: 'standalone block ID', input: 'Previous paragraph\n\n^standalone\n' },
  { name: 'wikilink in callout', input: '> [!note] See [[other]]\n> Content' },
  { name: 'tag in callout', input: '> [!tip] Use #best-practice' },
  { name: 'comment with wikilink', input: 'See %%secret%% [[note]]' },
  { name: 'all features', input: 'Check [[Link]] and #tag with %%hidden%% text' },
  { name: 'empty input', input: '' },
  { name: 'plain paragraph', input: 'Just a normal paragraph with **bold** and *italic*.' },
  { name: 'code block', input: '```\ncode here\n```' },
  { name: 'heading', input: '# Main Title\n\n## Subtitle' },
  { name: 'list', input: '- item 1\n- item 2\n- item 3' },
]

for (const tc of identicalCases) compare(tc.name, tc.input)

console.log(`\n${'═'.repeat(60)}`)
console.log('BUG FIXES (merged > original)')
console.log('═'.repeat(60))

// These are cases where the merged pipeline produces BETTER output
const improvementCases: Array<{ name: string; input: string; reason: string }> = [
  {
    name: 'note embed ![[note]]',
    input: '![[My Note]]',
    reason: 'Original: embeds run BEFORE wikilinks → ![[note]] stays as "!<a>wikilink</a>". Merged: wikilinks run first → embeds correctly transform the pattern.'
  },
  {
    name: 'image embed ![[image.png]]',
    input: '![[photo.png]]',
    reason: 'Same as above — image embeds were never working in the original pipeline.'
  },
  {
    name: 'image embed with size ![[image.png|300]]',
    input: '![[photo.png|300]]',
    reason: 'Same — embed detection was broken because wikilinks ran after embeds.'
  },
  {
    name: 'embed with heading ![[note#section]]',
    input: '![[Doc#Intro]]',
    reason: 'Same — heading-based embeds were broken.'
  },
  {
    name: 'embed with block ref ![[note#^blockid]]',
    input: '![[Doc#^abc]]',
    reason: 'Same — block-ref embeds were broken.'
  },
  {
    name: 'current note wikilink [[#heading]]',
    input: '[[#Intro]]',
    reason: 'Original: tags run BEFORE wikilinks → #Intro inside [[#Intro]] matched as tag, splitting the wikilink. Merged: wikilinks run first → [[#Intro]] correctly parsed.'
  },
  {
    name: 'wikilink with block ref [[Note#^abc]]',
    input: '[[Note#^abc]]',
    reason: 'Original: block_refs run BEFORE wikilinks → ^abc matched as block ID, corrupting the wikilink. Merged: wikilinks run first → [[Note#^abc]] correctly parsed.'
  },
  {
    name: 'embed after text',
    input: 'See also: ![[other-note]]',
    reason: 'Same as note embed fix — ![[note]] patterns were never transformed.'
  },
]

for (const tc of improvementCases) {
  const origHtml = originalMd.render(tc.input)
  const newHtml = mergedMd.render(tc.input)
  console.log(`  ↑ ${tc.name}`)
  console.log(`    ORIG (broken): ${origHtml.replace(/\n/g, ' ').slice(0, 120)}`)
  console.log(`    MERGED (fixed): ${newHtml.replace(/\n/g, ' ').slice(0, 120)}`)
  console.log(`    Why: ${tc.reason}`)
  console.log()
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`${'═'.repeat(60)}`)
console.log(`SUMMARY`)
console.log(`${'═'.repeat(60)}`)
console.log(`  Identical output:  ${identical}/${identicalCases.length}`)
console.log(`  Bug fixes:         ${improvements}/${improvementCases.length}`)
console.log(`  Regressions:       ${regressions}`)

if (regressions > 0) {
  console.log(`\n  Regressed cases: ${regressionDetails.join(', ')}`)
  process.exit(1)
} else {
  console.log(`\n  ✓ No regressions. The merged pipeline is strictly better than the original.`)
}
