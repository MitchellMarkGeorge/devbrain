# GroupHeading

A group in the grouped list, as a band: `group-height` (36px) of `muted` with `radius-md` corners and `group-gap` (12px) of space above it. In one line: a 14px chevron in `subtle-foreground`, the group's 14px icon in its colour (or an event's colour bar), the title (14px medium, `foreground-strong`), an optional subtitle and the count (14px, `muted-foreground`). With `onAddTask`, an xs "+" sits at the far right and shows only while the band is hovered or holds focus. Hovering lifts the band to `accent`.

- One heading for every way a list groups: by project (a folder in the project's swatch), status (the `StatusIcon`), priority (the `PriorityIcon`; no priority is a muted dash), due date (Overdue in `status-overdue`, Today in `date-today`, later buckets muted) and what tasks link to (an event's `ColourBar`, a note's muted file icon). Pass a `StatusIcon` or `PriorityIcon` at `size={14}`.
- `subtitle` is for an event's time ("Today, 10:00 AM"), read after its title. Keep other groups to a title and a count: no progress, no due date.
- The band is `position: sticky`: in a scrolling list it stays at the top while its group scrolls under it, and the next group's band slides over it. Keep headings as siblings of their rows in the scroll container, as `TaskList` lays them out.
- `collapsed` points the chevron right and hides the "+". `onCollapsedChange` makes the chevron a button.
