# Markdown layer: implementation plan

DevBrain's notes are markdown files, and the editor must treat them as the user's files: opening
one changes nothing, and saving one rewrites only what the user changed. This plan takes the
markdown layer (`src/renderer/editor/markdown/`) from its first step, parity with
`@tiptap/markdown`, to a first-class layer that keeps each file's own text, and through what it
needs to be production ready.

> **Status:** milestone 0 (parity) is done (PR #256). Milestones 1–5 are to do. The reference for
> the layer as built is `docs/editor.md` ("The markdown layer"); this plan is kept for the
> reasoning and the steps. The prototype on `claude/markdown-block-preservation` is the
> behavioural reference for milestones 1–3: its tests and its "What a save changes" notes carry
> over, its TipTap-specific plumbing does not.

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
- `RichTextEditor.tsx`: the baseline (`{ value, markdown }`) that sends the stored text while the
  content still serialises to what it loaded.

Parity was checked against `@tiptap/markdown` on the real-world fixtures, `docs/` and 852 READMEs
(commit `accded7` holds the test). Two deliberate differences are documented in `docs/editor.md`.

## What must be supported

The complete inventory. Each row says what reading, writing and keeping must do. "Kept" means
the slice is written back exactly when the block is unchanged; "markers" means an edited block
keeps its spelling (milestone 3).

### Blocks

| Syntax                                       | Node                     | Read (today) | Kept (M1–2) | Markers (M3)                                                   |
| -------------------------------------------- | ------------------------ | ------------ | ----------- | -------------------------------------------------------------- |
| Paragraph, lazy continuation lines           | `paragraph`              | yes          | yes         | –                                                              |
| ATX heading `#`–`######`, closing `#`s       | `heading`                | yes          | yes         | closing `#`s kept                                              |
| Setext heading (`===`, `---` underline)      | `heading`                | yes          | yes         | `setext` and the underline as written                          |
| Thematic break `---`, `***`, `___`, spaced   | `horizontalRule`         | yes          | yes         | the line as written                                            |
| Fenced code ` ``` `, `~~~`, longer fences    | `codeBlock`              | yes          | yes         | fence character and length; info string after the language     |
| Indented code (4 spaces)                     | `codeBlock`              | yes          | yes         | `indented` (only while it still reads as code where it stands) |
| Blockquote, nested                           | `blockquote`             | yes          | yes         | –                                                              |
| GitHub alert `> [!NOTE]` …                   | `callout`                | yes          | yes         | –                                                              |
| Bullet list `-`, `*`, `+`, tight and loose   | `bulletList`/`listItem`  | yes          | yes         | bullet character; new items take the list's                    |
| Numbered list `1.`, `1)`, `a.`, `i.`, start  | `orderedList`/`listItem` | yes          | yes         | `)` delimiter                                                  |
| To-do list `- [ ]`, `- [x]`, `* [ ]`         | `taskList`/`taskItem`    | yes          | yes         | bullet character; `X` vs `x`                                   |
| Mixed to-do and bullet list                  | split into lists         | yes          | yes         | each part keeps its bullet                                     |
| GFM table, alignment, `\|` in code           | `table`…                 | yes          | yes         | – (an edited table is padded)                                  |
| `<details>`/`<summary>`, `open`, nested      | `details`                | yes          | yes         | –                                                              |
| Other block HTML, comments                   | `rawHtmlBlock`           | yes          | yes         | – (atomic; never edited in place)                              |
| Link reference definitions `[x]: url "t"`    | none                     | yes (links)  | yes         | –                                                              |
| Blank lines beyond one                       | empty `paragraph`s       | yes          | yes         | –                                                              |
| Text before the first block / after the last | none or empty paragraphs | yes          | yes         | –                                                              |
| Final newline, or none                       | none                     | –            | yes         | –                                                              |

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

### Milestone 1: the source map

Know, for a loaded text, which slice of it each top-level block was read from.

1. **Parser output with tokens.** Give `MarkdownParser` a `read(markdown)` that returns the
   document and, per top-level token, `{ token, from, to, nodes }`: the token's offsets in the
   normalised text and the JSON nodes it produced (zero for a definition or a space token's
   separator, several for a list split by `parseList`, empty paragraphs for blank lines).
   `parse()` stays, built on `read()`. Offsets come from finding each token's `raw` in the
   normalised text, from the end of the token before it. The raws do **not** always concatenate
   to the text: `marked` reads a link definition whose label is already defined and emits no
   token for it (GitHub's `[//]: # (…)` comments, in `github-pr-body.md`; 3 of 995 files
   checked). So where the text at the cursor is not the next raw, the gap before it must be
   nothing but definition lines and blank lines, and becomes "between" text; anything else in a
   gap means no map. Test it over the fixtures and the corpus; the tokenizers of ours that build
   `raw` themselves (`orderedList`, `taskList`, `table`, `callout`, `details`) are the other
   place it could break (none did on the corpus).
2. **Blank lines.** `extractAbsorbedBlankLines` moves a block's trailing blank lines into a space
   token: compute offsets after it, so a block's slice ends at its last non-blank line and the
   blank lines are "between" text. Empty paragraphs made from a space token have no slice: they
   are matched as empty paragraphs (equal to any other), and written as blank lines.
3. **`MarkdownSource`** (`source.ts`), built from `read()`'s output and the schema
   (`schema.nodeFromJSON` per block, so blocks compare with `Node.eq`):

   ```ts
   interface MarkdownSource {
     text: string; // as loaded
     lineEnd: '\n' | '\r\n';
     blocks: ({ from: number; to: number; node: ProseMirrorNode } | null)[];
     between: string[];
     definitions: Definition[];
   }
   ```

   `between[i]` is the exact text between block `i - 1` and
   block `i` (with `between[0]` before the first and `between[n]` after the last).

4. **No map** when the text can't be lined up: line ends that mix `\r\n` and `\n`; a definition
   inside a quote or list item (it would move with the block: a label in the lexer's `links`
   with no top-level `def` token and no gap that defines it); a gap that holds anything but
   definitions (step 1). `source` is then `null`, and saves write the whole document. Don't
   validate blocks with `check()`: a paragraph that holds only an image reads as a bare
   `imageLink` at the top level (inherited from TipTap's paragraph rule), which the schema
   doesn't allow in a document but the editor holds and writes back; it must keep its slice like
   any block (milestone 4 decides whether to make it a paragraph).
5. **Links:** keep the lexer's `tokens.links` (public on `marked`'s token list) in the source, for
   milestone 2's definition handling.
6. **Codec API:** `codec.read(markdown): { doc: JSONContent, source: MarkdownSource | null }`,
   and `parseDocument` built on it.

Tests (`markdown.test.ts`, a new `describe('reading the source')`):

- the slices and the text between them concatenate to the text, for every fixture, with `\n`
  and `\r\n`, and with a label defined twice;
- each fixture's blocks, sliced out of the text and read alone, give the same node (or note the
  exceptions: an indented code block or lazy line that only reads as it does after its neighbour);
- no map for mixed line ends and for a definition inside a list item.

Done when: `read()` gives a map for every fixture, `parse()` output is unchanged (parity holds on
the corpus: re-run the parity test from `accded7` locally), and the docs describe the map.

### Milestone 2: saving what was read

Write a document keeping every unchanged block's slice.

1. **Matching.** `serializeKeeping(doc, source)` (`keeping.ts`): match the document's top-level
   children against `source.blocks` in order: take the common prefix and suffix first (an edit
   usually leaves all but one block), then a longest common subsequence on `Node.eq` over what is
   left, so a long note costs a comparison per block, not per pair. Empty paragraphs match
   blank-line runs. A matched block is **kept**; an unmatched one is **new** (edited, added or moved).
2. **Writing.** Walk the document:
   - two kept blocks that were neighbours in the file: the file's `between` text, then the slice;
   - a kept block after a new one, or a new block after anything: the new block's markdown from
     the serializer, with `\n\n` either side (the file's `between` text is used instead where the
     new block replaced exactly one old block in place, so `### Notes` straight above a list
     stays so when the list changes);
   - the text before the first block and after the last, when those blocks are kept;
   - the file's final newline; its line ends (`\n` → `\r\n` on the whole output when the file
     used `\r\n`).
3. **Seams.** Where a kept block meets a new one, or a block moved from elsewhere, read the two
   back together (the slice, the text between, the new markdown): if they don't read as the two
   nodes (`First\n* a` turned paragraph joins the paragraphs; an indented code block after a new
   list continues its item), use `\n\n` instead of the file's text; if they still don't, give up
   on keeping and write the whole document. Blocks kept side by side read as they did in the file
   and need no check.
4. **Whole-output check.** Read the final text back (`codec.read`) and compare with `doc`
   (`Node.eq` on the whole document). A mismatch writes the whole document in the editor's
   spelling. This is the safety net for everything above; keep it even once the seam checks look
   complete, and measure it (milestone 4 budgets it).
5. **Definitions.** A definition is kept with the `between` text that held it. When a save drops
   that text (its neighbouring blocks were removed) and a kept link still uses the label, write
   the definition at the end of the file. A label defined twice is fine (GitHub's `[//]: #`
   comments) unless the two differ and a link uses it: then no map.
6. **The editor.** `RichTextEditor` holds a `MarkdownSource` instead of `Baseline`:
   - first content: `contentType: 'markdown'` makes the source in `DocumentMarkdown`'s
     `onBeforeCreate` (`codec.read`), kept in the extension's storage;
   - `load(text)`: `codec.read(text)`, `setContent(doc)`, store the source;
   - `markdown()` and `onChange`: `codec.serializeKeeping(editor.state.doc, source)`.
     Undo back to the load gives the text exactly because every block is kept, so delete
     `Baseline` and `markdownOf`. `editor.getMarkdown()` stays the editor's own spelling (tests use
     it), and gains a sibling, `editor.storage.documentMarkdown.save()`, if a caller needs keeping
     outside `RichTextEditor`.
7. **`useEditorAutosave`** needs no change: it compares `remote` with `editor.markdown()`, which
   still gives the stored text for unedited content.

Tests:

- port the prototype's `describe('saving what was read')` cases (unchanged text, blank lines at
  the ends, one block edited, a new block, a removed block, moved blocks, seams that misread,
  final newline, text before and after, an image-only paragraph, definitions, Windows line ends,
  the whole-document fallback, a text already in the editor's spelling, a block the editor writes
  differently each time);
- port `markdown-keeping.test.ts`: every block of every fixture edited, removed and followed by a
  new one in turn, with `\n` and `\r\n`, checking the save reads back as the document and keeps
  the text outside the block;
- `rich-text-editor.test.ts`: an edit rewrites only its block; undo gives the stored text back.

Done when: those pass, the parity of `parse` still holds, and "What a save changes" in
`docs/editor.md` describes keeping (use the prototype's text as the base).

### Milestone 3: markers in edited blocks

An edited block keeps the spelling it was read with.

1. **The attribute.** A `DocumentMarkup` extension adds a `markup` attribute (default `null`,
   `rendered: false`, `keepOnSplit: true`, `parseHTML: () => null`) to the nodes and marks that
   have markers, through `addGlobalAttributes` (public). `null` is the editor's own spelling.
   Add it to `createDocumentExtensions()`.
2. **In the rules.** Each rule with a marker reads it in `parse` and writes it in `render`; there
   is no wrapper. `marked`'s own tokens carry it in `raw`. The tokens our tokenizers make don't:
   a to-do item's `raw` is `''`, and the numbered list's tokenizer drops the delimiter. Those
   tokenizers (`lists.ts`) already match the bullet, the checkbox and the delimiter, so they put
   them on the token (`bullet`, `checkedMark`, `delimiter`). A mixed list split by `parseList`
   passes the bullet on to each part. The markers, and where each is read from:

   | Node / mark      | `markup`                                  | Read from             |
   | ---------------- | ----------------------------------------- | --------------------- |
   | `bulletList`     | `*` or `+`                                | the first item's raw  |
   | `taskList`       | `*` or `+`                                | the tokenizer's token |
   | `orderedList`    | `)`                                       | the tokenizer's token |
   | `taskItem`       | `X` (checked written in capitals)         | the tokenizer's token |
   | `heading`        | `setext:<underline>` or closing `#`s      | the heading's raw     |
   | `horizontalRule` | the line                                  | the token's raw       |
   | `codeBlock`      | the fence (`~~~`, ` ```` `) or `indented` | the token's raw       |
   | `bold`, `italic` | `__`, `_`                                 | the token's raw       |
   | `strike`         | `~`                                       | the token's raw       |
   | `hardBreak`      | `\` or `<br>`                             | the token's raw       |

   Marks carry their marker on the mark, so `serializer.ts`'s `renderMark` passes the mark's
   attributes as today. A list's marker is on the list, so an item added with Enter writes the
   list's bullet.

3. **Checked on write.** A marker can read differently where it now stands (`_it_s` is no
   emphasis, `*it*s` is; a `*` list next to a `-` list is two lists, but next to a `*` list it
   would join it). Each new block that holds any `markup` is read back alone, and with its
   neighbours at the seams (milestone 2's check covers that); if it reads differently, it is
   written with its markup stripped (`stripMarkup(node)`: the editor's spelling).
4. **Where the editor's spelling is used:** new content (the attribute is null), a document
   written whole (no map, or a failed check), the clipboard, `editor.getMarkdown()`,
   `serializeMarkdown()` and `normalizeMarkdown()` (so `markdown.test.ts`'s expectations that
   `* Star bullet` normalises to `- Star bullet` still hold).
5. **Schema impact.** A new attribute changes the editor's JSON: `getJSON()` gains `markup: null`
   on those nodes and marks. Check every place that compares or stores JSON (tests with
   `toEqual` on parsed JSON, `turn-into-task.ts`, the clipboard) and update the expectations that
   must change, listing them in the PR.

Tests: port the prototype's `describe('keeping markers in an edited block')`, and
`rich-text-editor.test.ts`'s "writes an item added to a list with the list's own bullet". Add a
case per marker in the table: read, edited, written back with the marker; and one where the
marker would misread.

Done when: those pass, the fixtures' `mixed-spellings.md` keeps every marker through an edit of
each block, and `docs/editor.md` lists the markers.

### Milestone 4: production hardening

1. **Never lose text.**
   - A throw anywhere in `read` or `serializeKeeping` must not lose the note. `read` failing:
     show the editor read-only with the text as a raw block and a toast; `serializeKeeping`
     failing: write the whole document (`serialize`); `serialize` failing: don't save, keep the
     last saved text, report.
   - Fix the inherited crash: an empty numbered item (`1. \n2. x`) parses to a list item with no
     paragraph, which `renderNestedContent` can't write. Make `parseOrderedListItems` give it an
     empty paragraph, as the bullet item does (`ensureLeadingParagraph`). This changes parity for
     that input: list it.
   - Decide the image-only paragraph: it reads as a bare `imageLink` among the document's
     blocks, which the schema doesn't allow (the editor holds it all the same). Reading it as a
     paragraph holding the image writes the same markdown and gives a valid document; it changes
     the JSON for that input, so list it, and check the caret and deletion around it either way.
   - Audit the ports for other inherited edge cases (`taskItem` builds a text node with
     `createNode('text', { text })`, which makes an attribute, not text; unreachable today).
2. **Properties, not just cases.** Add property tests (add `fast-check` as a dev dependency):
   - `normalize(normalize(x)) === normalize(x)`;
   - for documents the editor can make (generated from the schema), `read(serialize(doc)).doc`
     equals `doc`;
   - for any text and any single-block edit, `serializeKeeping` reads back as the edited
     document and keeps the text outside the block.

   Seed the generators with the fixtures' blocks.

3. **Corpus check as a script.** Keep a corpus run outside CI (`npm run markdown:corpus`): reads
   every `.md` under a directory, checks the invariants above and the round trip, and reports
   files that fall back to whole-document writes and why. Run it on `docs/`, the
   `node_modules` READMEs and, before release, a set of real users' notes shapes (Obsidian
   vaults, GitHub wikis) on a developer's machine. The fallback rate is the number to watch.
4. **Performance budget.** On a 3,000-line note, a save (keeping write + read-back check) under
   20 ms in the renderer, load under 100 ms (today: load 88 ms, plain serialize 10 ms). Measures:
   - cache each top-level block's markdown by node identity (`WeakMap<Node, string>`): ProseMirror
     nodes are immutable, so an edit re-serialises only the blocks it touched. The serializer
     takes JSON, so a block is serialised from `node.toJSON()` on a miss. Leave empty paragraphs
     out of the cache: what one writes depends on the block before it (`&nbsp;` after another
     empty one);
   - check only the edited region on read-back, falling back to the whole document only when a
     seam is unsure (keep a full check behind a debug flag for the corpus script);
   - add the 150/750/3,000-line timings to `docs/performance.md`, with how to reproduce them.
5. **Logging.** Log a whole-document fallback with its reason (`mixed-line-ends`,
   `seam-misread`, `readback-mismatch`, …), by reason only, never with the text (notes are
   private, `CLAUDE.md`). Count them in development builds.
6. **Security review.** Confirm keeping and markers render nothing new: raw HTML stays a raw
   node, images stay chips, links still go through `safeExternalUrl`. Add a case per untrusted
   construct to the keeping tests (kept unchanged, and edited next to).
7. **End to end.** One Playwright flow (`e2e/flows`): open a note written with `*` bullets and
   `__bold__`, edit one paragraph, check the file on disk changed only there.

Done when: the properties hold on 10,000 generated cases, the corpus run shows no data loss and
a fallback rate you're willing to ship, the budget holds, and the e2e flow passes.

### Milestone 5: finishing and follow-ups

1. **User-facing docs.** `website/src/content/docs/docs/notes.mdx`: "Opening a note never
   changes its file. When you edit one, DevBrain rewrites only the blocks you edited, and keeps
   their markers" (CLAUDE.md: a change users can see lands with its website change, in the same
   PR as milestone 2 and milestone 3 respectively). No screenshots change.
2. **Tidy the ports.** Rename what still says TipTap's way of doing things, and remove quirks the
   tests show nothing depends on (each removal is a listed parity change).
3. **Optional: finer grain.** Keep unedited items of an edited list, and unedited rows of an
   edited table, by applying milestone 2 one level down (list items, table rows). Only if users
   ask: the block level covers most edits.
4. **Optional: one reader for main.** `stripMarkdown` (main, regex-based) gives note previews and
   search text. If previews disagree with what the editor shows, move the parser's schema-free
   parts (`lexer.ts`, rules' tokenizers) to `src/common` and build previews from tokens. Needs
   `src/common` to stay free of TipTap (CLAUDE.md), so the rules would split into tokenizers
   (common) and parse/render (renderer).

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
- **Paste with markers?** Should markdown pasted into a note keep its markers? Probably not (the
  pasted text isn't the file's), but decide in milestone 3.
- **`markup` in JSON.** Milestone 3 adds an attribute to stored JSON nowhere (notes are stored as
  markdown), but tests and `turn-into-task.ts` compare JSON. Audit before merging.
- **`marked` upgrades.** Pin the minor version; an upgrade re-runs the corpus script and the
  parity of `parse` before merging, as `tanstack-behaviour.test.ts` does for routing.

## Production readiness checklist

- [ ] Opening any note, closing it, and undoing back to the start never change its file.
- [ ] An edit rewrites only its top-level block (and the text at its seams), checked on every
      fixture with both line ends.
- [ ] Every save reads back as the editor's document; a failure falls back to a whole-document
      write, logged by reason only.
- [ ] Markers are kept in edited blocks, and dropped where they would misread.
- [ ] No private or undocumented TipTap API (grep for `as unknown as` on TipTap objects and for
      imports from TipTap's internals in `src/renderer/editor/markdown/`).
- [ ] The performance budget holds at 3,000 lines; timings recorded in `docs/performance.md`.
- [ ] Property tests and the e2e flow pass; the corpus run shows no data loss.
- [ ] `docs/editor.md` ("The markdown layer", "What a save changes", "Extending it") and the
      website's notes page describe what ships.
- [ ] `npm test`, `npm run typecheck:node`, `npm run typecheck:web`, ESLint, Prettier pass.
