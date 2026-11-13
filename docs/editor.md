# Rich text editor

`RichTextEditor` (`src/renderer/editor`) is the one editor for note bodies, task, project and event
descriptions, and read-only synced descriptions. It is built on [TipTap](https://tiptap.dev) v3
(ProseMirror) with TipTap's own markdown package, `@tiptap/markdown`: markdown in, markdown out.

```tsx
// in a page: "@" search, links, the pills' entities and opening them (pages/app/use-editor-host.ts)
const host = useEditorHost();
// saved as it is typed, without its own save's refetch putting older text back (pages/app/autosave.ts)
const body = useEditorAutosave(content, (markdown) => save(markdown));
<RichTextEditor {...host} label="Note" value={body.value} onChange={body.onChange} />;
```

- `useEditorHost` combines `useWorkspaceEditorHost` ("@" search, `onOpenUrl`),
  `useEntityResolver` (`resolveEntity` and `watchEntity`: each pill reads its entity from React
  Query's cache through `tasks.get`, `projects.get`, `notes.get` or `events.get`, loads it the
  first time it is drawn, and draws again when it changes; a deleted one is drawn as missing) and
  `useOpenEntity`. Every page's editor takes it.
- `useEditorAutosave` saves 500ms after typing stops, and at once on leaving the page, on the
  window losing focus and when a workspace switch starts. A save makes core report the entity
  changed, so the text is refetched; by then more may have been typed. The editor is only handed
  a text it never saved itself (a change from elsewhere), so its own save coming back never
  overwrites what was typed since.

- `onChange` only fires after an edit, never on load. Opening a note and closing it leaves its
  file alone, and undoing back to the start sends `value` exactly as it was stored.
- A new `value` from outside (the file changed on disk, a sync) replaces the content; the markdown
  the editor just sent is not loaded again.
- Try it in Storybook (`npm run storybook`, Editor/RichTextEditor): a full note, an empty one,
  a read-only description and untrusted content, each beside the markdown it would save.
- The editor never calls IPC. What it needs from the app is `EditorHost` (`types.ts`).
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
  ⌘K with no selection and no link under the caret is left to the app's search. The colour button
  and Turn into task are left out: text colours are not in the note format, and the editor can't
  make tasks yet.
- `/` opens the `SlashMenu`; "Link to note", "Link to task" and "Mention event" open the `@` menu
  for that kind, and "Task" is left out until tasks can be made from the editor. `@` searches
  tasks, notes and events, as the `MentionMenu` shows them (a project link in a note still reads
  as a pill).

## Vim keys

With Settings › General › Vim keys on, every editable `RichTextEditor` has Vim's modes
(`extensions/vim.ts`, Figma `7714:56193`–`7714:56845`). `useEditorHost` passes `vim` from the
active keymap; the extension does nothing while it's off, and nothing in a read-only editor.

- **Normal** is where focus coming in finds it: a block cursor on the character and relative line
  numbers (drawn by `EditorContent`), and keys that move rather than type: `h`/`j`/`k`/`l`
  (and the arrows), `w`/`b`/`e`, `0`/`^`/`$`, `gg`/`G` (`3G`: line 3), each with a count; `x`,
  `dd` (a list item's line takes the item, and a list's only item the list), `yy`, `p`/`P` (after
  or before the line), `u` and `Ctrl-r`. `i`, `a`, `I`, `A`, `o` and `O` go into Insert (`o` makes a
  new line of the line's kind, through TipTap's Enter). Esc leaves the editor: it loses focus, and
  the app's keys (`h`, `g n`) work again. Any other key typed is dropped; ⌘ and Alt chords (⌘B)
  are left to TipTap and the app.
- **Insert** is the editor as it is without Vim: TipTap takes every key, `/` and `@` included.
  Esc goes back to Normal, the cursor one to the left, once the `/` or `@` menu or the link editor
  has had the Esc it wanted (`VimInsertEscape` runs last).
- **Visual** (`v`) selects from where it began to the cursor, inclusive; **Visual line** (`V`)
  whole lines. The motions grow it; `d` or `x` deletes it, `y` copies it, `>` and `<` nest and
  un-nest list items, `v`/`V` switch between them or end, Esc ends it.
- `yy`, `dd` and Visual's `y`/`d` keep what they took for `p`, and put its text on the system
  clipboard. Each change is an undo step of its own (`closeHistory`), so `u` takes back one `dd`
  however soon the next came.
- The mode is the editor's `data-key-mode`, which the app's dispatcher reads when focus comes in
  and again on the `MODE_CHANGE_EVENT` the plugin sends as it changes, so the mode line shows
  NORMAL, INSERT, VISUAL or VISUAL LINE, with the editor's keys on its right. While focus is in the
  editor the app's own keys stay off (the dispatcher leaves `contenteditable` alone).

Not built yet (see `docs/follow-ups.md`, "Vim mode"): `/` to search the note, the line and column
in the mode line, and `i` to go back into the editor once Esc has left it.

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
