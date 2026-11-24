# Rich text editor

`RichTextEditor` (`src/renderer/editor`) is the one editor for note bodies, task, project and event
descriptions, and read-only synced descriptions. It is built on [TipTap](https://tiptap.dev) v3
(ProseMirror), with a markdown layer of DevBrain's own (`editor/markdown/`, below): markdown in,
markdown out.

```tsx
// in a page: the editor acting in the open workspace (shared/components/WorkspaceRichTextEditor.tsx),
// saved as it is typed and following changes from outside (shared/hooks/use-autosave.ts)
const { initialValue, editor, onChange } = useEditorAutosave(task.description ?? '', (markdown) =>
  ipc.tasks.update.mutate({ id: task.id, description: markdown }),
);
<WorkspaceRichTextEditor
  label="Description"
  initialValue={initialValue}
  ref={editor}
  onChange={onChange}
/>;
```

- `WorkspaceRichTextEditor` is `RichTextEditor` with the app's pills and actions: its pills are
  `WorkspaceEntityPill`, "@" searches the open workspace and links open through `workspace.openUrl`
  (`useWorkspaceEditorHost`), and a pill opens its entity where it lives (`useOpenEntity`; an event
  on its day). Every page's editor is one; Storybook and the editor's tests render
  `RichTextEditor` with their own.
- Each entity link is drawn by `RichTextEditor`'s `entityPill`, a component given
  `{ type, id, label }`. It finds the entity and draws it with the editor's `EditorEntityPill`:
  the current title, or the stored label while it is unknown; a deleted or trashed one keeps its
  label, drawn as missing. The editor sets it on its entity link extension when it is made
  (`EntityLinkView.configure`), so it is read once, like the placeholder.
- `WorkspaceEntityPill` reads its entity with `useEditorEntity` (`shared/hooks`): a `useQuery` on
  `tasks.get`, `projects.get`, `notes.get` or `events.get`, the same cache the entity's own page
  reads. It loads the entity the first time it is drawn, and draws again when core reports it
  changed: TipTap renders node views through portals inside the editor, so a pill is an ordinary
  component under the app's `QueryClientProvider`, re-rendered by its own query.
- `useEditorAutosave` saves 500ms after typing stops, and at once on leaving the page, on the
  window losing focus and when a workspace switch starts. It loads a change from outside the
  editor into it, and never its own saves coming back (below).
- The editor is **uncontrolled**: `initialValue` is read once, when it is made, and the editor
  holds its text from then on; a later `initialValue` changes nothing. A text from outside (a sync,
  a reattach) is loaded through its handle, its `ref` (`RichTextEditorHandle.load`): it replaces
  the content without counting as an edit, and the next edit starts an undo step of its own. In a
  page, `useEditorAutosave` does this (below). Destructure what the hook returns: React's lint
  takes an object one of whose values is passed as a `ref` for a ref, and refuses to read it
  while rendering.
- `onChange` only fires after an edit, never on load. Opening a note and closing it leaves its
  file alone, and undoing back to the text last loaded sends it exactly as it was stored. After
  an edit it sends the stored text with only the blocks that changed written anew: markdown has
  several spellings for one thing (`* one` and `- one`) and the editor writes only its own, so
  it remembers the text it loaded and where each block of it was read from, and keeps the rest
  as written (see "What a save changes"). `RichTextEditorHandle.markdown()` gives the same text.
- Try it in Storybook (`npm run storybook`, Editor/RichTextEditor): a full note, an empty one,
  a read-only description and untrusted content, each beside the markdown it would save.
- The editor never imports IPC, React Query, the router or the app. It gets what it needs through
  `RichTextEditor`: `entityPill` to draw entity links, and `EditorHost`
  (`types.ts`) for the actions it can't take itself: `searchEntities`, `onOpenEntity` and
  `onOpenUrl`, which the "@" menu and the link click handler call from TipTap and ProseMirror,
  outside React.
- It is drawn by the design system's components (`src/renderer/components`): the blocks by
  `EditorContent`, entity links and images by `EntityPill`, keys by `Kbd`, the `/` menu by
  `SlashMenu`, the `@` menu by `MentionMenu`, and the toolbar over a selection by `FormatToolbar`,
  `TurnIntoMenu` and `LinkToolbar`. A change to how any of these look belongs in the
  component and its guide (`docs/design-system/components/`), not here; `RichTextEditor.module.css`
  holds only the editor's own link rules.
- Copy and paste move markdown (`extensions/clipboard.ts`). Copying puts the selection's markdown
  on the clipboard as plain text beside the HTML (inside a code block, the code as it is).
  Pasting plain text that looks like markdown (a heading, a list, a fence, a quote, a table, a
  link, bold or inline code) reads it as markdown; other text, Shift+⌘V and pastes into code stay
  text. From VS Code, a markdown file's text reads as markdown and several lines of other code
  become a code block in its language. Web pages and documents paste as TipTap reads their HTML.
- Selecting text shows the `FormatToolbar` above it (`FormatBubble.tsx`): the block type opens the
  `TurnIntoMenu`; Bold, Italic, Underline, Strikethrough and Code toggle; Link (⌘K) swaps in the
  `LinkToolbar`, which takes a bare address as https and refuses one `safeExternalUrl` won't open.
  ⌘K with no selection and no link under the caret is left to the app's search. Turn into task
  (`turn-into-task.ts`) makes a task titled with the selected text and puts a link to it, its
  pill, where the text was: `[Ship the notes](devbrain://task/tsk_…)`. It shows for a selection
  within one block, outside code, when the host can make tasks (`EditorHost.createTask`). The host
  makes it with the settings' default priority and due date, as New task does; a note's editor
  links it to the note (`linkedNoteId`) in the note's project, and a project's or task's
  description puts it in that project. If the note changes while the task is being made, the
  task is kept but the text is left as it is (its place may have moved); if making it fails (a
  toast says so) the text stays. The colour button is left out: text colours are not in the
  note format.
- `/` opens the `SlashMenu`; "Link to note", "Link to task" and "Mention event" open the `@` menu
  for that kind. "Task" opens the New task dialog
  (`EditorHost.openNewTask`), connected to what the editor is for: a note's task is linked to the
  note in its project, a project's or task's description puts it in that project. The rest of the
  line's text, if any, is its title; the `/task` is removed and the text left as it is: nothing is
  linked in the note. A page passes the dialog to its editor
  (`WorkspaceRichTextEditor`'s `openNewTaskDialog`, the tasks feature's `useCreateTask()`, which
  `shared` doesn't import); without it the menu has no Task. `@` searches
  tasks, notes and events, as the `MentionMenu` shows them (a project link in a note still reads
  as a pill).

## Saves, and changes from outside

The editor reads its text from the query the page already has (a task's `tasks.get`, an event's
`events.get`, a note's `notes.readContent`) and passes it to `useEditorAutosave` as `remote`. That
text changes for two reasons: a change from outside the editor (a sync, a reattach), which the
editor must show, and the editor's own saves coming back. A save makes core report its entity
changed, so `tasks.get` is refetched, and by the time the answer arrives more may have been
typed: loading it would put older text back.

- **The hook follows `remote` only while no save is waiting or on its way**, and looks once
  more when the last one lands. The IPC link settles a mutation only once the refetches it caused
  have landed, so by then the cache holds the latest save, or a change made from outside since.
  A refetch of an older save always arrives while a newer one is still on its way, and is never
  taken.
- **It holds one text:** its latest save (as stored: a blank description as `''`), or the last
  text it followed. A `remote` that differs from it changed from outside, and is loaded through the
  editor's handle (`load`), unless the editor already shows it (`markdown()`). Reattaching a task
  after an edit restores Linear's description, though it is the very text the editor opened with.
- **It looks on a zero-delay timer once a save settles:** React Query tells components of a change
  on one (its `notifyManager`), so a look made at once could compare the save with the text from
  before it.
- **A change from outside while you type loses to your next save**, which is written over it.
- **A note's markdown is never refetched by a save.** `notes.readContent` reads no entity
  ([`ENTITIES_READ_BY_ROUTE`](../src/renderer/ipc/query-invalidator.ts)): the note's editor is the
  only thing that rewrites an existing note's markdown (sync and reattach write tasks, projects
  and events; a rename only rewrites the file's front matter; imports and duplicates make new
  notes). So the editor writes each save into the query's cache itself (`noteContentQuery`,
  never stale), and the note opened again shows it, a save never reads the file back, and a save
  cancels a read of the file already on its way, whose answer would be older than it.
  Anything that comes to rewrite a note's markdown from outside (a file watcher) must make that
  query refetch.
- A description is refetched with its entity anyway (for its title and the rest), so it costs no
  extra read. Opening a task again while its save is on its way shows the text before it for a
  moment, until the save's refetch lands.
- A recurring event's description is saved on leaving the editor, through the question of which
  occurrences; it is followed like any other change once saved.
- A note file edited on disk by another app is not followed: nothing watches the files.

## The markdown layer

TipTap is the editor and holds the schema; reading markdown into the editor's JSON and writing it
back is DevBrain's own, in `src/renderer/editor/markdown/`. It replaced `@tiptap/markdown`, and
reads and writes every note exactly as that package did (checked against it on the
`fixtures/real-world` notes, `docs/` and the READMEs in `node_modules`), except where noted below.

**The rule: no private or undocumented TipTap API.** The layer uses TipTap's public editor,
extension and command APIs (`getSchema`, `setContent`, an extension's storage and commands) and
`marked`'s public API, and nothing else. A document is loaded as JSON through `setContent`.

What it still needs to be production ready:
[editor/markdown-layer-plan.md](editor/markdown-layer-plan.md). Its first three steps are built:
reading a text gives its source map ("The source map", below), a save writes the document keeping
the text of every block that didn't change, and a block that did change keeps the markers it was
written with ("What a save changes").

- `codec.ts`: `MarkdownCodec`, a parser and a serializer for one schema. `read(markdown)` gives
  the document an editor loads and the text's source map; `parseDocument` is that document alone,
  and `parse` the parser's JSON as it is. `parseMarkdown`, `readMarkdown`, `serializeMarkdown` and
  `normalizeMarkdown` (`index.ts`) use one for `createDocumentExtensions()`'s schema, with no
  editor.
- `extension.ts`: `DocumentMarkdown`, the last of `createDocumentExtensions()`, plugs a codec into
  each editor, as methods on the editor, so nothing outside the layer reaches into it:

  | Method                              | Gives                                                                                              |
  | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
  | `editor.getMarkdown()`              | the whole document in the editor's spelling                                                        |
  | `editor.saveMarkdown()`             | the markdown to store: the loaded text while the document is the one loaded, kept text once edited |
  | `editor.markdownToContent(text)`    | markdown from outside as content to insert, without its markers (a paste)                          |
  | `editor.contentToMarkdown(content)` | a document or some nodes as markdown in the editor's spelling (a copy)                             |

  And `contentType: 'markdown'`, which reads a string as markdown for the editor's first `content`
  and for `setContent`. Either way the text is read with `codec.read` and loaded as JSON (a text
  with no blocks, only link definitions, loads as a paragraph showing its lines), and the text,
  its source map and the document it loaded as are kept in the extension's storage (`loaded`),
  for `saveMarkdown()` (`codec.serializeKeeping`). `RichTextEditor` sends what that gives. A
  `setContent` of anything but markdown forgets the loaded text. The codec itself is
  `editor.storage.documentMarkdown.codec`, for what needs more than the methods (a text's source
  map).

- `lexer.ts`: the `marked` instance notes are read with, its own (`new Marked()`, GFM), never the
  global one, so nothing else that uses `marked` changes how notes read, and an editor adds
  nothing to it: the tokenizers are fixed, added once. Each token keeps its `raw` source text.
- `rules/index.ts`: the rule table, `DOCUMENT_RULES`, one `MarkdownRule` per node or mark
  (`types.ts`): the token type it reads (`token`), `parse` (a token to nodes, or a mark on its
  children's text), `render` (a node to markdown; a mark around a placeholder for its text) and, for
  syntax `marked` doesn't read, a `tokenizer`. The rules for TipTap's nodes and marks are in
  `rules/` (`blocks.ts`, `lists.ts`, `marks.ts`, `tables.ts`), ported from TipTap's extensions;
  DevBrain's own are exported beside the node they belong to (`calloutMarkdown` in
  `extensions/callout.ts`, and so on), so a node's schema and its markdown are read together, and
  the UI's versions of a node (`CalloutView`, `EntityLinkView`) share its rule by name. The table's
  order matters: a token type several rules read (`list`) goes to the first that makes something
  of it, and where two tokenizers match at one place the later one wins (`marked` runs the last
  added first).
- `parser.ts`: tokens to JSON. Besides each token's rule it reads blank lines beyond the one
  between two blocks as empty paragraphs (at the top level, and in a quote, callout or collapsible
  section), splits a list that mixes to-dos and bullets into separate lists at each change, and
  puts each mark on the text it spans. `read` gives, with the document, each top-level token's
  place in the text and the nodes it gave.
- `source.ts`: `MarkdownSource`, the source map, made from what `read` gives.
- `keeping.ts`: `writeKeeping`, a document written keeping the text of its source
  (`codec.writeKeeping`, `codec.serializeKeeping`).
- `markup.ts`: `DocumentMarkup`, the `markup` attribute a node or mark keeps its marker in
  (`*` bullets, `__bold__`, an underlined heading), with `stripMarkup` and `hasMarkup`. The
  rules read and write it; `codec.serialize` writes the editor's own spelling whatever markers a
  document has, `codec.serializeWithMarkup` writes them.
- `serializer.ts`: JSON to markdown. It writes a run of text's marks itself, opening and closing
  each where its span starts and ends: the higher priority mark outside (a link around its bold
  text), spaces moved out of a mark's edges, and a mark that has to reopen where two overlap
  written as its HTML tag (`<strong>`). Text is escaped as "What a save changes" says
  (`relaxEntities`, `escapeLineStart`).

Where it reads or writes otherwise than `@tiptap/markdown` did, each a fault of that package's
the layer no longer has:

- **HTML it dropped is kept.** HTML that `marked` reads as inline HTML but no tokenizer takes
  (`<?php … ?>`, `<!DOCTYPE …>`, `<![CDATA[…]]>`, an empty pair like `<kbd></kbd>`) is kept as raw
  HTML, as written; TipTap parsed it through the DOM and lost it on the next save.
- **A note that reads as no blocks** (only link definitions, `[docs]: https://…`) shows its text, a
  line each, however it is loaded; TipTap showed it on the first load only and loaded it empty
  through `setContent`.
- **A list is numbered with digits only** (`1.`, `2)`), as on GitHub and as typing `1. ` in the
  editor makes one. TipTap also read letters and roman numerals (`a.`, `iv)`), and with them any
  word of one or two letters before a full stop: "No. I think so" was read as an item numbered
  "No", and saved as `1. I think so`. Such lines are paragraphs now, a lettered list included,
  and a lettered list that arrives as HTML (`<ol type="a">`, pasted) is written with numbers. A
  paragraph that is `-` or `+` alone is written escaped.
- **A paragraph that holds only an image is a paragraph.** It was read as a bare image among the
  document's blocks, which the schema doesn't allow.
- **A numbered item with no text** (`1.` alone) has an empty paragraph; it had none, and could not
  be written back.
- **A wrapped line has no indentation in the text.** The lines after the first of a list item, and
  the line after a line break, start at their first character that isn't a space, and the spaces
  before a line break are no text either. `<br>` at a line's end is one line break; it was a break
  and a new paragraph once saved.
- **Code is fenced with enough backticks.** A code block that holds a line of three backticks is
  fenced with four; three closed it early.
- **A heading is written on one line,** with `#`s that end its text escaped (`## C \#`); a line
  end in its text made the rest a paragraph, and the `#`s were read as its closing ones.
- **A line break or spaces that end a paragraph are not written:** they read as nothing.

### The source map

`codec.read(markdown)` returns `{ doc, source, reason }`. `source` is a `MarkdownSource`: which
slice of the text each top-level block of `doc` was read from. A save uses it to write an
unedited block back as it was written (`keeping.ts`).

```ts
interface MarkdownSource {
  text: string; // as loaded; every offset is into it
  lineEnd: '\n' | '\r\n';
  blocks: ({ from: number; to: number; nodes: ProseMirrorNode[] } | null)[];
  between: string[];
  definitions: { from; to; label; href; title; first }[];
}
```

- **A block's slice** is `text.slice(from, to)`: from the block's first line, with its
  indentation, to the last character of its last line that isn't blank. The line end after it and
  any blank lines around it are not part of it.
- **`blocks` follows the document's top-level nodes in order.** A slice gives one node, or
  several: a list that mixes to-dos and bullets is one slice and the lists it is split into. A
  paragraph that holds only an image is a paragraph like any other. `null`
  stands for one empty paragraph read from blank lines: it has no slice, and its blank lines are
  in the text between the blocks around it.
- **`between`** is the text outside the slices: `between[i]` comes before the i-th slice (counting
  only the blocks that have one), and the last entry after the last slice, so there is one more
  entry than there are slices. It holds line ends, blank lines and link reference definitions,
  nothing else. `between[0] + slice 0 + between[1] + … + between[n]` is the text, exactly.
- **`definitions`** are the link reference definitions (`[docs]: https://…`), each inside a
  `between`. `first` marks a label's first definition, the one links read. `marked` gives no
  token for a later definition of the same label (GitHub's `[//]: # (…)` comments); the parser
  finds those in the text between two tokens, so they are listed too, with `first: false`.
- **The nodes are ProseMirror nodes** of the codec's schema (`schema.nodeFromJSON`), so a block
  compares with one in an editor by `Node.eq`, given the editor's own codec
  (`editor.storage.documentMarkdown.codec`): nodes of two schemas are never equal.
  `readMarkdown` uses the schema `parseMarkdown` does.
- **Offsets** are found by looking for each top-level token's `raw` from the end of the token
  before it (`MarkdownParser.read`), after a block's trailing blank lines are made a token of
  their own. A text written with `\r\n` is read as `marked` reads it, with `\n`, and its offsets
  are moved to where they are in the text as loaded, so a slice of such a text holds `\r\n`.

`source` is `null`, and `reason` says why, when the text and what was read can't be lined up. A
save of such a text, once edited, writes the whole document in the editor's spelling:

| `reason`               | The text                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `mixed-line-ends`      | has both `\r\n` and `\n` line ends                                                                    |
| `lone-carriage-return` | has a `\r` that isn't part of `\r\n` (`marked` reads it as a line end)                                |
| `nested-definition`    | defines a label inside a quote, a list item, a callout or a collapsible section                       |
| `unread-text`          | has something between two tokens that isn't a definition or a blank line                              |
| `unread-token`         | has a block that reads as nothing (a fenced code block indented one to three spaces, which is lost)   |
| `invalid-node`         | reads as a node the schema can't make                                                                 |
| `no-blocks`            | reads as no blocks: empty, or only definitions (loaded as one paragraph, a line of the text per line) |
| `unreadable`           | could not be read at all: reading it threw ("When reading or writing fails")                          |

Of the 1,673 markdown files under `docs/` and `node_modules`, 1,663 have a map; seven mix line
ends, one defines its labels inside a collapsible section, one has an indented fence and one is
only definitions.

## The note format

Notes, and every description, are **GitHub-flavoured markdown**, with a short list of HTML tags for
what GFM has no syntax for, and DevBrain's entity links. Users write it through the editor, never
as HTML: the menus and shortcuts produce it, typing markdown syntax (`## `, `- [ ] `, `**bold**`)
turns into formatting as you type, and pasted rich text is converted into it. A file in this
format reads the same on GitHub.

**Markdown (GFM):** headings, paragraphs, bold, italic, strikethrough, inline code, bulleted,
numbered and to-do lists (nested), quotes, code blocks, rules, tables, links and autolinks, images,
hard breaks.

**HTML tags** (`extensions/html-elements.ts`), written exactly as GitHub reads them. Each is a real
element in the editor and takes nothing else from the text, so it needs no sanitizing. Typing the
tag pair (`<kbd>K</kbd>`) applies it too.

| Tag                            | Element                                                                                              | Shortcut  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------- |
| `<u>…</u>`                     | Underline                                                                                            | ⌘U        |
| `<kbd>…</kbd>`                 | A key                                                                                                | ⌘⇧K       |
| `<sub>…</sub>`, `<sup>…</sup>` | Subscript, superscript                                                                               | ⌘, and ⌘. |
| `<br>`                         | A line break; written `<br>` only inside a table cell, two trailing spaces elsewhere                 | ⇧↵        |
| `<details>` + `<summary>`      | A collapsible section; `<details open>` keeps it open. The summary is plain text, as GitHub shows it | `/` menu  |

A collapsible section is written as GitHub needs it to read the body as markdown:

```markdown
<details>
<summary>Setup steps</summary>

- While a `/` or `@` menu is open the caret stays in the note, so the editor's element names the
  menu (`aria-controls`) and its highlighted item (`aria-activedescendant`) for a screen reader.
  The menus are the design system's `SlashMenu` and `MentionMenu`, not Base UI, which would move
  focus into the menu.
- Install with `npm ci`

</details>
```

**Code blocks** are highlighted in their fence's language (` ```ts `), drawn by the design
system's `CodeBlock` with the `syntax-*` tokens (`code-languages.ts`). The language is any name or
alias of highlight.js's common set, about 35 languages; a block with none, or one it doesn't know,
stays plain text and is never guessed. The label over the code opens a searchable menu of the
languages; picking one writes its name in the fence. Highlighting only colours the text, so the
markdown is unchanged.

**Callouts**: GitHub's alerts, drawn by the design system's `Callout` (`extensions/callout.ts`).
The marker is alone on the first line; the body is the `>` lines after it, any blocks. GitHub draws
it as an alert, other markdown apps as a quote. Kinds: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`,
`CAUTION`, written in capitals. The slash menu inserts a Note; its title changes the kind.

```markdown
> [!WARNING]
> The migration rewrites every row; run it off-hours.
```

**DevBrain's own, and what is kept but not rendered:**

| Written as                                                             | Shown as                                                                 | Where                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
| `[Fix login](devbrain://task/tsk_…)` (also `project`, `note`, `event`) | An EntityPill with the entity's current title; the label is the fallback | `extensions/entity-link.ts` |
| `![alt](url "title")`                                                  | A chip with the alt text; the image is never loaded                      | `extensions/image-link.ts`  |
| Any other HTML (`<div>`, `<span>`, `<img>`, an unclosed `<kbd>`)       | Its source, as text; kept in the file as written                         | `extensions/raw-html.ts`    |
| `[text](javascript:…)` and other refused targets                       | Plain text; the target stays in the file                                 | `extensions/safe-link.ts`   |

Other HTML only arrives from outside: imported files, Linear, Google descriptions. It is kept as
written so nothing is lost, and so a supported tag added later picks it up.

These follow [untrusted-content.md](security/untrusted-content.md): no raw HTML is rendered, no
remote images are loaded, links open only through `safeExternalUrl` and `Workspace.openUrl`
(⌘/Ctrl-click while editing, a click when read-only), and the window never navigates.

### What a save changes

**Opening a note never changes it, and a save rewrites only the blocks that changed.** The editor
keeps the text it loaded and its source map. While the document is the one it loaded (just
opened, or undone back to it), what it saves is that text, exactly. Once edited, each top-level
block that is still as it was read is written back as its slice of the text, byte for byte, with
the text that stood around it; only the other blocks are written anew, in the editor's spelling
(`keeping.ts`, `codec.writeKeeping`).

```markdown
# Title # Title

- one \* one
- two → \* two

**bold** text **bold** text!
```

Here `!` was typed after "text": the paragraph is written anew (`**bold**`), and the heading, the
`*` list and the single line end between them stay as they were.

- **What is kept.** The document's top-level blocks are matched with the source's in the order
  they were read by a diff (`diffBlocks` in `keeping.ts`: a longest common subsequence on `Node.eq`, the algorithm behind `diff`). A block that matches is kept; one
  that was edited, added or moved is new. Kept blocks that are still neighbours keep the exact
  text between them: blank lines, definitions, a single line end. The text before the first block
  and after the last (the final newline) is kept with them, and so are the file's line ends
  (`\r\n`): new markdown is written with the file's own.
- **Around a new block.** One written where the source had another gets the source's text on
  each side (`### Notes` straight above a list stays so when the list is edited). One added
  between two neighbours gets a blank line on each side. Where a block is removed, its
  neighbours are joined by one blank line.
- **Definitions** (`[docs]: https://…`) stay where they are while a block next to them is kept
  or rewritten in place. One whose surroundings are all gone is written at the end of the text,
  so the kept links that use it still read as links.
- **Empty paragraphs** are blank lines: one the source read from blank lines is kept with the text
  between its neighbours, a new one is a blank line more.
- **The check.** What keeping wrote is read back and compared with the document, block for
  block: a kept block must read as itself, a new one as the editor's spelling of it reads on its
  own. If it doesn't (indented code kept after a new list would continue the list's item), it is
  written again with a blank line around each new block, and if that still reads differently the
  whole document is written in the editor's spelling. Kept text never changes what a note means.

None of the text is kept, and the whole document is written anew (`KeptWriting.whole` says
why), in four cases. In the editor's spelling: when the text has no source map (`no-source`;
"The source map" lists the reasons), when the check fails (`readback-mismatch`), and when keeping
throws (`error`). With the markers its blocks were read with (below), the file's line ends and
its final newline: when no block is as it was read (`nothing-kept`, a note of one paragraph being
edited). The editor counts the first three by reason (`editor.storage.documentMarkdown.wholeWrites`)
and logs each reason once in development, never with the text.

**The check reads back only what the save wrote.** Reading the whole text back on every save
would cost a parse of the note per keystroke's save. Instead each stretch of new blocks is read
with the kept block on either side of it (and the text's definitions, for its reference links),
and must read as those blocks, the kept ones each from its own slice. A kept block that reads as
part of its new neighbour (a to-do list after a new bullet list is one list with it) is read by
what follows it too, so then, and whenever a stretch doesn't read as expected or a definition
moved, the whole text is read (`keeping.ts`, `Keeping.regionsOf`; `check: 'whole'` and `'both'`
ask for the whole text every time).

**A block written anew keeps the markers it was read with.** Where markdown has more than one
spelling and the text used another than the editor's, the node or mark keeps it in a `markup`
attribute (`markup.ts`; null for the editor's own spelling, which everything made in the editor
has), set by the rule that reads it and written back by the same rule:

| Node or mark               | `markup`                          | Written                                 |
| -------------------------- | --------------------------------- | --------------------------------------- |
| `bulletList`, `taskList`   | `*` or `+`                        | each item's bullet; a new item takes it |
| `orderedList`              | `)`                               | `1)` for `1.`                           |
| `taskItem`                 | `X`                               | `[X]` while it is checked               |
| `heading`                  | `setext:=====`, `setext:---`      | the text over its underline, as long    |
| `heading`                  | `##` (closing `#`s)               | `## Title ##`                           |
| `horizontalRule`           | the line (`***`, `___`, `* * *`)  | that line                               |
| `codeBlock`                | the fence (`~~~`, ` ```` `)       | that fence                              |
| `bold`, `italic`, `strike` | `__`, `_`, `~`                    | `__bold__`, `_italic_`, `~struck~`      |
| `hardBreak`                | `\`, or the tag (`<br>`, `<br/>`) | `\` at the line's end, or the tag       |

- The attribute is never drawn, read from HTML or copied: the clipboard
  (`editor.contentToMarkdown`, and `editor.markdownToContent` for a paste), `editor.getMarkdown()`,
  `serializeMarkdown`, `normalizeMarkdown` and a document written whole for want of a map or
  after a failed check use the editor's spelling, and pasted markdown is read without its
  markers (it isn't the note's text).
- A marker is written only where it can stand: an underline under one line of text of its own
  level (a title made a section takes `#`s), a fence no line of the code would close, a `<br>`
  outside a table cell (in a cell a line break is always `<br>`, and has no marker).
- Indented code (four spaces, no fence) has no marker: it stays as written while its block is
  kept, and is fenced once edited.
- **A marker never changes what a block reads as.** A block with markers is written with them,
  read back, and compared with the block: `_it_s` is no emphasis where `*it*s` is, so that
  paragraph is written in the editor's spelling. So is every new block of a save whose markers
  would join it to a neighbour (a `*` list put next to another `*` list).

Besides its markers, a block written anew, and all of a document written whole, are in the
editor's spelling:

- one blank line between the blocks inside it, and around a collapsible section's body;
- nothing where it reads as nothing: the spaces or line break a paragraph ends with, the
  indentation of a wrapped line;
- `-` bullets, `1.` numbers, `**bold**`, `*italic*`, `~~struck~~`, `#` headings, `---`, three
  backticks (indented code too), two trailing spaces for a line break;
- tables padded into columns;
- characters escaped only where they would read back as markup (`\*`, `\_`, `&lt;b`), so `A & B`
  and `x < y` stay as written;
- links written in full: a reference link (`[text][label]`) in an edited block becomes
  `[text](url)`, and its definition stays in the file.

Blocks are matched in order, so of two blocks that swap places one is kept and the other written
anew (with its markers). A list is one block: editing one item rewrites the list, with its
bullets.

### When reading or writing fails

The layer must never lose a note, whatever it is given:

- **Reading throws** (`codec.read` catches it): the text is shown as it is written, a line of a
  paragraph each, with no source map (`unreadable`). `RichTextEditor` keeps that editor
  read-only and says so in a toast; `saveMarkdown()` gives the text as loaded, so its file is
  untouched.
- **Keeping throws** (`codec.writeKeeping` catches it): the whole document is written in the
  editor's spelling (`whole: 'error'`).
- **Writing throws altogether** (`editor.saveMarkdown` catches it): it gives what it gave last, so
  nothing new is stored over the last good text, and a toast says the change wasn't saved. The
  next save that works clears it.

`editor.storage.documentMarkdown.problem` is `unreadable`, `unsaveable` or null, and `onProblem`
hears it change.

### Checking it on real files

Three checks stand beside the cases in the tests:

- **Properties** (`markdown-properties.test.ts`, with `fast-check`): generated documents read back
  as written and are written the same twice; generated texts (the real-world fixtures' blocks in
  any order, with either line end) save unedited as they are, and any single block replaced,
  removed or added saves as the edited document with the rest of the text as it was. `npm test`
  runs 300 cases of each; `MARKDOWN_PROPERTY_RUNS=10000 npm test -- markdown-properties` runs the
  10,000 they were built on. The generated text leaves out `<`, `>`, `@`, `|` and bare web addresses, which read as HTML, an email link, a table's cell and a link.
- **The corpus** (`npm run markdown:corpus -- <folders>`, not part of `npm test`): reads every
  `.md` file under the folders, and for each checks that the source map's pieces are the text,
  that it saves unedited as it is, and that an edit, a removal and an addition at eight of its
  blocks (`--all-blocks` for every one) each save as the edited document and leave the rest of the
  text alone, reading the save back both ways. It prints what it found and exits with 1 when a
  text could be lost. Run it on `docs node_modules`, and on real notes (an Obsidian vault, a
  wiki's checkout) before a release.
- **The file on disk** (`e2e/flows/note-file.spec.ts`): a note's file written as another app
  would write it is opened, left, and edited in one paragraph, and is read back from disk each
  time.

On `docs/` and `node_modules` (1,673 files, 31,346 saves): no text lost or changed, 98.9% of the
saves kept the text outside their block, and 1.1% wrote the whole document (317 of the 331 a
removal that brings its two neighbours together: two lists, which read as one). 27 of the files
are written differently the second time the editor writes them whole: a table or raw HTML inside
a list item, a paragraph straight above a list, marks that close in another order. Nothing is
lost, but such a note changes once more on its second whole write; they are listed by the corpus
run ("unstable spelling").

Timings and budgets: [performance.md](performance.md) ("The editor's markdown").

`src/renderer/tests/editor/markdown.test.ts` holds the documents that must come back unchanged
("markdown round trip"), what a save keeps ("saving what was read"), each marker ("keeping
markers in an edited block") and what a save must never render ("untrusted content through a
save"); `markdown-keeping.test.ts` edits, removes and adds a block at every place in each
real-world fixture, with both line ends. Add a case when a new kind of content must survive.

## Extending it

The document model is `createDocumentExtensions()` (`markdown/index.ts`); `parseMarkdown`,
`serializeMarkdown` and `normalizeMarkdown` use the same schema and rules without an editor. A new
kind of element is a TipTap node (or mark) with:

1. a `MarkdownRule` exported beside it: a `tokenizer` for its syntax (inline or block) if `marked`
   doesn't read it, `parse` to make the node from the token, and `render` to write it back exactly.
   List it in `DOCUMENT_RULES` (`markdown/rules/index.ts`), minding the order there. If its
   syntax has more than one spelling, add it to `MARKUP_TYPES` (`markdown/markup.ts`), read the
   marker in `parse` (`withMarkup`) and write it in `render` (`markupOf`), checking there that
   it can stand, and add a row to the markers' test;
2. `parseHTML`/`renderHTML` for copy and paste;
3. for a React view, `addNodeView()` with `ReactNodeViewRenderer`, as `EntityPillView.tsx` does.

A new HTML tag joins the list in `extensions/html-elements.ts` (and is then left alone by
`raw-html.ts`); check first that GitHub renders it, so the format stays readable there.

Add the schema node to `createDocumentExtensions` and its view in `RichTextEditor`, and a round
trip case to `src/renderer/tests/editor/markdown.test.ts`. Menus that open on a character use
`createSuggestionMenu` (`suggestion/suggestion.tsx`), which positions a design-system menu under the
caret and passes it the keys: `slash-menu.tsx` and `entity-menu.tsx` are the two in use. While a new
query's items load, it keeps the last items on screen (`items`, found for `itemsQuery`), so the menu
never flashes empty between keystrokes; filter by the live `query` only when the menu does it
itself, as the slash menu does.
