"use strict";
/**
 * ADDITIONAL TEST: Nested Callouts — the hardest case
 *
 * In Obsidian, you can nest callouts:
 *   > [!note] Outer
 *   > > [!tip] Inner
 *   > > Inner content
 *   > Outer continuation
 *
 * This is where the Marked.js approach fundamentally fights the parser,
 * because nested blockquotes are complex to handle manually.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const marked_callout_1 = require("./marked-callout");
const mdit_callout_restructured_1 = require("./mdit-callout-restructured");
const nestedCallout = `> [!note] Outer callout
> > [!tip] Nested callout
> > Inner content
> Outer continuation`;
console.log('=== Nested Callout Test ===\n');
console.log('Input:');
console.log(nestedCallout);
console.log();
console.log('--- markdown-it ---');
const mditHtml = (0, mdit_callout_restructured_1.parseWithMarkdownIt)(nestedCallout);
console.log(mditHtml);
console.log();
console.log('--- Marked.js ---');
const markedHtml = (0, marked_callout_1.parseWithMarked)(nestedCallout);
console.log(markedHtml);
console.log();
// Check for expected patterns
const checks = [
    { name: 'Outer callout exists', test: mditHtml.includes('callout-note') },
    { name: 'Inner callout exists (md-it)', test: mditHtml.includes('callout-tip') },
    { name: 'Inner callout exists (Marked)', test: markedHtml.includes('callout-tip') },
    { name: 'Nested blockquote in md-it', test: mditHtml.includes('blockquote') === false }, // md-it transforms the blockquote
    { name: 'Outer continuation (md-it)', test: mditHtml.includes('Outer continuation') },
    { name: 'Outer continuation (Marked)', test: markedHtml.includes('Outer continuation') },
];
for (const c of checks) {
    console.log(`${c.test ? '✓' : '✗'} ${c.name}`);
}
// Another hard case: callout inside a list inside a blockquote
console.log('\n=== Callout with list body ===\n');
const listBody = `> [!warning] Checklist
> - Item one
> - Item two
> - Item three`;
console.log('Input:', listBody);
console.log();
console.log('--- markdown-it ---');
console.log((0, mdit_callout_restructured_1.parseWithMarkdownIt)(listBody));
console.log('--- Marked.js ---');
console.log((0, marked_callout_1.parseWithMarked)(listBody));
// Deep nesting: 3 levels
console.log('\n=== Triple nesting ===\n');
const tripleNested = `> [!note] Level 1
> > [!warning] Level 2
> > > [!danger] Level 3
> > > Deepest content
> > Level 2 continuation
> Level 1 continuation`;
console.log('Input:', tripleNested);
console.log();
console.log('--- markdown-it ---');
console.log((0, mdit_callout_restructured_1.parseWithMarkdownIt)(tripleNested));
console.log('--- Marked.js ---');
console.log((0, marked_callout_1.parseWithMarked)(tripleNested));
