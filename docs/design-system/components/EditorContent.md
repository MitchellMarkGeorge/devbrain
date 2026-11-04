# EditorContent

The note editor's block styles, for whichever editor library DevBrain adopts: wrap the editor's content element in `EditorContent` (or give it `editorContentClassName`). It styles the HTML editors emit, so the library needs no styling of its own. `EditorTitle` is the note's title above it.

- **Title**: 24px semibold `foreground-strong`; "Untitled" in `subtle-foreground` while empty.
- **Text**: 14px / 20px `foreground`, blocks 12px apart. Headings in semibold `foreground-strong`: H1 24px, H2 20px, H3 16px, 24px above them.
- **Lists**: 20px indent, items 6px apart, markers in `muted-foreground`.
- **To-dos** (Tiptap's task list markup): a 16px checkbox (the `Checkbox` look) then the text, 8px apart, 28px rows; done ones struck through in `muted-foreground`.
- **Code blocks** (`pre[data-language]`): a `card` panel with 10px corners, 12px × 16px padding, the language as a 12px `muted-foreground` label, the code in 13px mono.
- **Quotes**: a 2px `border-strong` bar, the text 12px in from it in `muted-foreground`.
- **Inline**: links underlined in `muted-foreground`, inline code on `accent` in mono, highlights on `accent` (or the ColourMenu's colours), the selection a 35% `swatch-blue`.
- **Placeholders**: an empty block with `data-placeholder` shows it in `subtle-foreground` ("Start writing, or press / for commands…", "Press / for commands…", "Heading 2").

The rich-text editor itself is not part of the design system yet; the floating chrome around it is (`FormatToolbar`, `LinkToolbar`, `TurnIntoMenu`, `ColourMenu`, `SlashMenu`, `MentionMenu`).
