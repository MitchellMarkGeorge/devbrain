# Button

shadcn's Button (`variant` and `size`), on Nova's sizes, keeping DevBrain's quiet everyday button: Nova's dark outline treatment (`input` at 30% fill, `input` edge), 14px medium text and 10px corners.

- `variant`: `default` (the quiet bordered button: "New Task", "Show in Finder", "Choose File", dialog confirms), `outline` (page-coloured with a `border` line: toolbar Filter and Sort), `secondary` (fill, no outline), `ghost` (text only: "Close", toolbar icons), `destructive` (the default look with `destructive` text: never a red fill), `link` ("View all tasks →", `muted-foreground`), `primary` (light fill; DevBrain screens almost never need it).
- `size` (Nova): `default` 32px, `sm` 28px (13px text), `lg` 36px, `xs` 24px with 12px text for in-row actions ("+ Add", "Join"); `icon` 32px, `icon-sm` 28px (editor toolbar), `icon-xs` 24px (sidebar, panel headers); 8px corners below 32px. `destructive` is Nova's tint (`destructive` at 20%), never a solid red. Icon-only buttons are `IconButton`s, which always have a label.
- Note: shadcn's own `default` is a filled button. DevBrain keeps the name but gives it the Figma quiet look, and moves the filled style to `primary`.

**Base UI:** `Button` (`@base-ui/react/button`). Use its `render` prop where shadcn uses `asChild`; set `nativeButton={false}` when rendering a non-button element. Styles key off `data-disabled`.

- `value` (DevBrain Nova Lists): the current choice after the label, for toolbar buttons: "Filter Assigned to me", "Sort Due date". The label turns `muted-foreground`, the value stays `foreground` at 500. The button keeps Nova's quiet look.
- Pressed: every button sinks 1px while it is held (Nova); a menu trigger stays put as its menu opens. A toggle that is on (`aria-pressed`) fills with `accent`, as a toolbar filter that is set does in compact windows. A button whose menu or popover is open keeps its hover look.
