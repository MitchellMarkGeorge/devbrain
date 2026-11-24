# Rich text editor

`RichTextEditor` (`src/renderer/editor`) is the one editor for note bodies, task, project and event
descriptions, and read-only synced descriptions. It is built on [TipTap](https://tiptap.dev) v3
(ProseMirror) with TipTap's own markdown package, `@tiptap/markdown`: markdown in, markdown out.

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
  file alone. What it sends keeps every block unchanged since the text was loaded as it was
  written there, and writes only the edited blocks in the editor's own spelling, so undoing back to
  the start sends the text exactly ("What a save changes", below).
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

Markdown has several spellings for one thing (`* one` and `- one`, `__bold__` and `**bold**`), and
the editor reads them all into the same document, so it can only write back one. A save therefore
rewrites **only the blocks you edited**; every other block is written back exactly as it was in
the file, with the blank lines around it:

- When a text is loaded, the editor maps each of its top-level blocks to the slice of the text it
  was read from (`MarkdownSource`, `readSource` in `markdown.ts`), from the top-level tokens
  TipTap's parse read the text into as it loaded it, each with the nodes it gave (the manager keeps
  them from its last `parse`), so the text is not read twice; a text it didn't just parse is read
  again with the same lexer. Extra blank lines read as empty paragraphs, which have no slice.
- When it writes markdown (`serializeKeeping`), each top-level block still equal to one it loaded
  is written as that slice, and the text between two such blocks that were neighbours in the file
  is the file's own. A block you edited is written in the editor's spelling in its place, with the
  file's text around it there (`### Notes` straight above a list stays so when the list changes);
  one you added, or moved, gets a blank line either side, as a plain serialization would. Nothing
  edited gives the file back byte for byte, and the file's final newline stays.
- Where a kept block meets one written anew (or one moved from elsewhere in the file), the two are
  read back together, as are the empty paragraphs the document opens or ends with. If the file's
  own text around an edited block makes them read as anything else (`First\n* a` with the list
  turned into a paragraph would join the two paragraphs), they get a blank line instead; if they
  still read differently (an indented code block kept after a new list would continue the list's
  item), the whole document is written in the editor's spelling. Blocks kept side by side read as
  they did in the file.
- Link reference definitions (`[docs]: https://…`) read as no block. They are kept with the text
  around them, and a save that leaves that text out writes them at the end of the file, so the kept
  links that use them still read as links. A label defined twice is fine, as in GitHub's comments
  (`[//]: # (start)`), unless the two differ and a link could use it.
- A file written with `\r\n` line ends is read as `\n` and written back with `\r\n`.
- There is no map, and the whole document is written in the editor's spelling, when the text
  can't be lined up with the document: a definition inside a quote or a list item (it would go
  with that block), or line ends that mix `\r\n` and `\n`.

A block that is written anew keeps the markers it was read with, where markdown has more than
one (`extensions/markup.ts`): each is a `markup` attribute on the node or mark, null for the
editor's own spelling, and never drawn or read from HTML. The extensions are left as they are: the
manager wraps their parse and render handlers as it registers them, so the UI's versions (the code
block's view) keep markers too.

- `*` and `+` bullets, in bullet and to-do lists (an item added to a `*` list gets a `*`);
- `1)` numbers;
- `__bold__` and `_italic_`;
- an underlined (setext) heading, with its underline as it was;
- `***` and `___` rules;
- `~~~` and longer fences, and code indented four spaces.

Written back, a marker can read as something else where it now stands (`_it_s` is no emphasis,
`*it*s` is), so a rewritten block with any marker is read back on its own, and written in the
editor's spelling if it reads differently. Content made in the editor has no markers, so it gets
the editor's spelling, as does a document written whole (`serialize`: no map, or a seam that
misreads), which `stripMarkup` gives.

The editor's own spelling, used for new content and for a document written whole:

- one blank line between blocks (a heading straight above its paragraph gets one), and inside a
  collapsible section around its body;
- `<br>` outside a table cell becomes two trailing spaces, GFM's line break;
- `-` bullets, `1.` numbers, `**bold**` and `*italic*`, `#` headings, `---` rules and ` ``` `
  fences;
- tables padded into columns;
- characters escaped only where they would read back as markup (`\*`, `\_`, `&lt;b`), so `A & B`
  and `x < y` stay as written.

An edited block still gets the editor's spelling for what has no marker attribute: its tables are
padded, its escapes and `<br>` written as above.

Keeping a block, or its markers, also keeps meaning the editor's spelling would lose: two lists
side by side that differ only in their bullet (`*` then `+`) are two lists, but written both with
`-` and a blank line between, they read back as one.

`src/renderer/tests/editor/markdown.test.ts` holds the documents that must come back unchanged,
and what a save keeps when one block changed; add a case there when a new kind of content must
survive. `markdown-keeping.test.ts` edits, removes and adds every block in turn of markdown written
elsewhere (`fixtures/real-world`: a README, Obsidian notes, a GitHub pull request, a Linear issue,
the seed and showcase notes), with `\n` and `\r\n` line ends; add a file there for a new source.

## Extending it

The document model is `createDocumentExtensions()` (`markdown.ts`); `parseMarkdown`,
`serializeMarkdown` and `normalizeMarkdown` use the same extensions without an editor. A new kind
of element is a TipTap node with:

A new HTML tag joins the list in `extensions/html-elements.ts` (and is then left alone by
`raw-html.ts`); check first that GitHub renders it, so the format stays readable there.

1. `markdownTokenizer` for its syntax (inline or block), `parseMarkdown` to make the node from the
   token, and `renderMarkdown` to write it back exactly (where its syntax has several spellings,
   an entry in `MARKUP` in `extensions/markup.ts`, which reads the one used from the token and
   writes it back);
2. `parseHTML`/`renderHTML` for copy and paste;
3. for a React view, `addNodeView()` with `ReactNodeViewRenderer`, as `EntityPillView.tsx` does.

Add the schema node to `createDocumentExtensions` and its view in `RichTextEditor`, and a round
trip case to the tests. Menus that open on a character use `createSuggestionMenu`
(`suggestion/suggestion.tsx`), which positions a design-system menu under the caret and passes it
the keys: `slash-menu.tsx` and `entity-menu.tsx` are the two in use. While a new query's items
load, it keeps the last items on screen (`items`, found for `itemsQuery`), so the menu never
flashes empty between keystrokes; filter by the live `query` only when the menu does it itself,
as the slash menu does.
