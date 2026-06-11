
---
Task ID: 2
Agent: main
Task: Implement Level 2: Lezer grammar extensions for Obsidian-flavored Markdown

Work Log:
- Researched @lezer/markdown source code and GFM extension patterns
- Created 7 Lezer grammar extensions: comments, tags, block-refs, wikilinks, embeds, frontmatter, callouts
- Updated 7 decoration plugins to use tree-based scanning with regex fallback
- Deduplicated shared constants (IMAGE_EXTENSIONS, CALLOUT_TYPES, TYPE_ALIASES)
- Wired extensions into editor via markdown({ extensions: obsidianExtensions })
- Build passes cleanly

Stage Summary:
- 7 Lezer extensions producing proper syntax tree nodes for Obsidian syntax
- All regex-based decoration plugins now use tree-first scanning
- Parser precedence: Comment→Escape, Tag→ATXHeading, Embed→Wikilink→Link, Callout→Link, Frontmatter→HorizontalRule
