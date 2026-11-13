# Command

The command palette on the menu surface: a search row over grouped results, group labels 12px medium `muted-foreground`, items like menu items.

- The search row is Figma's `MenuSearch`: 36px, 8px insets, a `border-strong` line under it.
- **⌘K search** (`CommandDialog`, Figma's "Search"): 640px, 120px from the window's top (centred on the window), 14px corners, `shadow-2xl`. The search row is 52px with 16px insets, 10px gap, the typed text in `foreground-strong` and `<Kbd>Esc</Kbd>` on the right (`trailing`), with no line under it. Then the type filter (All / Tasks / Notes / Projects / Events) as `ToggleGroup`'s `outline` variant with each type's icon and result count (`CommandToolbar`, 16px insets, 8px below). Results 8px in from the sides.
- Result groups take an uppercase 12px `muted-foreground` label (0.5px tracking, 8px × 8px above, 4px below) and a count badge (12px `muted-foreground` on `accent`, 5px side padding, 4px corners); link groups such as "Go to" have no count.
- Results (`CommandItem variant="result"`): 36px, 8px padding, 10px gap, 8px corners; the icon (status icon, file, coloured folder, event's colour bar), the title (a synced task's `SourcePill` after it, `trailing`), the meta on the right in 12px `subtle-foreground` (`meta`: the project, "2h ago", "Due Jul 1"), and a ↵ `Kbd` on the highlighted one, centred on the row (also in a two-line row, where the icon, title and meta keep to the top line). Notes, projects and events add a two-line 12px `muted-foreground` snippet (`description`). `CommandMatch` sets the searched words in semibold `foreground-strong`.
- Footer band (`CommandFooter`): `muted` at 50% under a `border-strong` line, 10px × 16px, hints 16px apart (`CommandHint`: a `Kbd` and 12px `muted-foreground` text): ↑↓ Navigate, ↵ Open, Tab Change filter.
- Use for "Link to…" and ⌘K search. Value pickers inside menus (projects) use `ProjectPicker` instead. The editor's "/" and "@" menus are not a Command: the caret stays in the note while they are open, so they are the `SlashMenu` and `MentionMenu`, which the editor drives.

**Accessibility.** The dialog is named by `label` ("Search"); a visually hidden Close button serves a screen reader's own navigation and stays out of the tab order (Esc closes). The results announce their count through a polite `CommandStatus`.

**Base UI:** `Autocomplete` in a `Dialog`, following Base UI's command-palette pattern (it replaces shadcn's cmdk). Styles key off `data-highlighted` on items.
