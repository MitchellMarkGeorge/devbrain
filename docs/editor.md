# Rich text editor

`RichTextEditor` (`src/renderer/editor`) is the one editor for note bodies, task, project and event
descriptions, and read-only synced descriptions. It is built on [TipTap](https://tiptap.dev) v3
(ProseMirror) with TipTap's own markdown package, `@tiptap/markdown`: markdown in, markdown out.

```tsx
// in a page: the editor acting in the open workspace (shared/components/WorkspaceRichTextEditor.tsx),
// reading its content query (shared/api/content.ts) and saved as it is typed (shared/hooks/use-autosave.ts)
const content = useQuery(noteContentQuery(noteId)).data; // primed by the page's loader
const body = useEditorAutosave(noteContentQuery(noteId).queryKey, content, save);
<WorkspaceRichTextEditor
  label="Note"
  value={body.value}
  revision={body.revision}
  onChange={body.onChange}
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
  window losing focus and when a workspace switch starts. It reads the editor's content query,
  which only a change from outside the editor refetches (below).
- `onChange` only fires after an edit, never on load. Opening a note and closing it leaves its
  file alone, and undoing back to the start sends `value` exactly as it was stored.
- A new `value` from outside (a sync, a reattach) replaces the content; the markdown the editor
  just sent is not loaded again. A new `revision` makes it look at `value` again when
  the string is unchanged. It holds one text, never a history of what it sent.
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

## Content queries, and what a save refetches

Each editor reads its text from a **content query** (`shared/api/content.ts`): a note's
`notes.readContent`, and for a task, project or event description a query of its own
(`taskContentQuery`, keyed `[['content', 'task'], { id }]`) that reads the entity's `get` route and
keeps its `description` (`''` for none). The page's loader primes it, as loaders prime every query
(the task, project and note pages; the sheets load it as they draw).

- **A save writes the cache itself, and is never refetched.** The hook puts the text, as stored,
  in the content query when it saves (`storeContent`), so leaving the page and coming back shows the
  latest save, even one still on its way to main. The save reports its entity (`task`, `note`,
  `project`, `event`), which refetches the lists, search, pills and the entity's own `get`, but
  not the content query, which reads only `content`
  ([ipc/design.md](ipc/design.md#invalidation-in-the-renderer)).
- **Core reports `content` only for a rewrite from outside the editor**: a sync page that wrote
  tasks, projects or events, a synced calendar's history fetched for a read, and a reattach. The
  content query refetches then, and the editor follows. There is one window, so every save comes
  from this renderer, and anything else that rewrites the text is from outside by definition.
- **So the hook holds one text**: its latest save, or the one it was last given. When the content
  query's text differs from it, the change is from outside: the editor is given it, and
  `revision` is bumped, which makes the editor load `value` even when the string is the one it was
  last given (reattaching a task restores Linear's description). Nothing of the editor's own comes
  back later to be told apart from a change.
- **A save cancels a refetch in flight** on its content query: one for a change from outside that
  started before the save, whose answer would be older than it. And a note's `readContent` waits
  for the note's queued saves (`NoteService`), so a refetch never reads a file a save is replacing.
- A recurring event's description saves once you leave the editor, through the question of which
  occurrences; the event that then holds it gets the text in its content query once saved.
- A note file edited on disk by another app is not followed: nothing watches the files, and the
  content queries don't refetch on focus.

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

Loading a note and saving it gives the file back, except for these spellings, which the editor
writes its own way (after the first save the file stays as it is):

- one blank line between blocks (a heading straight above its paragraph gets one), and inside a
  collapsible section around its body;
- `<br>` outside a table cell becomes two trailing spaces, GFM's line break;
- `-` bullets (`*` and `+` become `-`), `**bold**` and `*italic*` (not `__` and `_`);
- tables padded into columns;
- characters escaped only where they would read back as markup (`\*`, `\_`, `&lt;b`), so `A & B`
  and `x < y` stay as written.

`src/renderer/tests/editor/markdown.test.ts` holds the documents that must come back unchanged;
add a case there when a new kind of content must survive.

## Extending it

The document model is `createDocumentExtensions()` (`markdown.ts`); `parseMarkdown`,
`serializeMarkdown` and `normalizeMarkdown` use the same extensions without an editor. A new kind
of element is a TipTap node with:

A new HTML tag joins the list in `extensions/html-elements.ts` (and is then left alone by
`raw-html.ts`); check first that GitHub renders it, so the format stays readable there.

1. `markdownTokenizer` for its syntax (inline or block), `parseMarkdown` to make the node from the
   token, and `renderMarkdown` to write it back exactly;
2. `parseHTML`/`renderHTML` for copy and paste;
3. for a React view, `addNodeView()` with `ReactNodeViewRenderer`, as `EntityPillView.tsx` does.

Add the schema node to `createDocumentExtensions` and its view in `RichTextEditor`, and a round
trip case to the tests. Menus that open on a character use `createSuggestionMenu`
(`suggestion/suggestion.tsx`), which positions a design-system menu under the caret and passes it
the keys: `slash-menu.tsx` and `entity-menu.tsx` are the two in use. While a new query's items
load, it keeps the last items on screen (`items`, found for `itemsQuery`), so the menu never
flashes empty between keystrokes; filter by the live `query` only when the menu does it itself,
as the slash menu does.
