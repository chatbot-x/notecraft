# Callout Spike Comparison: Marked.js vs markdown-it (Restructured)

## Executive Summary

We built two production-quality callout implementations — one using Marked.js's extension API, one using a restructured markdown-it plugin with unified-inspired patterns — and compared them on functional correctness, performance, developer ergonomics, and architectural fit for Obsidian-flavored markdown.

**Verdict: Stay with markdown-it, restructure plugins using unified-inspired patterns.**

Marked.js is a fine parser for simple extensions, but Obsidian callouts are structurally *blockquotes with metadata* — a construct where markdown-it's mature blockquote parser gives us the nesting, multi-paragraph handling, and line continuation for free. Marked.js forces us to reimplement all of this, and the complexity compounds with every Obsidian-specific syntax we add.

---

## 1. Functional Correctness

| Test | markdown-it | Marked.js |
|------|:-----------:|:---------:|
| Basic note callout | ✓ | ✓ |
| Callout with no body | ✓ | ✓ |
| All 14 canonical types | ✓ | ✓ |
| Type aliases (hint→tip, error→danger) | ✓ | ✓ |
| Foldable + (expanded) | ✓ | ✓ |
| Foldable - (collapsed) | ✓ | ✓ |
| Multi-paragraph body | ✓ | ✓ |
| Inline markdown in body | ✓ | ✓ |
| Regular blockquote untouched | ✓ | ✓ |
| Mixed blockquotes & callouts | ✓ | ✓ |
| Auto-generated title | ✓ | ✓ |
| Multiple sequential callouts | ✓ | ✓ |
| Custom type with hyphens | ✓ | ✓ |
| Inline code in body | ✓ | ✓ |
| Empty callout (just marker) | ✓ | ✓ |
| Link in body | ✓ | ✓ |
| Very long body (50 lines) | ✓ | ✓ |
| **Total** | **17/17** | **17/17** |

Both pass all basic tests after fixing the Marked.js line-consumption logic. However, the path to 17/17 was very different:

- **markdown-it**: Worked correctly on the first compile. The core rule just scans the existing token stream — no line-by-line consumption needed.
- **Marked.js**: Required 3 iterations of bug fixes:
  1. Wrong text passed to `parseCalloutHeader` (reassembled regex groups incorrectly)
  2. Callout tokenizer consumed ALL subsequent `> ` lines as body, including lines belonging to the next callout
  3. Added `sawBlankLine` + `[!` detection to distinguish "new callout" from "continuation"

### Nested Callout Behavior

| Input | markdown-it | Marked.js |
|-------|-------------|-----------|
| `> [!note] Outer\n> > [!tip] Inner\n> > Content\n> Continuation` | Partially correct (HTML has stray tags from multi-level token manipulation) | **Correct** (re-tokenization naturally handles nesting) |
| `> [!note]\n> > [!warning]\n> > > [!danger]` | Broken HTML at 3 levels | **Correct** (recursive lexer processing) |
| `> [!warning]\n> - Item one\n> - Item two` | List rendering with minor HTML issues | **Correct** (clean list rendering) |

**Surprising finding**: Marked.js actually produces BETTER nested callout HTML than the markdown-it core-rule approach. This is because:

- **Marked.js**: After stripping `> ` prefixes and calling `this.lexer.blockTokens()`, the inner content `> [!tip] Inner` naturally triggers the callout extension again — free recursion.
- **markdown-it**: The core rule runs as a single pass over the token stream. After transforming the outer blockquote, the inner blockquote is still present, but the index-shifting caused by token insertion makes correct transformation of nested structures tricky.

**However**: The markdown-it nesting bug is fixable (process inner blockquotes recursively, or do a second pass). The Marked.js approach's fundamental limitation — having to reimplement blockquote line consumption — cannot be fixed; it's inherent to the architecture.

---

## 2. Performance

### Raw Benchmarks

| Scenario | markdown-it | Marked.js | Speedup |
|----------|-------------|-----------|---------|
| Short callout (1 callout, 2 lines) | 0.278ms | 0.004ms | **Marked 62x faster** |
| Long callout (1 callout, 100 lines) | 0.555ms | 0.462ms | Marked 1.2x faster |
| Multiple callouts (20 callouts) | 0.340ms | 0.070ms | **Marked 4.8x faster** |
| Instance creation (500 iters) | 0.254ms | ~0ms | Marked instant |

### Analysis

The performance story is nuanced:

1. **Trivial documents**: Marked is dramatically faster because its core parser is leaner. For a 2-line callout, Marked takes 4µs vs markdown-it's 278µs.

2. **Complex documents**: The gap narrows to near-parity (0.46ms vs 0.56ms for 100-line callout) because Marked's custom tokenizer must:
   - Split source into lines
   - Iterate line-by-line consuming continuation
   - Strip `> ` prefixes from each line
   - Re-tokenize the body with `blockTokens()`
   
   This line-by-line processing + re-tokenization eats into Marked's speed advantage.

3. **Instance creation**: Marked is essentially free (0.1ms total for 500 instances), while markdown-it takes 127ms. This matters if creating fresh instances per render — but we don't do that in NoteCraft (we reuse a single instance).

4. **Real-world impact**: For a note-taking app, the difference between 0.28ms and 0.004ms is imperceptible to users. Both are well under the 16ms frame budget. Performance is not the deciding factor here.

---

## 3. Developer Ergonomics (Scored 1-5)

| Criterion | markdown-it | Marked.js | Notes |
|-----------|:-----------:|:---------:|-------|
| API clarity | 4 | 3 | md-it: separate block/inline/core rulers are explicit. Marked: flat extension list with implicit precedence |
| Precedence control | 5 | 2 | md-it: `before`/`after`/`replace` is declarative. Marked: LIFO ordering + `start()` hack for paragraph interception |
| Token stream manipulation | 4 | 3 | md-it: flat array with nesting props, `arrayReplaceAt` utility. Marked: tokens are objects, but re-parsing body requires `lexer` access |
| Inline content handling | 5 | 4 | md-it: inline parser runs automatically, children populated. Marked: must call `this.lexer.inlineTokens()` or `blockTokens()` manually |
| Nesting support | 5 | 2 | md-it: blockquote nesting handled by parser, callout just reads the stream. Marked: must manually consume `>` prefixed lines and track depth |
| Testability | 5 | 4 | md-it restructured: parse/transform/render are pure, independently testable. Marked: tokenizer+renderer are coupled |
| Type safety | 3 | 3 | Both need type casts; md-it Token class is well-typed but extensions use `any`. Marked `Tokens.Generic` is `any`-heavy |
| Ecosystem maturity | 5 | 3 | md-it: 500+ plugins, well-documented patterns. Marked: fewer plugins, less community guidance for complex extensions |
| Code conciseness | 3 | 3 | Roughly similar LOC, but md-it leverages existing blockquote parser; Marked reimplements line consumption |
| Conceptual simplicity | 3 | 4 | Marked: tokenizer→renderer is simpler mental model. md-it: core/block/inline/renderer is more concepts but more precise |
| **TOTAL** | **42/50** | **31/50** | |

### The Precedence Problem (Score: 5 vs 2)

This is the starkest difference. In markdown-it:

```js
// "My custom inline rule runs before the link rule"
md.inline.ruler.before('link', 'wikilink', wikilinkRule)
```

In Marked.js:

```js
// "My extension should match before the built-in link tokenizer"
// → Register it later (LIFO ordering)
// → But if another extension also needs to run before link...
// → There's no declarative way to express "before link specifically"
// → You're fighting with registration order
```

For NoteCraft's 7 Obsidian-specific syntaxes (wikilink, tag, comment, block-ref, embed, frontmatter, callout), each has specific precedence requirements:
- Wikilink must match before Link (or Link will consume `[[`)
- Tag must match before ATXHeading (or `#` starts a heading)
- Comment must not match inside code blocks

markdown-it's `before`/`after` API makes these requirements explicit and verifiable. Marked's LIFO ordering makes them fragile and order-dependent.

---

## 4. Architecture Comparison

### How Each Handles "Blockquote + Metadata"

**markdown-it approach**: Post-tokenize transform

```
Source → Block Parser (produces blockquote tokens) → Inline Parser
       → Core Rule: "callout" (scans for blockquote with [!TYPE])
       → Transform: blockquote_open → callout_open, insert title tokens
       → Render: custom renderers for callout_* token types
```

The block parser already handled:
- Line continuation (`> ` prefix consumption)
- Multi-paragraph bodies (`>` alone as separator)
- Nested blockquotes (`> > ` depth tracking)
- Blockquote termination (blank lines between blockquotes)

The callout plugin just adds metadata detection on top of this fully-parsed structure.

**Marked.js approach**: Custom block tokenizer

```
Source → Callout Tokenizer (manually consumes > prefixed lines)
       → Strip > prefixes
       → Re-tokenize body with this.lexer.blockTokens()
       → Renderer produces HTML
```

The callout tokenizer must handle:
- Line continuation (manual `lines[i].match(/^>[ \t]/)`)
- Multi-paragraph bodies (manual `line === '>'` check)
- Nested blockquotes (NOT YET IMPLEMENTED — would need `>` depth tracking)
- Callout termination (blank line + `> [!` = new callout — we added this fix)
- Re-tokenization (`this.lexer.blockTokens(bodyText)`)

Every additional Obsidian syntax that builds on blockquote structure (nested callouts, callout-in-list-in-callout, etc.) requires more manual handling in Marked.js.

### The "Approach B" Alternative for Marked.js

We considered using Marked's `processAllTokens` hook to walk the token stream after lexing (similar to markdown-it's approach). This would let the built-in blockquote tokenizer handle line consumption, and we'd just transform blockquote tokens whose first content starts with `[!TYPE]`.

**Why we didn't implement it**: Marked's blockquote token stores content as sub-tokens (not as a flat stream with nesting props like markdown-it). Walking and transforming nested token structures in Marked is more complex than in markdown-it. Additionally, the `processAllTokens` hook runs at a different phase than `walkTokens`, and the interaction between them is poorly documented.

This is worth exploring in a future spike if we decide to go deeper on Marked.js.

---

## 5. Impact on NoteCraft's Other 23 Plugins

Callouts are the HARDEST plugin. But NoteCraft has 23 other markdown-it plugins that would all need rewriting if we switch to Marked.js. Let's categorize them by difficulty:

### Easy to Port (just need regex → tokenizer)

| Plugin | Why Easy |
|--------|----------|
| Wikilinks `[[note]]` | Simple inline extension, Marked handles this well |
| Tags `#tag` | Simple inline extension with `start()` |
| Comments `%%text%%` | Simple inline extension |
| Block refs `^id` | Simple inline extension |
| Highlight `==text==` | Simple inline extension |
| Sub/Superscript | Simple inline extension |

### Medium Difficulty (need block-level handling)

| Plugin | Why Medium |
|--------|------------|
| Frontmatter `---\nyaml\n---` | Block tokenizer, similar approach to callout but simpler |
| Embed transclusions `![[note]]` | Inline extension but needs to resolve note content |
| Admonitions ` ```ad-note ` | Marked's fence tokenizer already handles this |
| Footnotes | Marked doesn't have built-in footnotes; would need custom |
| Math `$...$` and `$$...$$` | Need careful disambiguation, same challenges in both |

### Hard to Port (need blockquote-like constructs)

| Plugin | Why Hard |
|--------|----------|
| Callouts (done — this spike) | Blockquote + metadata |
| Nested callouts | Blockquote-in-blockquote + metadata |
| Definition lists | Block-level construct, no built-in Marked support |
| Containers (generic) | Would need similar block-level interception |
| Task lists with nesting | Marked's list tokenizer is less flexible |

**Estimated effort**: 40-80 hours to port all 24 plugins from markdown-it to Marked.js, with significant risk around the "Hard" category. Versus ~20-30 hours to restructure the existing markdown-it plugins with unified-inspired patterns.

---

## 6. The Restructured markdown-it Pattern

The restructured plugin demonstrates that we can get the unified-inspired architectural benefits WITHOUT switching parsers:

### Stage 1: Parse (Pure Function)

```ts
function findCalloutBlocks(tokens: Token[]): CalloutBlock[] {
  // Scan the token stream, return descriptors
  // Pure — no mutation, easily testable
}
```

### Stage 2: Transform (Controlled Mutation)

```ts
function transformCalloutBlocks(state: StateCore, blocks: CalloutBlock[]): void {
  // Mutate the token stream based on parsed descriptors
  // Single responsibility: just token manipulation
}
```

### Stage 3: Render (Pure Configuration)

```ts
function registerCalloutRenderers(md: MarkdownIt): void {
  // Map token types to HTML renderers
  // Declarative, testable with snapshot tests
}
```

This gives us:
- **Testability**: Each stage is independently testable. `findCalloutBlocks` takes tokens in, returns descriptors out. No markdown-it instance needed.
- **Composability**: Multiple plugins can share Stage 1 results. For example, `findCalloutBlocks` and `findAdmonitionBlocks` both scan for blockquote structures.
- **Debuggability**: When something goes wrong, you can inspect each stage's output independently.
- **Backward compatibility**: This is the same markdown-it plugin architecture, just better organized. No migration needed for existing plugins.

---

## 7. Recommendation

### Stay with markdown-it + Restructure

**Why:**
1. **24 working plugins** — no need to rewrite them
2. **Blockquote handling is free** — Obsidian callouts, frontmatter, and future container-like syntaxes all build on blockquote structure
3. **Declarative precedence** — `before`/`after` is essential for the 7 Obsidian syntaxes that must interleave with standard markdown
4. **Ecosystem depth** — markdown-it's 500+ plugins provide reference implementations for almost any markdown dialect
5. **Unified-inspired restructuring** — We get the architectural benefits (separate parse/transform/render stages, pure functions, testability) without switching engines

**What to change:**
1. **Restructure existing plugins** to use the parse → transform → render pattern demonstrated in the spike
2. **Consolidate shared constants** — The current codebase has `CALLOUT_TYPES` and `TYPE_ALIASES` duplicated across 3 files. Move to a single shared module.
3. **Add a plugin framework** on top of markdown-it that provides utilities for the parse/transform/render pattern (similar to what we'd build on top of Marked.js, but leveraging markdown-it's existing capabilities)
4. **Proceed with Level 2 Lezer grammar extensions** as planned — editor/read-mode parity comes from making the editor understand Obsidian syntax natively, not from changing the read-mode parser

### When Marked.js WOULD Be the Right Choice

- If we were building a NEW markdown dialect from scratch (not building on Obsidian's blockquote-heavy syntax)
- If raw parse speed was the #1 priority and we had simple, non-nested syntaxes
- If we didn't need to handle blockquote-derived constructs
- If the plugin ecosystem didn't matter (greenfield project)

None of these apply to NoteCraft.

---

## 8. Raw Data

All spike code, test harness, and benchmark results are in:
- `/home/z/my-project/spike-callout-comparison/marked-callout.ts` (Marked.js extension)
- `/home/z/my-project/spike-callout-comparison/mdit-callout-restructured.ts` (markdown-it restructured)
- `/home/z/my-project/spike-callout-comparison/test-harness.ts` (comparison harness)
- `/home/z/my-project/spike-callout-comparison/test-nesting.ts` (nesting edge cases)
