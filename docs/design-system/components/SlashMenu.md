# SlashMenu

The note editor's "/" menu, 260px wide under the caret, drawn as a menu: groups under labels with separators between them, 28px items with a 16px icon, the label and the Markdown shortcut on the right.

- **Basic blocks**: Text, Heading 1 (#), Heading 2 (##), Heading 3 (###), Code (```), Quote (>), Callout (a Note `Callout`, its kind changed from its title).
- **Lists**: Bulleted list (-), Numbered list (1.), To-do list ([ ]).
- **DevBrain**: Task, Link to note, Link to task, Mention event.
- **Others**: Divider (---), Table, Collapsible section (a `<details>` section in the note).

**Placement.** Below the caret, or above it when there's more room there, kept 8px inside the window. It is `fixed`, so it never makes the page or window taller, and no taller than 560px, 70% of the window or the room it has beside the caret (`--suggestion-max-height`, which the editor sets as it places it); the list scrolls past that.

Typing after the "/" narrows the list to the items whose name (or a keyword such as "h1") matches; empty groups drop out, and nothing matching shows "No results". The first match is highlighted.

The caret stays in the editor while the menu is open: the editor passes ↑, ↓, Enter and Tab on through `handleRef` (`onKeyDown` returns true when the menu used the key, as editor libraries' suggestion plugins expect). Pointing at an item highlights it; clicking picks it. `SuggestionMenu` is the list underneath, shared with the `MentionMenu`. Since focus stays in the editor, the editor's element names the list (`aria-controls`, the list's `id`) and the highlighted item (`aria-activedescendant`, from `onActiveDescendantChange`) while the menu is open, so a screen reader announces each item as ↑ and ↓ move.

**Base UI:** No Base UI part (the editor keeps focus): a `listbox` with `option`s and `aria-activedescendant`, styled with the menu's classes.
