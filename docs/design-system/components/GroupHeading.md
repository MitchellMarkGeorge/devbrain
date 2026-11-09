# GroupHeading

A group in the grouped list, as a band: `group-height` (36px) with `radius-md` corners and `group-gap` (12px) of space above it. In one line: a 14px chevron in `subtle-foreground`, the group's 14px icon in its colour (or an event's colour bar), the title (14px medium, `foreground-strong`), an optional subtitle and the count (14px, `muted-foreground`). With `onAddTask`, an xs "+" sits at the far right and shows only while the band is hovered or holds focus.

## Tint

The band is `muted` with 8% of the group's colour mixed in: `color-mix(in oklab, <color> 8%, var(--muted))`. `color` (or an event's `bar`) takes any swatch or CSS colour, so a new colour needs no token. Hovering swaps `muted` for `accent` under the same 8%. A group without a colour keeps the plain `muted` band: Not started, No priority, later due-date buckets, a note, No link. The mix is opaque, so a stuck band still covers the rows scrolling under it.

- One heading for every way a list groups: by project (a folder in the project's swatch), status (the `StatusIcon`, with `color` its `status-*` token), priority (the `PriorityIcon` with its `priority-*` token; no priority is a muted dash and no colour), due date (Overdue in `status-overdue`, Today in `date-today`, later buckets muted) and what tasks link to (an event's `ColourBar`, a note's muted file icon). Pass a `StatusIcon` or `PriorityIcon` at `size={14}`; they colour themselves, and `color` tints the band.
- `subtitle` is for an event's time ("Today, 10:00 AM"), read after its title. Keep other groups to a title and a count: no progress, no due date.
- In a grouped `TaskList` the band sticks to the top of the list while its group scrolls under it, and the next group's band covers it (`TaskList` does the sticking, with `group-gap` above every heading but the first). It is `group-height` (36px) tall with 2px (`space-0-5`) under it, which `TaskList` uses to place headings before it measures them.
- `collapsed` points the chevron right and hides the "+". `onCollapsedChange` makes the chevron a button.
