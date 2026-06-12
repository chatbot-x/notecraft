---
Task ID: spike-comparison
Agent: Main
Task: Build and compare Marked.js vs markdown-it callout implementations

Work Log:
- Researched existing callout-plugin.ts (381 lines), shared.ts constants, and Lezer callout grammar
- Researched Marked.js v18 extension API: TokenizerExtension, RendererExtension, start() function, LIFO precedence, childTokens
- Researched markdown-it internal API: core/block/inline ruler chains, token stream structure, walk & transform patterns
- Built Spike 1: Marked.js callout extension (block-level tokenizer + renderer, manual line consumption, re-tokenization via this.lexer.blockTokens())
- Built Spike 2: Restructured markdown-it callout plugin with unified-inspired parse→transform→render pattern
- Built test harness with 17 functional tests + 3 performance benchmarks + ergonomics assessment
- Fixed Marked.js bugs: wrong parseCalloutHeader args, line consumption eating subsequent callouts, blank line + [! detection
- Tested nested callouts: Marked.js produces cleaner nested HTML (recursive re-tokenization), markdown-it has token-stream manipulation issues at 3+ levels
- Wrote comprehensive analysis document

Stage Summary:
- Both implementations pass 17/17 functional tests
- Marked.js is 5-62x faster on simple cases, near parity on complex cases
- markdown-it scores 42/50 on ergonomics, Marked.js scores 31/50
- Key finding: Obsidian callouts ARE blockquotes — markdown-it's parser handles nesting/continuation/termination for free
- Marked.js requires reimplementing all blockquote line-consumption logic manually
- Recommendation: Stay with markdown-it + restructure with unified-inspired parse/transform/render pattern
- All spike code in /home/z/my-project/spike-callout-comparison/
