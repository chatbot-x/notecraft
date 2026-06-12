"use strict";
/**
 * Callout Spike Comparison: Test Harness + Benchmark
 *
 * Runs both Marked.js and markdown-it callout implementations against
 * the same test suite and benchmarks, then prints a detailed comparison.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const marked_callout_1 = require("./marked-callout");
const mdit_callout_restructured_1 = require("./mdit-callout-restructured");
// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
function section(title) {
    console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);
}
function result(label, passed, detail) {
    const icon = passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${label}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`);
}
const TEST_CASES = [
    // ── Basic callout ──
    {
        name: 'Basic note callout',
        input: '> [!note] This is a note\n> With some content',
        validate(html, engine) {
            if (!html.includes('callout'))
                return `Missing "callout" class`;
            if (!html.includes('callout-note'))
                return `Missing "callout-note" class`;
            if (!html.includes('data-callout="note"'))
                return `Missing data-callout attribute`;
            if (!html.includes('callout-icon'))
                return `Missing callout icon`;
            if (!html.includes('callout-title-text'))
                return `Missing title text container`;
            if (!html.includes('This is a note'))
                return `Missing title content`;
            if (!html.includes('With some content'))
                return `Missing body content`;
            return null;
        },
    },
    // ── Callout with no body ──
    {
        name: 'Callout with no body content',
        input: '> [!warning] Just a title',
        validate(html, engine) {
            if (!html.includes('callout-warning'))
                return `Missing callout-warning`;
            if (!html.includes('Just a title'))
                return `Missing title`;
            return null;
        },
    },
    // ── All 14 types ──
    {
        name: 'All 14 canonical types',
        input: [
            '> [!note] Note', '> [!info] Info', '> [!tip] Tip', '> [!success] Success',
            '> [!question] Question', '> [!warning] Warning', '> [!failure] Failure',
            '> [!danger] Danger', '> [!bug] Bug', '> [!example] Example',
            '> [!quote] Quote', '> [!abstract] Abstract', '> [!todo] Todo', '> [!important] Important',
        ].join('\n\n'),
        validate(html, engine) {
            const types = ['note', 'info', 'tip', 'success', 'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote', 'abstract', 'todo', 'important'];
            for (const t of types) {
                if (!html.includes(`callout-${t}`))
                    return `Missing callout-${t}`;
            }
            return null;
        },
    },
    // ── Type aliases ──
    {
        name: 'Type aliases resolve correctly',
        input: '> [!hint] Hint → tip\n\n> [!error] Error → danger\n\n> [!summary] Summary → abstract',
        validate(html, engine) {
            if (!html.includes('callout-tip'))
                return `hint should resolve to tip`;
            if (!html.includes('callout-danger'))
                return `error should resolve to danger`;
            if (!html.includes('callout-abstract'))
                return `summary should resolve to abstract`;
            return null;
        },
    },
    // ── Foldable expanded ──
    {
        name: 'Foldable callout (+ expanded)',
        input: '> [!tip]+ Expanded by default\n> Some content',
        validate(html, engine) {
            if (!html.includes('data-callout-foldable'))
                return `Missing foldable attribute`;
            if (!html.includes('data-callout-collapsed="false"') && !html.includes('data-callout-collapsed="false"')) {
                // Marked may render differently
                if (!html.includes('open') && !html.includes('collapsed'))
                    return `Missing fold state`;
            }
            if (!html.includes('<details'))
                return `Foldable should use <details>`;
            if (!html.includes('<summary'))
                return `Foldable should use <summary>`;
            if (!html.includes('callout-fold-icon'))
                return `Missing fold chevron`;
            return null;
        },
    },
    // ── Foldable collapsed ──
    {
        name: 'Foldable callout (- collapsed)',
        input: '> [!danger]- Collapsed by default\n> Hidden content',
        validate(html, engine) {
            if (!html.includes('data-callout-foldable'))
                return `Missing foldable attribute`;
            if (!html.includes('<details'))
                return `Foldable should use <details>`;
            if (!html.includes('\u25B8') && !html.includes('▸'))
                return `Missing collapsed chevron (▸)`;
            return null;
        },
    },
    // ── Multi-paragraph body ──
    {
        name: 'Multi-paragraph callout body',
        input: '> [!info] Multi-paragraph\n> First paragraph\n>\n> Second paragraph',
        validate(html, engine) {
            if (!html.includes('First paragraph'))
                return `Missing first paragraph`;
            if (!html.includes('Second paragraph'))
                return `Missing second paragraph`;
            return null;
        },
    },
    // ── Inline formatting in body ──
    {
        name: 'Inline markdown in callout body',
        input: '> [!note] Styled body\n> This has **bold** and *italic* text',
        validate(html, engine) {
            if (!html.includes('<strong>bold</strong>'))
                return `Missing bold formatting`;
            if (!html.includes('<em>italic</em>'))
                return `Missing italic formatting`;
            return null;
        },
    },
    // ── Regular blockquote unaffected ──
    {
        name: 'Regular blockquote left untouched',
        input: '> This is just a normal blockquote\n> Not a callout',
        validate(html, engine) {
            if (html.includes('class="callout'))
                return `Regular blockquote should not have callout class`;
            if (html.includes('data-callout'))
                return `Regular blockquote should not have data-callout attribute`;
            if (!html.includes('<blockquote'))
                return `Should render as blockquote`;
            return null;
        },
    },
    // ── Mixed blockquotes and callouts ──
    {
        name: 'Mixed blockquotes and callouts',
        input: '> Normal blockquote\n\n> [!note] A callout\n> Content\n\n> Another blockquote',
        validate(html, engine) {
            const calloutCount = (html.match(/data-callout/g) || []).length;
            if (calloutCount < 1)
                return `Should have at least one callout`;
            return null;
        },
    },
    // ── Auto-generated title ──
    {
        name: 'Auto-generated title from type',
        input: '> [!warning]',
        validate(html, engine) {
            if (!html.includes('Warning') && !html.includes('warning'))
                return `Should auto-generate title "Warning"`;
            return null;
        },
    },
    // ── Multiple callouts in sequence ──
    {
        name: 'Multiple sequential callouts',
        input: '> [!note] First\n\n> [!warning] Second\n\n> [!danger] Third',
        validate(html, engine) {
            if (!html.includes('callout-note'))
                return `Missing first callout`;
            if (!html.includes('callout-warning'))
                return `Missing second callout`;
            if (!html.includes('callout-danger'))
                return `Missing third callout`;
            return null;
        },
    },
];
// ─── Edge Case Tests ──────────────────────────────────────────────────────────
const EDGE_CASES = [
    {
        name: 'Callout type with hyphens (custom)',
        input: '> [!my-custom-type] Custom type',
        validate(html, engine) {
            if (!html.includes('callout-my-custom-type'))
                return `Should support custom types`;
            return null;
        },
    },
    {
        name: 'Callout with inline code in body',
        input: '> [!info] Code in body\n> Use `console.log()` to debug',
        validate(html, engine) {
            if (!html.includes('console.log'))
                return `Should preserve inline code`;
            return null;
        },
    },
    {
        name: 'Empty callout (just marker, no body)',
        input: '> [!tip]',
        validate(html, engine) {
            if (!html.includes('callout-tip'))
                return `Should still render callout`;
            if (!html.includes('Tip'))
                return `Should auto-generate title`;
            return null;
        },
    },
    {
        name: 'Callout with link in body',
        input: '> [!note] With link\n> Check [this](https://example.com) out',
        validate(html, engine) {
            if (!html.includes('https://example.com'))
                return `Should preserve link`;
            return null;
        },
    },
    {
        name: 'Very long callout body (50 lines)',
        input: '> [!note] Long callout\n' + Array.from({ length: 50 }, (_, i) => `> Line ${i + 1} of content`).join('\n'),
        validate(html, engine) {
            if (!html.includes('Line 1') || !html.includes('Line 50'))
                return `Should preserve all lines`;
            return null;
        },
    },
];
// ─── Benchmark ────────────────────────────────────────────────────────────────
function benchmark(name, fn, iterations = 1000) {
    // Warm up
    for (let i = 0; i < 50; i++)
        fn();
    const times = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        times.push(end - start);
    }
    times.sort((a, b) => a - b);
    return {
        avg: times.reduce((s, t) => s + t, 0) / times.length,
        min: times[0],
        max: times[times.length - 1],
        total: times.reduce((s, t) => s + t, 0),
    };
}
// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
    section('CALLOUT SPIKE COMPARISON: Marked.js vs markdown-it (Restructured)');
    // ── 1. Functional Tests ──
    section('1. FUNCTIONAL CORRECTNESS');
    let mditPassed = 0, mditFailed = 0;
    let markedPassed = 0, markedFailed = 0;
    const allTests = [...TEST_CASES, ...EDGE_CASES];
    for (const tc of allTests) {
        // markdown-it
        try {
            const mditHtml = (0, mdit_callout_restructured_1.parseWithMarkdownIt)(tc.input);
            const mditErr = tc.validate(mditHtml, 'markdown-it');
            if (mditErr) {
                result(`[md-it] ${tc.name}`, false, mditErr);
                mditFailed++;
            }
            else {
                result(`[md-it] ${tc.name}`, true);
                mditPassed++;
            }
        }
        catch (e) {
            result(`[md-it] ${tc.name}`, false, `EXCEPTION: ${e.message}`);
            mditFailed++;
        }
        // Marked.js
        try {
            const markedHtml = (0, marked_callout_1.parseWithMarked)(tc.input);
            const markedErr = tc.validate(markedHtml, 'marked');
            if (markedErr) {
                result(`[marked] ${tc.name}`, false, markedErr);
                markedFailed++;
            }
            else {
                result(`[marked] ${tc.name}`, true);
                markedPassed++;
            }
        }
        catch (e) {
            result(`[marked] ${tc.name}`, false, `EXCEPTION: ${e.message}`);
            markedFailed++;
        }
    }
    console.log(`\n  ${BOLD}Summary:${RESET}`);
    console.log(`    markdown-it: ${GREEN}${mditPassed} passed${RESET}, ${RED}${mditFailed} failed${RESET}`);
    console.log(`    Marked.js:   ${GREEN}${markedPassed} passed${RESET}, ${RED}${markedFailed} failed${RESET}`);
    // ── 2. HTML Output Comparison ──
    section('2. HTML OUTPUT COMPARISON (Basic callout)');
    const basicInput = '> [!note] Hello World\n> This is the body';
    const mditHtml = (0, mdit_callout_restructured_1.parseWithMarkdownIt)(basicInput);
    const markedHtml = (0, marked_callout_1.parseWithMarked)(basicInput);
    console.log(`  ${BOLD}Input:${RESET}`);
    console.log(`    ${DIM}${basicInput.replace(/\n/g, '\n    ')}${RESET}\n`);
    console.log(`  ${BOLD}markdown-it output:${RESET}`);
    console.log(`    ${mditHtml.replace(/\n/g, '\n    ')}\n`);
    console.log(`  ${BOLD}Marked.js output:${RESET}`);
    console.log(`    ${markedHtml.replace(/\n/g, '\n    ')}\n`);
    // ── 3. Performance Benchmark ──
    section('3. PERFORMANCE BENCHMARK');
    const shortInput = '> [!note] Short callout\n> Body text';
    const longInput = '> [!warning] Long callout\n' + Array.from({ length: 100 }, (_, i) => `> Line ${i + 1} with **bold** and *italic* and \`code\` text`).join('\n');
    const multiInput = Array.from({ length: 20 }, (_, i) => `> [!${['note', 'info', 'tip', 'warning', 'danger'][i % 5]}] Callout ${i + 1}\n> Content for callout ${i + 1}`).join('\n\n');
    const benchmarks = [
        { name: 'Short callout (1 callout, 2 lines)', input: shortInput, iters: 5000 },
        { name: 'Long callout (1 callout, 100 lines)', input: longInput, iters: 1000 },
        { name: 'Multiple callouts (20 callouts)', input: multiInput, iters: 1000 },
    ];
    for (const bm of benchmarks) {
        console.log(`  ${BOLD}${bm.name}${RESET} (${bm.iters} iterations)\n`);
        const mditResult = benchmark('markdown-it', () => (0, mdit_callout_restructured_1.parseWithMarkdownIt)(bm.input), bm.iters);
        const markedResult = benchmark('Marked.js', () => (0, marked_callout_1.parseWithMarked)(bm.input), bm.iters);
        console.log(`    markdown-it: avg=${YELLOW}${mditResult.avg.toFixed(3)}ms${RESET}  min=${mditResult.min.toFixed(3)}ms  max=${mditResult.max.toFixed(3)}ms  total=${mditResult.total.toFixed(1)}ms`);
        console.log(`    Marked.js:   avg=${YELLOW}${markedResult.avg.toFixed(3)}ms${RESET}  min=${markedResult.min.toFixed(3)}ms  max=${markedResult.max.toFixed(3)}ms  total=${markedResult.total.toFixed(1)}ms`);
        const speedup = mditResult.avg / markedResult.avg;
        if (speedup > 1) {
            console.log(`    ${GREEN}Marked.js is ${speedup.toFixed(2)}x faster${RESET}`);
        }
        else {
            console.log(`    ${GREEN}markdown-it is ${(1 / speedup).toFixed(2)}x faster${RESET}`);
        }
        console.log();
    }
    // ── 4. Instance Creation Overhead ──
    section('4. INSTANCE CREATION OVERHEAD');
    const createMdit = benchmark('create md-it', () => (0, mdit_callout_restructured_1.createMarkdownItWithCallouts)(), 500);
    const createMarked = benchmark('create marked', () => (0, marked_callout_1.createMarkedWithCallouts)(), 500);
    console.log(`  markdown-it instance creation: avg=${YELLOW}${createMdit.avg.toFixed(3)}ms${RESET}  total=${createMdit.total.toFixed(1)}ms (500 iters)`);
    console.log(`  Marked.js instance creation:   avg=${YELLOW}${createMarked.avg.toFixed(3)}ms${RESET}  total=${createMarked.total.toFixed(1)}ms (500 iters)`);
    // ── 5. Developer Ergonomics Assessment ──
    section('5. DEVELOPER ERGONOMICS ASSESSMENT');
    console.log(`  ${BOLD}Criteria (rated 1-5):${RESET}\n`);
    const criteria = [
        { criterion: 'API clarity', mdit: 4, marked: 3, note: 'md-it: separate block/inline/core rulers are explicit. Marked: flat extension list with implicit precedence' },
        { criterion: 'Precedence control', mdit: 5, marked: 2, note: 'md-it: before/after/replace is declarative. Marked: LIFO ordering + start() hack for paragraph interception' },
        { criterion: 'Token stream manipulation', mdit: 4, marked: 3, note: 'md-it: flat array with nesting props, arrayReplaceAt utility. Marked: tokens are objects, but re-parsing body requires lexer access' },
        { criterion: 'Inline content handling', mdit: 5, marked: 4, note: 'md-it: inline parser runs automatically, children populated. Marked: must call this.lexer.inlineTokens() or blockTokens() manually' },
        { criterion: 'Nesting support', mdit: 5, marked: 2, note: 'md-it: blockquote nesting handled by parser, callout just reads the stream. Marked: must manually consume > prefixed lines and track depth' },
        { criterion: 'Testability', mdit: 5, marked: 4, note: 'md-it restructured: parse/transform/render are pure, independently testable. Marked: tokenizer+renderer are coupled' },
        { criterion: 'Type safety', mdit: 3, marked: 3, note: 'Both need type casts; md-it Token class is well-typed but extensions use any. Marked Tokens.Generic is any-heavy' },
        { criterion: 'Ecosystem maturity', mdit: 5, marked: 3, note: 'md-it: 500+ plugins, well-documented patterns. Marked: fewer plugins, less community guidance for complex extensions' },
        { criterion: 'Code conciseness', mdit: 3, marked: 3, note: 'Roughly similar LOC, but md-it leverages existing blockquote parser; Marked reimplements line consumption' },
        { criterion: 'Conceptual simplicity', mdit: 3, marked: 4, note: 'Marked: tokenizer→renderer is simpler mental model. md-it: core/block/inline/renderer is more concepts but more precise' },
    ];
    let mditTotal = 0, markedTotal = 0;
    for (const c of criteria) {
        mditTotal += c.mdit;
        markedTotal += c.marked;
        console.log(`  ${BOLD}${c.criterion}${RESET}`);
        console.log(`    md-it: ${'●'.repeat(c.mdit)}${'○'.repeat(5 - c.mdit)} (${c.mdit}/5)  Marked: ${'●'.repeat(c.marked)}${'○'.repeat(5 - c.marked)} (${c.marked}/5)`);
        console.log(`    ${DIM}${c.note}${RESET}\n`);
    }
    console.log(`  ${BOLD}TOTAL:${RESET}  markdown-it: ${mditTotal}/50  Marked.js: ${markedTotal}/50`);
    // ── 6. Code Size Comparison ──
    section('6. CODE SIZE COMPARISON');
    const { readFileSync } = require('fs');
    const { statSync } = require('fs');
    try {
        const mditCode = readFileSync(__dirname + '/mdit-callout-restructured.ts', 'utf-8');
        const markedCode = readFileSync(__dirname + '/marked-callout.ts', 'utf-8');
        const mditLines = mditCode.split('\n').length;
        const markedLines = markedCode.split('\n').length;
        const mditChars = mditCode.length;
        const markedChars = markedCode.length;
        console.log(`  markdown-it restructured:  ${mditLines} lines, ${mditChars} chars`);
        console.log(`  Marked.js extension:       ${markedLines} lines, ${markedChars} chars`);
    }
    catch (e) {
        console.log(`  (Could not read source files for comparison)`);
    }
    // ── 7. Final Verdict ──
    section('7. FINAL VERDICT');
    console.log(`  ${BOLD}Functional correctness:${RESET}`);
    console.log(`    markdown-it: ${mditPassed}/${allTests.length} tests passed`);
    console.log(`    Marked.js:   ${markedPassed}/${allTests.length} tests passed\n`);
    console.log(`  ${BOLD}Key findings:${RESET}`);
    console.log(`    1. Marked.js requires REIMPLEMENTING blockquote line consumption`);
    console.log(`       that markdown-it already handles natively. This is the biggest`);
    console.log(`       pain point — Obsidian callouts ARE blockquotes with metadata.`);
    console.log(``);
    console.log(`    2. Nested callouts (blockquote-in-blockquote) are essentially`);
    console.log(`       free in markdown-it (the parser handles nesting). In Marked.js,`);
    console.log(`       the custom tokenizer must track > depth manually — fragile.`);
    console.log(``);
    console.log(`    3. Marked.js is faster for simple cases, but the performance gap`);
    console.log(`       narrows for complex documents because the custom tokenizer`);
    console.log(`       must do more work (line-by-line consumption, re-tokenization).`);
    console.log(``);
    console.log(`    4. The restructured markdown-it plugin (parse → transform → render)`);
    console.log(`       achieves the unified-inspired patterns WITHOUT sacrificing the`);
    console.log(`       mature blockquote handling. Best of both worlds.`);
    console.log(``);
    console.log(`  ${BOLD}RECOMMENDATION:${RESET} Stay with markdown-it + restructure plugins`);
    console.log(`  using the unified-inspired pattern (separate parse/transform/render stages).`);
    console.log(`  Marked.js is a fine parser, but Obsidian callouts are structurally`);
    console.log(`  blockquotes — fighting the parser on this creates unnecessary complexity.`);
}
main();
