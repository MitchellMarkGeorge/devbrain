# Markdown layer: implementation plan

DevBrain's notes are markdown files, and the editor must treat them as the user's files: opening
one changes nothing, and saving one rewrites only what the user changed. This plan takes the
markdown layer (`src/renderer/editor/markdown/`) from its first step, parity with
`@tiptap/markdown`, to a first-class layer that keeps each file's own text, and through what it
needs to be production ready.

> **Status:** milestones 0 to 5 are built: parity (PR #256), the source map (#257), saving what
> was read (#259), markers in edited blocks (#260), production hardening (#261) and finishing.
> A save rewrites only the blocks that changed, those keep their markers, the editor's own
> spelling reads back as what it wrote, and the layer is checked on generated cases, on a corpus
> of real files and end to end. What is left is optional (milestone 5, "Left for later"). The
> reference for the layer as built is `docs/editor.md` ("The markdown layer", "The source map",
> "What a save changes", "When reading or writing fails", "Checking it on real files"); this
> plan is kept for the reasoning and the steps.

## Goals

1. **Opening a note never changes it.** Already true: `RichTextEditor` sends the stored text while
   the content is what it loaded. This plan keeps that true while it replaces the mechanism.
2. **A save rewrites only the blocks that changed.** Every other top-level block is written back
   byte for byte, with the text around it (blank lines, definitions, line ends).
3. **An edited block keeps its spelling** where markdown has more than one (`*` bullets,
   `__bold__`, `~~~` fences, setext headings, …), unless that spelling would read differently.
4. **What is saved always reads back as what the editor holds.** Keeping text is never allowed to
   change meaning; when it would, the layer writes the editor's own spelling instead.
5. **No private or undocumented TipTap API**, and only `marked`'s public API. TipTap keeps the
   schema and editing; the conversion is ours.

## Non-goals

- Keeping spelling **inside** an unedited part of an edited block below the block level (a list
  of 50 items with one edited is rewritten whole in the editor's spelling, with its markers). Finer
  grain is a possible follow-up (milestone 5), not a requirement.
- Following a file edited on disk by another app (nothing watches note files; `docs/editor.md`).
- A different markdown dialect. The format stays GFM plus the tags and syntax `docs/editor.md`
  lists ("The note format").
- Moving markdown parsing to the main process. `stripMarkdown` (main) stays as it is unless
  milestone 5's optional item is taken up.

## Decisions

| Area           | Decision                                                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser         | `marked` 17, our own `new Marked({ gfm: true })` (`lexer.ts`), tokenizers fixed at creation. Chosen over markdown-it (and `tiptap-markdown`, which builds on it) because notes already read with `marked`, and its tokens' `raw` gives exact character slices; markdown-it's `map` gives line ranges only. |
| Schema         | TipTap's, built by `createDocumentExtensions()`. The layer reads it for mark order and which nodes and marks hold code, nothing else.                                                                                                                                                                      |
| Rules          | One table, `DOCUMENT_RULES` (`rules/index.ts`): per node or mark, the token it reads, `parse`, `render`, an optional tokenizer. Markers (milestone 3) are part of each rule, not a wrapper around it.                                                                                                      |
| Granularity    | The top-level block: each child of the document maps to the slice of the text its token was read from.                                                                                                                                                                                                     |
| Block identity | A block is kept when it is equal (`Node.eq`, schema nodes) to a block that was loaded, matched in order (longest common subsequence over the top-level children).                                                                                                                                          |
| Safety         | Every save that keeps text is checked by reading it back; a mismatch falls back to a whole-document write in the editor's spelling. The fallback is always correct, and is logged by its reason only.                                                                                                      |
| Line ends      | Read as `\n` (marked normalises `\r\n`); written back with the file's own when the file used one kind throughout.                                                                                                                                                                                          |
| Where it runs  | The renderer, synchronously, on the editor's save path (`onChange`, debounced by `useEditorAutosave`).                                                                                                                                                                                                     |
| Loading        | Always as JSON through TipTap's public `setContent` / the editor's first `content`.                                                                                                                                                                                                                        |

## The layer as it stands (milestone 0)

```
markdown ──marked (lexer.ts)──► tokens (each with raw) ──parser.ts + rules──► JSON ──setContent──► editor
editor.getJSON() ──serializer.ts + rules──► markdown
```

- `codec.ts`: `MarkdownCodec` (parser + serializer for one schema), `parseDocument`.
- `extension.ts`: `DocumentMarkdown`: `editor.getMarkdown()`, `editor.storage.documentMarkdown.codec`,
  `contentType: 'markdown'` for the first content and `setContent`.
- `RichTextEditor.tsx`: at milestone 0, a baseline (`{ value, markdown }`) that sent the stored
  text while the content still serialised to what it loaded (replaced in milestone 2).

Parity was checked against `@tiptap/markdown` on the real-world fixtures, `docs/` and 852 READMEs
(commit `accded7` holds the test). Two deliberate differences are documented in `docs/editor.md`.

## What must be supported

The complete inventory. Each row says what reading, writing and keeping must do. "Kept" means
the slice is written back exactly when the block is unchanged; "markers" means an edited block
keeps its spelling (milestone 3).

### Blocks

| Syntax                                        | Node                     | Read (today) | Kept (M1–2) | Markers (M3)                                               |
| --------------------------------------------- | ------------------------ | ------------ | ----------- | ---------------------------------------------------------- |
| Paragraph, lazy continuation lines            | `paragraph`              | yes          | yes         | –                                                          |
| ATX heading `#`–`######`, closing `#`s        | `heading`                | yes          | yes         | closing `#`s kept                                          |
| Setext heading (`===`, `---` underline)       | `heading`                | yes          | yes         | `setext` and the underline as written                      |
| Thematic break `---`, `***`, `___`, spaced    | `horizontalRule`         | yes          | yes         | the line as written                                        |
| Fenced code ` ``` `, `~~~`, longer fences     | `codeBlock`              | yes          | yes         | fence character and length; info string after the language |
| Indented code (4 spaces)                      | `codeBlock`              | yes          | yes         | – (fenced once edited; see milestone 3)                    |
| Blockquote, nested                            | `blockquote`             | yes          | yes         | –                                                          |
| GitHub alert `> [!NOTE]` …                    | `callout`                | yes          | yes         | –                                                          |
| Bullet list `-`, `*`, `+`, tight and loose    | `bulletList`/`listItem`  | yes          | yes         | bullet character; new items take the list's                |
| Numbered list `1.`, `1)`, start (digits only) | `orderedList`/`listItem` | yes          | yes         | `)` delimiter                                              |
| To-do list `- [ ]`, `- [x]`, `* [ ]`          | `taskList`/`taskItem`    | yes          | yes         | bullet character; `X` vs `x`                               |
| Mixed to-do and bullet list                   | split into lists         | yes          | yes         | each part keeps its bullet                                 |
| GFM table, alignment, `\|` in code            | `table`…                 | yes          | yes         | – (an edited table is padded)                              |
| `<details>`/`<summary>`, `open`, nested       | `details`                | yes          | yes         | –                                                          |
| Other block HTML, comments                    | `rawHtmlBlock`           | yes          | yes         | – (atomic; never edited in place)                          |
| Link reference definitions `[x]: url "t"`     | none                     | yes (links)  | yes         | –                                                          |
| Blank lines beyond one                        | empty `paragraph`s       | yes          | yes         | –                                                          |
| Text before the first block / after the last  | none or empty paragraphs | yes          | yes         | –                                                          |
| Final newline, or none                        | none                     | –            | yes         | –                                                          |

### Inline

| Syntax                                           | Node / mark               | Markers (M3)                                 |
| ------------------------------------------------ | ------------------------- | -------------------------------------------- |
| `**bold**`, `__bold__`                           | `bold`                    | `__`                                         |
| `*italic*`, `_italic_`                           | `italic`                  | `_`                                          |
| `~~strike~~`, `~strike~`                         | `strike`                  | single `~`                                   |
| `` `code` ``, longer runs, padding               | `code`                    | – (fence chosen from the text, as today)     |
| `[text](url "title")`, `<url>`, bare URL, `www.` | `link` (`form` attribute) | form kept (today); title quote style         |
| Reference links `[text][ref]`, `[ref]`           | `link`                    | the reference form (needs the definition)    |
| `![alt](src "title")`                            | `imageLink`               | –                                            |
| `[label](devbrain://type/id)`                    | `entityLink`              | –                                            |
| `<u>`, `<kbd>`, `<sub>`, `<sup>`                 | marks                     | –                                            |
| `<br>`, two trailing spaces, `\` line end        | `hardBreak`               | `\` and `<br>` outside tables                |
| Other inline HTML (tags, comments, `<?…?>`)      | `rawHtmlInline`           | –                                            |
| Backslash escapes, entities                      | text                      | – (escaping as today, "What a save changes") |

Reference links and the `form` of a link are the one inline case that touches keeping: a kept block
that uses a definition only reads as a link while the definition is in the file (milestone 2).

### Behaviours around the text

- **Line ends:** `\n` and `\r\n`; mixed line ends, and any lone `\r` (which `marked` also reads
  as a line end), get no map (whole-document write).
- **Byte-order mark:** kept like any other character of the first block's slice; no special
  handling. A note's file starts with its front matter, which main takes off
  (`notes.readContent`), so a mark there never reaches the editor. A text that does start with
  one (a description from a provider) reads today with the mark as text (`\uFEFF# T` is a
  paragraph, not a heading); stripping it would change how such a text reads, so it is left
  alone.
- **Tabs and indentation** inside kept slices are untouched; edited blocks use the editor's.
- **Trailing whitespace** inside kept slices is untouched (it can be meaningful: `  ` breaks).
- **Undo:** undoing back to the loaded content writes the loaded text exactly, by the same rule
  (every block kept), so the baseline special case in `RichTextEditor` goes.
- **Load from outside** (`RichTextEditorHandle.load`): the map is rebuilt from the same parse that
  makes the document; text is never read twice.
- **Clipboard:** copy writes the selection in the editor's spelling (no map; markers stripped).
  Paste reads markdown as today; pasted blocks are new blocks (no markers kept from the paste in
  milestone 3: decide in milestone 3, see open questions).
- **Read-only editors** (synced descriptions) never save, but load and `markdown()` must still
  hold the text exactly.
- **Untrusted content** rules are unchanged (`docs/security/untrusted-content.md`): keeping text
  never renders anything new.

## Milestones

Each milestone lands as its own PR with code, tests and `docs/editor.md` together, and keeps
every existing test passing unchanged unless the milestone says which expectation changes and
why.

### Milestone 1: the source map (built)

Know, for a loaded text, which slice of it each top-level block was read from. `docs/editor.md`
("The source map") describes it as built; this section keeps the steps and what turned out
different from the plan.

1. **Parser output with tokens.** `MarkdownParser.read(markdown)` returns the document, the text
   with `\n` line ends, the lexer's `links` and, per top-level token, `{ token, from, to, nodes }`:
   the token's offsets in that text and the JSON nodes it produced (none for a definition or a
   space token's separator, several for a list split by `parseList`, empty paragraphs for blank
   lines). `parse()` is `read().doc`. Offsets come from finding each token's `raw` in the text,
   from the end of the token before it. The raws do **not** always concatenate to the text:
   `marked` reads a link definition whose label is already defined and emits no token for it
   (GitHub's `[//]: # (…)` comments, in `github-pr-body.md`; 3 of 1,067 files checked). Where the
   text at the cursor is not the next raw, the gap before it (and the one after the last token)
   is read on its own: it must be nothing but definitions and blank lines, which are added as
   tokens marked `repeated`, so the tokens cover the text end to end. Anything else in a gap
   gives `tokens: null`, and no map.
2. **Blank lines.** `extractAbsorbedBlankLines` moves a block's trailing blank lines into a space
   token: offsets are computed after it. A block's slice ends at its last non-blank line, before
   that line's end, so the line end and the blank lines are "between" text. Empty paragraphs
   made from a space token have no slice: they are matched as empty paragraphs (equal to any
   other), and written as blank lines.
3. **`MarkdownSource`** (`source.ts`), built from `read()`'s output and the schema
   (`schema.nodeFromJSON` per node, so blocks compare with `Node.eq`):

   ```ts
   interface MarkdownSource {
     text: string; // as loaded; every offset is into it
     lineEnd: '\n' | '\r\n';
     blocks: ({ from: number; to: number; nodes: ProseMirrorNode[] } | null)[];
     between: string[];
     definitions: Definition[]; // { from, to, label, href, title, first }
   }
   ```

   `blocks` follows the document's top-level nodes; `null` is one empty paragraph from blank
   lines. `between[i]` is the exact text before the i-th block that has a slice, and the last
   entry the text after the last one.

4. **No map** (`source: null`, with a `reason`) when the text can't be lined up: line ends that
   mix `\r\n` and `\n`, or a lone `\r`; a definition inside a quote, a list item, a callout or a
   collapsible section (a label in the lexer's `links` with no top-level `def` token that
   defines it first); a gap that holds anything but definitions (step 1); a block that reads as
   no node; a text that reads as no blocks. Blocks are not validated with `check()`: a paragraph
   that holds only an image reads as a bare `imageLink` at the top level, and keeps its slice
   (milestone 4 decides whether to make it a paragraph).
5. **Codec API:** `codec.read(markdown): { doc, source, reason }`, with `parseDocument` built on
   it, and `readMarkdown` (`index.ts`) for the document schema without an editor.

**What turned out different from the plan:**

- **A block holds `nodes`, not `node`.** A list split by `parseList` is one token and one slice
  but several top-level nodes, and its parts can't be sliced apart safely (whether a list is
  loose is decided over the whole list). The slice is kept when all of its nodes are, in order.
- **`between` counts only blocks that have a slice.** An empty paragraph from blank lines has no
  text of its own to stand between; it lies in the `between` of the slices around it.
- **Offsets are into the text as loaded,** not the `\n` text, so a slice of a `\r\n` text holds
  `\r\n` and the pieces concatenate to the file as it is. Milestone 2 converts only the markdown
  it writes anew, not the whole output.
- **A slice excludes blank lines before it too.** The to-do list's tokenizer takes the blank
  lines before the list into its `raw` (so extra blank lines above a to-do list read as no empty
  paragraphs, as they always have).
- **The lexer's `links` are not kept in the source.** `definitions` carries each definition's
  label, target, title and whether it is the label's first, which is everything `links` holds
  once every label is known to be defined at the top level.
- **Three more reasons for no map** than planned: `unread-token`, a block that gives no node
  (found on the corpus: a fenced code block indented one to three spaces reads as nothing and is
  lost on save, inherited from TipTap's code block rule and left as it is for now, see
  milestone 4; its text must not become "between" text, which a save would drop without
  noticing); `invalid-node`, a node `nodeFromJSON` refuses;
  and `no-blocks`, the text `parseDocument` shows as a paragraph of its lines (an empty text
  included).
- **No block read differently alone.** Every block of the fixtures and of the corpus (32,931)
  reads as the same node when sliced out, given the first definitions appended for its reference
  links. Known cases that do read differently, none of them in the corpus: a fence never closed
  whose code ends in blank lines (the code holds them, the slice doesn't), and anything that
  depends on its neighbour (indented code after a paragraph, a lazy line).
- **Parity was checked against the layer before this change,** not `@tiptap/markdown`, which is
  no longer installed: `parse()` gives byte-identical JSON on every corpus file, with `\n` and
  with `\r\n`.

Tests (`markdown.test.ts`, `describe('reading the source')`): the slices and the text between
them concatenate to the text, for every fixture with both line ends and for a label defined
twice; each fixture's blocks read alone give the same node; an editor that loaded a fixture holds
the map's blocks (`Node.eq`); blank lines, an image-only paragraph, a split list and a to-do list
after blank lines map as above; no map for mixed line ends, a lone `\r`, a nested definition and
a text of no blocks.

Corpus (`docs/` and the `README.md` files under `node_modules`, 1,067 files): 1,060 have a map
whose pieces concatenate to the text (three of them with a label defined twice); 7 have none:
5 mix line ends, 1 defines its labels inside a collapsible section, 1 has an indented fence.

### Milestone 2: saving what was read (built)

Write a document keeping every unchanged block's slice. `docs/editor.md` ("What a save changes")
describes it as built; this section keeps the steps and what turned out different.

1. **Matching.** `writeKeeping(codec, doc, source)` (`keeping.ts`; `codec.writeKeeping` and
   `codec.serializeKeeping`) matches the document's top-level children against the source's
   blocks in order: the common prefix and suffix first (an edit usually leaves all but one
   block), then a longest common subsequence on `Node.eq` over what is left (skipped above
   250,000 pairs, where the stretch is written anew). Empty paragraphs match blank-line runs. A
   block with several nodes (a split list) is kept only when all of them match, in a row. A
   matched block is **kept**; an unmatched one is **new** (edited, added or moved).
2. **Writing.** Walk the document:
   - two kept blocks that were neighbours in the source, with nothing between them in the
     document but the empty paragraphs read from the blank lines between them: the source's
     `between` text, then the slice;
   - a new block where the source had another: the source's text on each side of it (so
     `### Notes` straight above a list stays so when the list changes);
   - a new block between two neighbours: a blank line each side (the definitions between the
     two, if any, stay before it);
   - kept blocks brought together by a removal: a blank line, or the definitions that stood
     next to one of them;
   - the text before the first block and after the last, when those blocks are kept or
     rewritten in place; the file's final newline; its line ends (slices and `between` text hold
     the file's own, and markdown written anew is converted).
3. **The check.** What was written is read back whole and compared with the document, block for
   block. A mismatch writes it again with a blank line around every new block, and a second
   mismatch writes the whole document in the editor's spelling.
4. **Definitions.** A definition is kept with the `between` text that held it. A first
   definition whose text was not written, and whose label no written definition defines, is
   written at the end of the text.
5. **The editor.** `DocumentMarkdown` keeps `loaded` in its storage (the text, its source map,
   the document it loaded as), set for the first content and by `setContent` with
   `contentType: 'markdown'`. `editor.saveMarkdown()` gives the loaded text
   while the document is the one loaded, and `codec.serializeKeeping` otherwise.
   `RichTextEditor`'s `markdown()` and `onChange` use it; `Baseline` and `markdownOf` are gone.
   `editor.getMarkdown()` stays the editor's own spelling.
6. **`useEditorAutosave`** needed no change.

**What turned out different from the plan:**

- **A new block is checked against how it reads alone, not against the editor's node.** The
  editor holds blocks that don't read back as they are, all the time: a paragraph being typed
  ends with a space, a heading has no text yet, two lists side by side read as one. Comparing
  the output with the document itself would fail on each of them and write the whole document,
  mid-typing. So the check expects a kept block to read as itself, and a run of new blocks to
  read as the editor's spelling of that run reads on its own: keeping never changes how new
  blocks read, whether or not they round-trip.
- **No separate seam checks.** The whole-output check covers the seams, and falls back in two
  steps (blank lines around new blocks, then the whole document). A check of only the edited
  region is milestone 4's performance work.
- **The loaded document is kept beside the map.** `saveMarkdown()` returns the loaded text when the
  document equals the one loaded. Every block kept gives the same text for a text with a map,
  but a text without one (mixed line ends, only definitions) must also come back exactly when it
  is opened or undone to, as `Baseline` ensured.
- **`setContent` and the first content hold an image-only paragraph differently:** the first
  content holds the bare `imageLink` the parser gives, `setContent` wraps it in a paragraph.
  Keeping compares both as the paragraph, and `loaded.doc` is the transaction's document.
- **A label defined twice, differently, is not refused up front.** The definitions stay where
  they are while their text is kept; if the first one's text goes and a link would read with the
  second, the check fails and the document is written whole.
- **Definitions beside a removed block stay in place** where the text holding them stood next
  to a kept block, rather than all moving to the end.
- **The markdown to store is `editor.saveMarkdown()`,** a method on the editor beside
  `getMarkdown()`, where the plan had it in the extension's storage: a caller need not know
  which extension holds it.
- **Moved blocks are new,** as planned (matching is in order); the prototype kept them.
- **`rich-text-editor.test.ts` changed one expectation:** after an edit `onChange` hears
  `* one\n* two\n\n**bold** & <b>raw</b>!`, the list as stored, where it heard the whole
  document in the editor's spelling.

Tests: `describe('saving what was read')` in `markdown.test.ts` (the prototype's cases, with
blocks typed in, a block the editor writes as nothing, and the reasons for a whole write);
`markdown-keeping.test.ts` (every block of every fixture edited, removed and followed by a new
one, with `\n` and `\r\n`); `rich-text-editor.test.ts` (an edit rewrites only its block, through
a new paragraph and Windows line ends; undo gives the stored text; a text loaded through the
handle; a text with no map).

Corpus (`docs/` and the `README.md` files under `node_modules`; in each of the 1,060 files with
a map, up to eight blocks edited, removed and followed by a new one): 19,588 saves, 19,530 kept
text and 58 wrote the whole document (5 where the only block changed, 53 where the check failed:
42 a removal that brought two lists together, the rest two code blocks or two paragraphs brought
together). None read back as anything but the document, where the editor's own spelling of it
does. Unedited, every file is written as its text. A save took 2.3 ms on average and 178 ms at
most (the longest README), unoptimised: milestone 4's budget applies.

What milestone 3 should know: a new block's markdown comes from `codec.serialize` of its run
(`Keeping.write`), which is where a block's markers would be written; `readAlone` is where "does
it read the same with its markers" belongs. Inherited, and now confined to the edited block: a
linked image (`[![badge][img]][url]`) reads as the image alone, so editing its paragraph drops
the link.

### Milestone 3: markers in edited blocks (built)

An edited block keeps the spelling it was read with. `docs/editor.md` ("What a save changes")
lists the markers as built; this section keeps the steps and what turned out different.

1. **The attribute.** `DocumentMarkup` (`markup.ts`) adds a `markup` attribute (default `null`,
   `rendered: false`, `keepOnSplit: true`, `parseHTML: () => null`) to the nodes and marks that
   have markers (`MARKUP_TYPES`), through `addGlobalAttributes`. `null` is the editor's own
   spelling. It is one of `createDocumentExtensions()`.
2. **In the rules.** Each rule with a marker reads it in `parse` and writes it in `render`;
   there is no wrapper. `marked`'s own tokens carry it in `raw`. The to-do list's tokenizer and
   `parseList` put `bullet` and `checkedMark` on each to-do item's token, and the numbered
   list's tokenizer puts `delimiter` on the list's. A list's marker is on the list, and an item
   is written with its list's, so an item added with Enter takes it.

   | Node / mark      | `markup`                                 | Read from              |
   | ---------------- | ---------------------------------------- | ---------------------- |
   | `bulletList`     | `*` or `+`                               | the first item's raw   |
   | `taskList`       | `*` or `+`                               | the first item's token |
   | `orderedList`    | `)`                                      | the tokenizer's token  |
   | `taskItem`       | `X` (checked written in capitals)        | the item's token       |
   | `heading`        | `setext:<underline>` or its closing `#`s | the heading's raw      |
   | `horizontalRule` | the line                                 | the token's raw        |
   | `codeBlock`      | the fence (`~~~`, ` ```` `)              | the token's raw        |
   | `bold`, `italic` | `__`, `_`                                | the token's raw        |
   | `strike`         | `~`                                      | the token's raw        |
   | `hardBreak`      | `\` or the tag (`<br>`, `<br/>`)         | the token's raw        |

3. **Checked on write.** `Keeping.withSafeMarkup` (`keeping.ts`): a new block that holds any
   `markup` is written with it and read back alone; if that reads as neither the block nor the
   editor's own spelling of it, it is written with its markup stripped. A save then tries, in
   turn: the source's text around new blocks and their markers; a blank line around them and
   their markers; a blank line and the editor's spelling; the whole document. The whole-output
   check decides each (a `*` list put next to another `*` list would join it).
4. **Where the editor's spelling is used:** new content (the attribute is null), a document
   written whole for want of a map or after a failed check, the clipboard (copy, and paste: pasted markdown is read without its markers),
   `editor.getMarkdown()`, `serializeMarkdown()` and `normalizeMarkdown()`. `codec.serialize`
   strips markup; `codec.serializeWithMarkup` writes it.
5. **Schema impact.** `getJSON()` has `markup: null` on those nodes and marks; `parse()` gives
   the attribute only where the text used a marker. No test that compares JSON needed changing.

**What turned out different from the plan:**

- **A marker is safe when the block reads as itself with it, or as the editor's spelling
  reads.** The plan compared with the block alone, which a block being typed fails whatever its
  markers (`word ` loses its space), and comparing with the editor's spelling alone refuses a
  marker that is more right than it: a fence of four backticks around code that holds a line
  of three, which a fence of three would close early (an inherited fault of the editor's
  spelling, see below).
- **Each rule also checks its marker can stand** (an underline only under one line of text of
  its level, a fence no line of the code closes), so most cases never reach the read-back.
- **A note whose every block changed keeps its markers.** Milestone 2 wrote it whole in the
  editor's spelling (`nothing-kept`); a note of one `*` list would have lost its bullets on the
  first edit. It is now written anew with its blocks' markers, the file's line ends and its
  final newline. A text with no map, and one whose check failed, are still written in the
  editor's spelling.
- **Pasted markdown takes no markers** (the open question): it isn't the note's text. The
  clipboard reads and writes through two methods on the editor, `markdownToContent` (which
  strips the markers) and `contentToMarkdown`, in place of the codec in the extension's
  storage, so that rule is in one place.
- **A line break in a table cell has no marker:** it is always `<br>` there.
- **Indented code has no marker.** It was built (`indented` on `codeBlock`, written back as
  four spaces a line) and taken out again: `@tiptap/markdown` never wrote indented code either,
  the editor never makes any, and it only matters when such a block from outside is itself
  edited. An indented block is kept as written while it is unchanged (milestone 2) and fenced
  once edited. To bring the marker back: read `codeBlockStyle === 'indented'` in `codeBlock`'s
  `parse`, and in `render` indent each line four spaces only when the block has no language,
  its code starts and ends with a line of text, and it is not in a list item (there the editor
  writes code on the line after the item's text, where four more spaces read as that text).
- **Two expectations changed,** both to the stored spelling: `rich-text-editor.test.ts`'s edit
  now sends `__bold__ & <b>raw</b>!`, and a block moved past another is written `__Two__`.

Tests: `describe('keeping markers in an edited block')` in `markdown.test.ts` (a case per marker:
read, edited, written back, with both line ends; markers that would misread; nested lists;
`mixed-spellings.md` with each block edited) and `rich-text-editor.test.ts` ("writes an item
added to a list with the list's own bullet").

Corpus (`docs/` and the `README.md` files under `node_modules`): `parse()` gives the JSON it
gave before but for the `markup` attribute, and `normalizeMarkdown` the same text, on every file
with both line ends. Of the 19,585 saves of milestone 2's run, 313 edited a block that held
markers and kept its text: 312 kept every marker, one was written in the editor's spelling. The
whole-document writes are the same 58.

Found on the way, inherited and left for milestone 4: the editor's spelling fences code with
three backticks whatever the code holds, so a code block with a ``` line in it is written
wrongly unless it was read with a longer fence (which it now keeps).

### Milestone 4: production hardening (built)

`docs/editor.md` describes each part as built ("When reading or writing fails", "Checking it on
real files", and the list of differences from `@tiptap/markdown`); `docs/performance.md` has the
timings. This section keeps the steps and what turned out different.

1. **Never lose text.**
   - `codec.read` catches a throw and shows the text as plain lines (`unreadable`), which
     `RichTextEditor` keeps read-only, with a toast. `codec.writeKeeping` catches one and writes
     the whole document (`whole: 'error'`). `editor.saveMarkdown` catches one from that too and
     gives what it gave last, with a toast, so nothing is stored over the last good text.
   - An empty numbered item (`1.` alone) has its empty paragraph, and can be written back.
   - **The image-only paragraph is a paragraph.** It was read as a bare `imageLink` among the
     document's blocks, an invalid document that `setContent` and the first content held
     differently. Keeping no longer has to treat the two alike.
   - **The indented fence is left as it is,** as decided in milestone 1 (it reads as nothing;
     `unread-token` when at the top level). The fix is in commit `9804a39`.
   - A code block is fenced with one more backtick than the longest run a line of it starts
     with.
   - The audit of the ports, and the property tests, found more: see "What turned out
     different".
2. **Properties** (`markdown-properties.test.ts`, `fast-check` 4.10.2): a generated document
   reads back as written, and is written the same twice; a generated text is written the same
   from its second writing on, saves unedited as it is, and saves any single block replaced,
   removed or added as the edited document with the rest of the text as it was. Each holds on
   10,000 cases; `npm test` runs 300.
3. **The corpus script:** `npm run markdown:corpus -- <folders>` (`scripts/markdown_corpus.mts`,
   over `tests/editor/corpus/markdown-corpus.test.ts`, which `npm test` skips).
4. **Performance:** on a 3,010-line note, read 29 ms (budget 100) and a save 4 ms (budget 20),
   from 132 and 105. `npm run markdown:perf`; `docs/performance.md`, "The editor's markdown".
   - Reading: the to-do list's and the table's tokenizers looked at the whole rest of the text
     at every block; each now looks at the lines it needs.
   - Saving: the source takes the document's own nodes for the blocks it keeps, so an unchanged
     block is told by identity from the second save on; and only the stretches around new blocks
     are read back (`Keeping.regionsOf`), each with the kept block on either side, the whole
     text only when a stretch does not read as expected.
5. **Logging:** `editor.storage.documentMarkdown.wholeWrites` counts the saves that wrote the
   editor's spelling, by reason (`no-source:mixed-line-ends`, `readback-mismatch`, `error`), and
   each reason is logged once an editor in development. Reasons only.
6. **Security:** `describe('untrusted content through a save')`: each untrusted construct (raw
   HTML, an iframe, inline HTML, an image, a refused link, a comment) is kept as written when a
   block beside it is edited, and renders nothing when its own block is written anew.
7. **End to end:** `e2e/flows/note-file.spec.ts`.

**What turned out different from the plan:**

- **The block-markdown cache was not needed.** Kept blocks are never serialised (their slices
  are copied), so there was nothing to cache; the cost was the read-back and comparing blocks.
- **The region check needed a second condition.** Reading a stretch on its own passed a case the
  whole text failed: a kept to-do list after a new bullet list is one list with it, and reads by
  the blank lines that follow it, which the stretch doesn't hold. A stretch is now trusted only
  when each kept block it starts or ends with is read from its own slice, as a block of its own.
  The property test found it; with that, `check: 'both'` finds no difference in 31,346 corpus
  saves and 10,000 generated ones.
- **The properties found faults the corpus and the cases had not,** all inherited from the
  ports, all fixed (each a deliberate change from `@tiptap/markdown`, listed in
  `docs/editor.md`):
  - a paragraph that starts with a short word and a full stop ("No. I think so", "Hi. there")
    was read as a numbered item, and saved as `1. I think so`: the word was lost. TipTap's
    numbered list read letters and roman numerals as numbers (`a.`, `iv)`), and any one or two
    letters with them. The list now reads digits only, with `.` or `)`: what GitHub reads, and
    what typing `1. ` in the editor makes. `a.` and `iv.` lists are paragraphs, and a lettered
    list from pasted HTML is written with numbers. (The first fix kept letters and roman
    numerals and refused only invalid ones, with paragraphs like `a) first` escaped on writing;
    reading what typing makes is simpler, and matches the note format being GFM.)
  - a paragraph that is `+` or `-` alone was written so that it read back as an empty list;
  - a heading whose text ends with `#` lost it, and one with a line end in its text was written
    as a heading and a paragraph.
- **The corpus run found that the editor's spelling was not stable** for 170 of 1,671 files
  (written whole twice, the second differed). Four faults made 143 of them, all fixed: a
  numbered item's wrapped lines kept one space of their indentation (the number's delimiter was
  not counted), a bullet's kept theirs when indented further, `<br>` at a line's end became a
  line break and a new paragraph, and spaces before a line break or at a paragraph's end came
  and went. 27 remain (milestone 5).
- **`fast-check` is pinned to 4.10.2,** the newest release over two weeks old
  (`docs/security/dependencies.md`).
- **Expectations that changed,** each for a fix above: an image-only paragraph's JSON and the
  DOM test beside it (ProseMirror's own empty `img` after an inline node that ends a paragraph);
  a mention's markdown no longer ends with the space typed after it; a paragraph being typed is
  saved without its last space.

Numbers (`npm run markdown:corpus -- docs node_modules`): 1,673 files, 1,663 with a map; 31,346
saves, none lost or changed text, 31,015 kept the text outside their block, 331 wrote the whole
document (317 a removal that brought its neighbours together, 10 a note whose only block
changed).

### Milestone 5: finishing and follow-ups (built)

1. **User-facing docs.** `website/src/content/docs/docs/notes.mdx` has said since milestones 2
   and 3 that only edited blocks are rewritten and keep the way they were written. This
   milestone adds one line: an image inside a link opens the link.
2. **The ports, tidied.** The comments no longer describe the code by the package it was ported
   from, and the faults the corpus run and the property tests had turned up are fixed, each
   listed in `docs/editor.md` ("The markdown layer", the differences from `@tiptap/markdown`)
   and covered in `markdown.test.ts` ("writing what reads back the same"):
   - a link around an image was dropped when its block was rewritten;
   - marks closed in the order a node lists them, not the reverse of the order they opened in
     (`<sub><sup>…</sub></sup>`, `**` outside its link);
   - only a paragraph's first line was escaped where it would start a block;
   - an item's wrapped lines were written at the list's indent, so one starting `#236` or
     `<https://…>` ended the item, and a table under wrapped lines left it;
   - text after a code block or a table in an item with no blank line was read as bare text
     (an invalid node), not a paragraph;
   - HTML in an item took the block written straight after it;
   - an empty item that holds a list (`- - item`) or a code block, and an empty item alone,
     were written `- ` and a line end, which reads as a paragraph;
   - two line breaks in a row, or `<br>` on its own line, were written as a blank line;
   - two lists of a kind side by side were written as one;
   - `<0 a **b** >` lost its bold, as `marked` reads no emphasis between `<` and `>`;
   - blank lines after a collapsible section were dropped.
3. **Left for later: finer grain.** Keeping unedited items of an edited list and unedited rows of
   an edited table (milestone 2 one level down). Not built: no one has asked, and the block
   level covers most edits.
4. **Left for later: one reader for main.** `stripMarkdown` (main) is unchanged. Moving the
   tokenizers to `src/common` is worth doing only if previews disagree with the editor.

**Numbers** (`npm run markdown:corpus -- docs node_modules`, 1,673 files, 31,347 saves): no text
lost or changed; files the editor writes differently the second time, 27 before, 0 now; 98.9% of
saves keep text. Properties hold on 10,000 cases each with `<`, `>`, `@` and `|` in the
generated text and lists side by side. Timings unchanged (a 3,010-line note reads in about
30 ms and saves an edit in about 3 ms).

**What turned out different**

- **The "unstable spelling" files were faults, not spellings.** The plan expected quirks to
  remove; most were the writer producing text that reads as another document, and three were
  the reader (text after a block in an item, a line end before `<br>`, blank lines after
  `</details>`).
- **The corpus test compared too little.** Its comparison of a save with the document did not
  set markers aside, so a whole-document write of a text with markers was counted as "the
  editor's own spelling doesn't read back either" (432) instead of being checked. It now compares
  as the schema holds the nodes; the count is 204 and no save reads back as another document.
- **Lists side by side.** Not in the plan: the property tests left them out as unwritable. They
  are written with alternating markers, which also makes the whole-document fallback after a
  removal between two lists correct. The save still falls back there (317 saves): keeping
  writes the two lists' own text, which joins them.

**Known and left**

- A list item's fenced code indented by one to three spaces more than the item's text (an item
  indented with tabs) is still not read, as at the top level (milestone 4); such a list loses the
  code when it is edited. Example: `type-fest`'s readme.
- A mark that ends inside a word next to another (`~~a*b*~~c`) does not read back; `marked` wants
  a word boundary. The save's check catches it and writes the document whole, which has the
  same text.
- A `|` in a paragraph line above a line of `-`s and `|`s would read as a table; text is not
  escaped for it.
- Of the 204 saves above, about 30 are not explained (spaces beside marks, bold around code
  after a removal).

## Testing strategy

| Level              | What                                                      | Where                                           |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| Round trip         | documents that must come back unchanged                   | `tests/editor/markdown.test.ts`                 |
| Keeping            | every block of every fixture edited, removed, added after | `tests/editor/markdown-keeping.test.ts` (M2)    |
| Markers            | one case per marker, and misreads                         | `markdown.test.ts` (M3)                         |
| Properties         | idempotence, read-back, keeping                           | `tests/editor/markdown-properties.test.ts` (M4) |
| Editor             | load, edit, undo, outside changes, slash menu, clipboard  | `rich-text-editor.test.ts`, `clipboard.test.ts` |
| App                | autosave over IPC, note page, task page                   | `tests/routing/*-page.test.ts`                  |
| End to end         | a file on disk keeps its text through an edit             | `e2e/flows` (M4)                                |
| Corpus (not in CI) | invariants and fallback rate on large real markdown       | `npm run markdown:corpus` (M4)                  |

A new kind of content needs a round trip case, a keeping case and, if it has more than one
spelling, a marker case.

## Risks and open questions

- **Hidden meaning in kept text.** A kept slice can mean something different next to a new block
  (lazy continuation, indented code, list joining, definitions). The seam check and the
  whole-output check are what make this safe; never ship keeping without the read-back.
- **The read-back costs a parse per save.** Budgeted in milestone 4; if the region check is not
  enough, run the full check after an idle delay and fix up the next save.
- **Equality is structural.** Two blocks equal by `Node.eq` but written differently in the file
  (`*a*` and `_a_` before markers exist) are matched as kept. That is correct (both read the
  same), but moving one onto the other's position keeps the moved one's spelling. Fine.
- **Paste with markers?** Decided in milestone 3: no. Pasted markdown is read without its
  markers, as the pasted text isn't the file's.
- **`markup` in JSON.** Audited in milestone 3: nothing stores the editor's JSON (notes are
  stored as markdown), `turn-into-task.ts` reads text and one attribute, and no test that
  compares JSON needed changing.
- **`marked` upgrades.** Pin the minor version; an upgrade re-runs the corpus script and the
  parity of `parse` before merging, as `tanstack-behaviour.test.ts` does for routing.

## Production readiness checklist

Checked at the end of milestone 4.

- [x] Opening any note, closing it, and undoing back to the start never change its file
      (`rich-text-editor.test.ts`, the e2e flow).
- [x] An edit rewrites only its top-level block (and the text at its seams), checked on every
      fixture with both line ends (`markdown-keeping.test.ts`).
- [x] Every save reads back as the editor's document, where the editor's own spelling of it
      does; a failure falls back to a whole-document write, counted by reason only.
- [x] Markers are kept in edited blocks, and dropped where they would misread.
- [x] No private or undocumented TipTap API: the layer imports TipTap's public packages only
      (`@tiptap/core`, `@tiptap/pm/model` and the extensions the schema is made of), and its one
      `as unknown as` is on its own codec's placeholder.
- [x] The performance budget holds at 3,000 lines; timings recorded in `docs/performance.md`.
- [x] Property tests and the e2e flow pass; the corpus run shows no data loss.
- [x] `docs/editor.md` and the website's notes page describe what ships.
- [x] `npm test`, `npm run typecheck:node`, `npm run typecheck:web`, ESLint, Prettier pass.
- [ ] The corpus run on real users' notes shapes (an Obsidian vault, a GitHub wiki) on a
      developer's machine, before a release: `npm run markdown:corpus -- <folder>`.
