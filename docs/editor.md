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
- The editor never calls IPC. What it needs from the app is `EditorHost` (`types.ts`).
- Styles are CSS Modules over the design-system tokens: the document in `RichTextEditor.module.css`,
  the menus in `suggestion/SuggestionMenu.module.css` (Command) and the pills in
  `EntityPill.module.css` (EntityPill).

## What it reads and writes

GitHub-flavoured markdown: headings, paragraphs, bold, italic, strikethrough, inline code,
underline (`<u>`), bulleted, numbered and to-do lists (nested), quotes, code blocks, rules, tables,
links and autolinks, hard breaks. On top of that:

| Written as                                                             | Shown as                                                                 | Where                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
| `[Fix login](devbrain://task/tsk_…)` (also `project`, `note`, `event`) | An EntityPill with the entity's current title; the label is the fallback | `extensions/entity-link.ts` |
| `![alt](url "title")`                                                  | A chip with the alt text; the image is never loaded                      | `extensions/image-link.ts`  |
| HTML, block or inline (`<details>`, `<kbd>`)                           | Its source, as text; never rendered                                      | `extensions/raw-html.ts`    |
| `[text](javascript:…)` and other refused targets                       | Plain text; the target stays in the file                                 | `extensions/safe-link.ts`   |

These follow [untrusted-content.md](security/untrusted-content.md): no raw HTML, no remote images,
links only through `safeExternalUrl` and `Workspace.openUrl` (⌘/Ctrl-click while editing, a click
when read-only), and the window never navigates.

### What a save changes

Loading a note and saving it gives the file back, except for these spellings, which the editor
writes its own way (after the first save the file stays as it is):

- one blank line between blocks (a heading straight above its paragraph gets one);
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

1. `markdownTokenizer` for its syntax (inline or block), `parseMarkdown` to make the node from the
   token, and `renderMarkdown` to write it back exactly;
2. `parseHTML`/`renderHTML` for copy and paste;
3. for a React view, `addNodeView()` with `ReactNodeViewRenderer`, as `EntityPillView.tsx` does.

Add the schema node to `createDocumentExtensions` and its view in `RichTextEditor`, and a round
trip case to the tests. Menus that open on a character use `createSuggestionMenu`
(`suggestion/suggestion.ts`): `slash-menu.tsx` and `entity-menu.tsx` are the two in use.
