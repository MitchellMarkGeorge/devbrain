# Maintaining the markdown layer

How to change `src/renderer/editor/markdown/` without breaking what it promises. Read this before
a change to the layer, and go through "Before you open a pull request" at the end.

- What the layer does, in full: [`docs/editor.md`](../editor.md) ("The markdown layer", "The
  source map", "The note format", "What a save changes", "When reading or writing fails",
  "Checking it on real files", "Extending it"). That is the reference; this is the how-to.
- Why it is built this way, and what each milestone found:
  [`markdown-layer-plan.md`](markdown-layer-plan.md).

## What it promises

Every change is judged against these. A change that weakens one needs its own decision, written
down in `docs/editor.md`.

1. **Opening a note never changes its file.** While the document is the one that was loaded,
   `editor.saveMarkdown()` gives the loaded text, byte for byte.
2. **A save rewrites only the blocks that changed.** Every other top-level block, and the text
   between blocks (blank lines, link definitions, line ends), is written back as it was.
3. **An edited block keeps the way it was written** (`*` bullets, `__bold__`, `~~~` fences),
   unless that spelling would read as something else where it now stands.
4. **What is saved reads back as what the editor holds.** Kept text is never allowed to change
   what the document means. Where it would, the layer writes more of the document itself.
5. **A failure never loses a note.** Reading that throws shows the text as it is and stops
   editing; saving that throws gives what was saved last.
6. **No private or undocumented TipTap API,** and only `marked`'s public API.

## The two paths

```
READ   text ─ lexer.ts (marked + our tokenizers) ─► tokens, each with its raw
            ─ parser.ts + rules ─► JSON document          ─► setContent (TipTap, public)
            ─ source.ts ─► source map: which slice of the text each top-level block came from

SAVE   document unchanged ─► the loaded text
       document edited    ─ keeping.ts: diff the top-level blocks against the loaded ones
                            ├ a block that is the same  ─► its slice of the loaded text
                            └ a block that is new       ─► serializer.ts + rules (with markers)
                          ─ read the result back; if it isn't the document, write more of it anew
```

| File                              | What it is for                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `index.ts`                        | `createDocumentExtensions()` (the schema), and `parseMarkdown` and friends with no editor |
| `extension.ts`                    | `DocumentMarkdown`: the editor's methods, what was loaded, problems, counts               |
| `codec.ts`                        | `MarkdownCodec`: parser and serializer for one schema; catches what throws                |
| `lexer.ts`                        | our own `Marked` instance and how a tokenizer is plugged into it                          |
| `parser.ts`                       | tokens to JSON; where each top-level token stands in the text                             |
| `serializer.ts`                   | JSON to markdown; marks, escaping                                                         |
| `rules/` and `../extensions/*.ts` | one `MarkdownRule` per node or mark: `parse`, `render`, sometimes a `tokenizer`           |
| `source.ts`                       | the source map, and why a text has none (`UnmappedReason`)                                |
| `keeping.ts`                      | a save that keeps text: the diff, the writing, the check, the fallbacks (`WholeReason`)   |
| `markup.ts`                       | the `markup` attribute (markers), `stripMarkup`, `withListsApart`                         |
| `entities.ts`, `types.ts`         | HTML entities; the layer's types                                                          |

Nothing outside the layer reaches into it. The rest of the app uses four editor methods
(`getMarkdown`, `saveMarkdown`, `markdownToContent`, `contentToMarkdown`) and
`contentType: 'markdown'`. Keep it that way: a caller that needs something new gets a method.

## Rules that are easy to break

- **Whatever a rule writes, it must read back as the same node.** This is the layer's one real
  invariant, and most of its bugs have been a `render` whose output `parse` reads differently in
  some surrounding (in a list item, after a paragraph, next to another mark). Test a new spelling
  inside a list item, a quote and a table cell, not only at the top level.
- **Reading is for any text; writing is for the editor's document.** `parse` must take whatever
  another app wrote (tabs, lazy lines, odd indents) and never throw away content: a token no rule
  reads becomes an `unread-token` and costs the note its source map, and inside a list or a quote
  nothing flags it at all.
- **A marker never decides meaning.** `markup` is how a node was spelled, never what it is. Two
  documents that differ only in `markup` are the same document, and every comparison in the
  layer strips it first (`stripMarkup`). A `render` that uses a marker checks it can stand there
  and falls back to the editor's own spelling.
- **Compare documents as the schema holds them.** JSON from the parser has no `markup` key where
  JSON from ProseMirror has `markup: null`, and attributes at their default may be missing. Use
  `Node.eq` on schema nodes, or `schema.nodeFromJSON(stripMarkup(json)).toJSON()` on both sides.
  A plain `JSON.stringify` comparison hid a class of unchecked saves in the corpus test for a
  whole milestone.
- **`saveMarkdown()` never throws, and `codec.read()` never throws.** New code on those paths goes
  inside the existing `try`, and a new failure gets a reason, not an exception.
- **A tokenizer must not scan the whole rest of the text.** `marked` calls `start` and `tokenize`
  at many positions; a regular expression that runs to the end of `src` each time makes reading
  quadratic. Read line by line and stop where the block ends (see the numbered list's
  `ORDERED_LIST_SCAN_WINDOW`).
- **A tokenizer's `raw` must be exactly the text it took,** including its line end and the blank
  lines after it, as `marked`'s own blocks have them. The source map finds each token by its
  `raw`, and blank lines are counted from it.
- **`\s` matches a non-breaking space.** An empty paragraph is written `&nbsp;`; trimming with
  `\s` eats it. Trim with `[ \t\n]`.
- **Notes are untrusted.** Nothing read from a note is rendered as HTML or loaded from the
  network (`docs/security/untrusted-content.md`). A new node keeps to that, and gets a case in
  "untrusted content" and "untrusted content through a save".

## How to

### Add or change an element

Follow "Extending it" in `docs/editor.md`. In short: a TipTap node or mark, a `MarkdownRule`
exported beside it, a line in `DOCUMENT_RULES` (order matters), a round trip case, and, if it
has more than one spelling, a marker. Then the note format's table in `docs/editor.md` and the
user docs (`website/src/content/docs/docs/notes.mdx`) if users can see it.

### Add a marker

1. Add the type to `MARKUP_TYPES` (`markup.ts`).
2. In the rule's `parse`, read the marker from the token's `raw` and set it with `withMarkup`.
   Null means the editor's own spelling.
3. In `render`, read it with `markupOf` and use it only where it still reads the same (a `~~~`
   fence not when a line of the code would close it).
4. Add a row to "keeping markers in an edited block" in `markdown.test.ts`, and a case where the
   marker must be dropped.

### Fix "it saved as something else"

1. **Reduce it.** Get the smallest text or document that shows it. `normalizeMarkdown(text)`
   (read, then write in the editor's spelling) and `parseMarkdown(text)` need no editor; call
   them from a throwaway test.
2. **Decide whose fault it is.** Write the text twice: `once = normalize(text)`,
   `twice = normalize(once)`.
   - `parseMarkdown(text)` is wrong for valid markdown: a **reading** fault. Fix `parse`, a
     tokenizer or `parser.ts`.
   - `once` does not read back as the document `text` gave: a **writing** fault. Fix `render` or
     `serializer.ts`.
   - Both read fine but a save after an edit is wrong: a **keeping** fault (below).
3. **Write the case first,** in "writing what reads back the same" (`markdown.test.ts`), using
   `expectRoundTrip` for a text that must come back unchanged.
4. **Fix it, then run the wide checks** ("Testing"): a fix to a list or to escaping often moves
   another case.
5. **List it** in `docs/editor.md` if the text the editor writes for existing notes changes.

### Change escaping

Text is escaped in `serializer.ts` (`encodeText`, `relaxEntities`, `escapeLineStart`). The aim
is to escape only what would read as markup, so "A & B" and "x < y" stay as typed. For a new
case, find where `marked` gives the character a meaning, escape exactly there, and add both
directions to the test: the text that needs the escape, and a near miss that must stay as it is.
Run the property tests at 10,000 cases afterwards; they generate every character markdown gives
a meaning.

### Work on a save that keeps text (`keeping.ts`)

- `diffBlocks` matches the document's top-level blocks with the loaded ones (longest common
  subsequence, `Node.eq`). A block that matches is kept with its slice.
- `Keeping.write` puts kept slices and newly written blocks together, with the loaded text
  between them where both neighbours are kept.
- The result is read back around what was written (`regionsOf`, `regionReads`) and compared with
  the document. On a mismatch it tries again, each time keeping less: blank lines around new
  blocks, then the editor's spelling for them, then the whole document.
- **Never remove or narrow the read-back.** It is what makes keeping safe. If it is too slow,
  make the region smaller, not the check weaker; `check: 'both'` (used by the corpus run) compares
  the region check with a whole read-back and reports any save where they disagree.
- A new way for a kept slice to mean something else beside a new block (a lazy line, a list
  joining, indented code) belongs in the region check, with a case in `markdown-keeping.test.ts`.

## Finding out what happened

| Question                                 | Where to look                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Why does this note have no source map?   | `readMarkdown(text).reason`: an `UnmappedReason` (table in `docs/editor.md`, "The source map")                  |
| Why did a save rewrite the whole note?   | `editor.storage.documentMarkdown.wholeWrites`: counts by reason, such as `no-source:mixed-line-ends`            |
| What did the editor load, and from what? | `editor.storage.documentMarkdown.loaded` (`text`, `source`, `reason`, `doc`)                                    |
| Is the editor in a failed state?         | `editor.storage.documentMarkdown.problem` (`unreadable`, `unsaveable`); `RichTextEditor` shows a toast for each |
| What does this text read as?             | `parseMarkdown(text)`                                                                                           |
| What would the editor write for it?      | `normalizeMarkdown(text)`, or `editor.getMarkdown()`                                                            |
| Which slice of the text is this block?   | `readMarkdown(text).source.blocks[i]` (`from`, `to`, `nodes`)                                                   |

Whole-document writes are logged by their reason only, never with a note's text.

## Testing

| Suite                                                        | What it holds                                                          | Run                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tests/editor/markdown.test.ts`                              | round trips, markers, the source map, saves, untrusted content         | `npm test -- markdown.test`                                                         |
| `tests/editor/markdown-keeping.test.ts`                      | every block of every real-world fixture edited, removed, added after   | `npm test -- markdown-keeping`                                                      |
| `tests/editor/markdown-properties.test.ts`                   | generated documents and texts (`fast-check`)                           | `npm test` runs 300; `MARKDOWN_PROPERTY_RUNS=10000 npm test -- markdown-properties` |
| `tests/editor/rich-text-editor.test.ts`, `clipboard.test.ts` | the editor: load, edit, undo, outside changes, paste, copy             | `npm test -- rich-text-editor clipboard`                                            |
| `tests/editor/corpus/` (skipped by `npm test`)               | real files: nothing lost, stable spelling, how often a save keeps text | `npm run markdown:corpus -- docs node_modules <your notes>`                         |
| the same folder                                              | timings on notes of 150 to 3,000 lines                                 | `npm run markdown:perf`                                                             |
| `e2e/flows/note-file.spec.ts`                                | a file on disk through open, leave and edit                            | `npm run e2e`                                                                       |

`npm test` runs on Electron's Node; if better-sqlite3 fails to load, run `npm run postinstall`.

**After any change to a rule, a tokenizer, the serializer or keeping,** run, besides `npm test`:

1. `MARKDOWN_PROPERTY_RUNS=10000 npm test -- markdown-properties`. A failure prints the smallest
   document that breaks; turn it into a case in `markdown.test.ts`.
2. `npm run markdown:corpus -- docs node_modules`, and on real notes if you have some. In the
   report, every count under `problems` must be 0 and `unstableSpelling` must be 0. `wroteWhole`
   and `unwritableAnyway` are not faults, but a jump in either means a change made keeping worse.
3. `npm run markdown:perf` if you touched a tokenizer, the parser or keeping. The budget is in
   `docs/performance.md` ("The editor's markdown").

**Writing a case.** A text the editor must give back unchanged: `expectRoundTrip(text)`. A text
from elsewhere that the editor respells: `expect(normalizeMarkdown(text)).toBe(…)`. A save:
`serializeKeepingSource(text, editedDoc)`. A new kind of content needs a round trip case, a
keeping case and, with more than one spelling, a marker case.

**Things that waste an hour:**

- Vitest hides `console.log`. Write what you want to see to a file from a throwaway test.
- Under jsdom `import.meta.url` is not a `file:` URL. Load fixtures with `import.meta.glob`.
- A test that types into the editor must go through the view's `handleTextInput` for input
  rules to run; dispatching `insertText` alone skips them.
- React node views (the image and entity chips) are not drawn synchronously in tests; select the
  wrapper (`.node-imageLink`), not what the view draws.

## Upgrading what it stands on

**`marked`** (`^17.0.6`; the lockfile fixes the version). The layer relies on things an upgrade
can move without a type error:

- every token's `raw` being its exact source text, with trailing blank lines;
- the token types and fields the rules read (`list.items`, `list_item.tokens` with `text` tokens
  in a tight item, `code.codeBlockStyle`, `br`, block `html` with `block: true`, `def`);
- `lexer.tokens.links` for reference definitions, and a repeated definition giving no token;
- extensions running last-added first, and `start` deciding where text stops;
- no emphasis being read between `<` and the next `>`.

On an upgrade: run `npm test`, the properties at 10,000, and the corpus run, and read the
changelog for the tokenizer and for lists. Treat any change in the corpus numbers as a finding.

**TipTap and ProseMirror.** The layer reads the schema only: node and mark names, which hold
code (`spec.code`), and the order of marks (which nests outside which). A renamed node, a changed
`content` expression (a list item is `paragraph block*`, so its first child is always a
paragraph) or a new default attribute can change what a rule must write. After an upgrade run
the same three checks. Never reach for an internal: if the public API can't do it, the layer does
it itself.

**`fast-check`** and any other dependency follow `docs/security/dependencies.md` (a version at
least two weeks old).

## Decisions and known limits

Decided, with the reasoning in the plan. Don't undo one as a drive-by fix.

- **The top-level block is the grain.** Editing one item rewrites its whole list, in the editor's
  spelling with its markers. Finer grain (items, rows) is not built.
- **A numbered list is digits only** (`1.`, `2)`), as typing makes one and as GitHub reads it.
  No `a.` or `iv)`.
- **A heading is written on one line.** An underlined heading keeps its underline only while
  its text has no blank line.
- **Pasted markdown comes in without its markers:** the pasted text isn't the file's.
- **Indented code has no marker.** Rewritten, it is fenced.
- **A text with mixed line ends, a lone `\r`, or a definition inside another block has no
  source map,** and is written whole on its first edit.
- **Bare web and email addresses read as links,** as on GitHub.

Known and not fixed:

- A mark that ends inside a word next to another (`~~a*b*~~c`) does not read back.
- A `|` in a paragraph line above a line of `-`s and `|`s would read as a table.
- A code block can't be made inside a list item by typing a fence or "Turn into" (the item must
  start with a paragraph); one read from a file is shown and saved correctly.
- `stripMarkdown` in the main process reads notes for previews and search with its own patterns,
  not with this layer.

## Before you open a pull request

- [ ] The change has a case that failed before it, in the right suite.
- [ ] `npm test`, `npm run typecheck:node`, `npm run typecheck:web`, `npm run lint`,
      `npm run format:check`.
- [ ] Properties at 10,000 cases; the corpus run, with every problem and `unstableSpelling` at 0;
      timings if reading or keeping changed.
- [ ] `npm run e2e` if the save path, `RichTextEditor` or the autosave hook changed.
- [ ] `docs/editor.md` says what changed: a new difference in what is read or written, a new
      reason, a new marker, new corpus numbers.
- [ ] If users can see it: `website/src/content/docs/docs/notes.mdx`, then `npm run check` and
      `npm run build` in `website/` (CLAUDE.md, "Keeping it in step with the app").
- [ ] No import of a TipTap or `marked` internal, and nothing outside the layer reaching into
      `editor.storage.documentMarkdown.codec` for what a method could give.
