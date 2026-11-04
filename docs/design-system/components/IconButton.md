# IconButton

A `Button` that is only an icon, with a name it can't do without: `label` is read out and shown in a `Tooltip` ("Close", "More actions", "Open as page"). `ghost` by default, as icon buttons are in toolbars, panel headers and rows; every Button variant works.

- `size`: `default` 32px, `sm` 28px (editor toolbar, selection bar), `xs` 24px (sidebar, panel headers), with 8px corners below 32px.
- `tone="muted"`: rests in `muted-foreground` and lifts to `foreground` on hover, while its menu is open or while pressed, for icons that sit quietly in a panel header, the sidebar or a row.
- `tooltip`: the label by default; other content (a shortcut, "Bold ⌘B"), or `false` when something nearby already names the button, such as a dialog's ×, which takes focus as the dialog opens.
- A toggle (the detail page's star) sets `aria-pressed` and changes its label with its state.

**Base UI:** `Button`, wrapped in a `Tooltip`. It forwards its ref, so it can be a trigger through `render`: `<Menu.Trigger render={<IconButton icon={Ellipsis} label="More actions" />} />`.
