# ColourBar

A calendar's colour as a bar: 3px wide, 12px tall, 2px corners, in a `swatch-*` colour (Figma's `ColourBar`). It is how an event shows which calendar it belongs to.

- `color`: a swatch name or a CSS colour; `height`: 12px in pills, badges and board cards (the default), 16px in the sidebar's icon slot, 20px beside an event row's two lines.
- Decorative (`aria-hidden`): the event's name says what it is.
- One component for every bar: `Badge` (`barColor`) draws it; `EntityPill`, `Sidebar`, `EventRow`, `BoardCard`, `GroupHeading` and `EntityHoverCard` should too, rather than each drawing its own.

**Base UI:** No Base UI part: a `span` that takes `render`.
