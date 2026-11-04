# Rich text editor

`RichTextEditor` (`src/renderer/editor`) is the one editor for note bodies, task, project and event
descriptions, and read-only synced descriptions. It is built on [TipTap](https://tiptap.dev) v3
(ProseMirror) with TipTap's own markdown package, `@tiptap/markdown`: markdown in, markdown out.

```tsx
const host = useWorkspaceEditorHost(); // "@" search and opening links
<RichTextEditor
  {...host}
  label="Note"
  value={note.content}
  onChange={save}
  resolveEntity={(type, id) => entities.get(id)} // current titles for the pills
  onOpenEntity={(type, id) => navigate(type, id)}
/>;
```

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
the keys: `slash-menu.tsx` and `entity-menu.tsx` are the two in use.
