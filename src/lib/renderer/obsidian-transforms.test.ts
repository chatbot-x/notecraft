/**
 * Integration test for the obsidian-transforms pipeline.
 *
 * Tests the merged obsidian_transforms core rule that handles:
 *   Comments, Embeds, Tags, Callouts, Block References
 *
 * Run: npx tsx src/lib/renderer/obsidian-transforms.test.ts
 */

import MarkdownIt from 'markdown-it'

// ─── Test the merged pipeline directly ──────────────────────────────────────

import obsidianTransforms from './obsidian-transforms'

function createMd(opts: Record<string, any> = {}): MarkdownIt {
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true })
  md.use(obsidianTransforms, opts)
  return md
}

// ─── Test helpers ────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name: string, md: MarkdownIt, input: string, check: (html: string) => boolean) {
  const html = md.render(input)
  if (check(html)) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`    Input:    ${JSON.stringify(input)}`)
    console.log(`    Output:   ${html.replace(/\n/g, '\\n')}`)
  }
}

function testGroup(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const md = createMd()
const mdNoComments = createMd({ features: { comments: false } })
const mdNoTags = createMd({ features: { tags: false } })
const mdNoCallouts = createMd({ features: { callouts: false } })
const mdNoBlockRefs = createMd({ features: { blockRefs: false } })

testGroup('Comment Plugin', () => {
  test('strips %%comment%%', md, 'Hello %%hidden%% world', html =>
    html.includes('Hello') && html.includes('world') && !html.includes('hidden')
  )
  test('strips multiple %%comments%%', md, 'A %%x%% B %%y%% C', html =>
    html.includes('A') && html.includes('B') && html.includes('C') && !html.includes('x') && !html.includes('y')
  )
  test('preserves text without comments', md, 'No comments here', html =>
    html.includes('No comments here')
  )
  test('feature flag disables comment stripping', mdNoComments, 'Hello %%hidden%% world', html =>
    html.includes('%%hidden%%')
  )
})

testGroup('Embed Plugin', () => {
  test('note embed ![[note]]', md, '![[My Note]]', html =>
    html.includes('data-embed-src="My Note"') && html.includes('embed-note')
  )
  test('image embed ![[image.png]]', md, '![[photo.png]]', html =>
    html.includes('embed-image') && html.includes('src=')
  )
  test('image embed with size ![[image.png|300]]', md, '![[photo.png|300]]', html =>
    html.includes('width="300"')
  )
  test('embed with heading ![[note#section]]', md, '![[Doc#Intro]]', html =>
    html.includes('data-embed-heading="Intro"')
  )
  test('embed with block ref ![[note#^blockid]]', md, '![[Doc#^abc]]', html =>
    html.includes('data-embed-block="abc"')
  )
  test('embeds are standalone (no wikilink dependency)', md, '![[My Note]]', html =>
    html.includes('data-embed-src="My Note"') && html.includes('embed-note')
  )
})

testGroup('Tag Plugin', () => {
  test('basic tag #tag', md, 'Hello #world', html =>
    html.includes('class="obsidian-tag"') && html.includes('data-tag="world"')
  )
  test('nested tag #nested/tag', md, '#project/feature', html =>
    html.includes('data-tag="project/feature"')
  )
  test('tag with underscore #tag_name', md, '#my_tag', html =>
    html.includes('data-tag="my_tag"')
  )
  test('heading # is NOT a tag', md, '# Heading', html =>
    !html.includes('obsidian-tag')
  )
  test('tag inside code is NOT matched', md, '`#notatag`', html =>
    !html.includes('obsidian-tag')
  )
  test('feature flag disables tags', mdNoTags, 'Hello #world', html =>
    !html.includes('obsidian-tag')
  )
})

testGroup('Callout Plugin', () => {
  test('basic callout > [!note]', md, '> [!note] Hello', html =>
    html.includes('class="callout') && html.includes('data-callout="note"')
  )
  test('callout type alias > [!hint]', md, '> [!hint] Tip text', html =>
    html.includes('data-callout="tip"')
  )
  test('foldable callout > [!note]+', md, '> [!note]+ Expanded', html =>
    html.includes('data-callout-foldable') && html.includes('open')
  )
  test('collapsed callout > [!note]-', md, '> [!note]- Collapsed', html =>
    html.includes('data-callout-foldable') && html.includes('data-callout-collapsed="true"')
  )
  test('regular blockquote is unchanged', md, '> Normal quote', html =>
    !html.includes('callout') || html.includes('blockquote')
  )
  test('callout with content', md, '> [!warning] Careful\n> \n> Be careful!', html =>
    html.includes('callout-content')
  )
  test('feature flag disables callouts', mdNoCallouts, '> [!note] Hello', html =>
    !html.includes('data-callout')
  )
})

testGroup('Block Reference Plugin', () => {
  test('block ID at end of paragraph', md, 'Some text ^abc123\n', html =>
    html.includes('data-block-id="abc123"') && html.includes('block-ref-id')
  )
  test('standalone block ID attaches to previous block', md, 'Previous paragraph\n\n^standalone\n', html =>
    html.includes('data-block-id="standalone"')
  )
  test('feature flag disables block refs', mdNoBlockRefs, 'Some text ^abc123\n', html =>
    !html.includes('data-block-id')
  )
})

testGroup('Combined / Integration', () => {
  test('bracketed links inside callout content', md, '> [!note] See [[other]]\n> Content', html =>
    html.includes('data-callout="note"') && html.includes('[[other]]')
  )
  test('tag inside callout content', md, '> [!tip] Use #best-practice', html =>
    html.includes('data-callout="tip"') && html.includes('obsidian-tag')
  )
  test('comment stripped, bracketed text preserved', md, 'See %%secret%% [[note]]', html =>
    !html.includes('secret') && html.includes('[[note]]')
  )
  test('multiple features in same paragraph', md, 'Check #tag with %%hidden%% and ![[embed]] text', html =>
    html.includes('obsidian-tag') && !html.includes('hidden') && html.includes('embed-')
  )
  test('embed after regular text', md, 'See also: ![[other-note]]', html =>
    html.includes('data-embed-src="other-note"')
  )
  test('multiple tags in same line', md, '#tag1 and #tag2', html =>
    (html.match(/class="obsidian-tag"/g) || []).length === 2
  )
  test('all features disabled', createMd({
    features: { comments: false, embeds: false, tags: false, callouts: false, blockRefs: false }
  }), '%%hidden%% ![[embed]] #tag ^blockid\n', html =>
    html.includes('%%hidden%%') && html.includes('#tag')
  )
})

// ─── Performance comparison ──────────────────────────────────────────────────

testGroup('Performance', () => {
  const mdPerf = createMd()
  const longDoc = Array(100).fill(
    'This is a paragraph with #tag and %%comment%% text.\n\n' +
    '> [!note] A callout with content\n> Content here\n\n' +
    'A paragraph with ^block-id\n\n'
  ).join('')

  const start = performance.now()
  for (let i = 0; i < 50; i++) {
    mdPerf.render(longDoc)
  }
  const elapsed = performance.now() - start
  const avgMs = elapsed / 50

  console.log(`  ℹ 50 iterations of long document: ${elapsed.toFixed(1)}ms total, ${avgMs.toFixed(2)}ms avg`)
  if (avgMs < 16) {
    passed++
    console.log('  ✓ Average render time under 16ms frame budget')
  } else {
    failed++
    console.log(`  ✗ Average render time ${avgMs.toFixed(2)}ms exceeds 16ms frame budget`)
  }
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
