"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const marked_callout_1 = require("./marked-callout");
const mdit_callout_restructured_1 = require("./mdit-callout-restructured");
// Debug the failing tests
const tests = [
    {
        name: 'All 14 canonical types',
        input: [
            '> [!note] Note', '> [!info] Info', '> [!tip] Tip', '> [!success] Success',
            '> [!question] Question', '> [!warning] Warning', '> [!failure] Failure',
            '> [!danger] Danger', '> [!bug] Bug', '> [!example] Example',
            '> [!quote] Quote', '> [!abstract] Abstract', '> [!todo] Todo', '> [!important] Important',
        ].join('\n\n'),
    },
    {
        name: 'Type aliases',
        input: '> [!hint] Hint → tip\n\n> [!error] Error → danger\n\n> [!summary] Summary → abstract',
    },
    {
        name: 'Multiple sequential callouts',
        input: '> [!note] First\n\n> [!warning] Second\n\n> [!danger] Third',
    },
];
for (const t of tests) {
    console.log(`\n=== ${t.name} ===`);
    console.log(`Input:\n${t.input}\n`);
    const mditHtml = (0, mdit_callout_restructured_1.parseWithMarkdownIt)(t.input);
    console.log(`markdown-it output:`);
    console.log(mditHtml);
    const markedHtml = (0, marked_callout_1.parseWithMarked)(t.input);
    console.log(`\nMarked.js output:`);
    console.log(markedHtml);
    // Count callout occurrences
    const mditCallouts = (mditHtml.match(/data-callout/g) || []).length;
    const markedCallouts = (markedHtml.match(/data-callout/g) || []).length;
    console.log(`\nCallout count: md-it=${mditCallouts}, marked=${markedCallouts}`);
}
