# DevBrain Nova design system

> **Superseded.** This is DevBrain Nova, kept for reference. The current system is the [DevBrain design system](../../README.md).

An alternative to [the DevBrain design system](../devbrain-v1/README.md), kept beside it for
comparison.

- `tokens.json`: the same token families and names as `../devbrain-v1/tokens.json`, with Nova's
  radius, size and type values and one added colour, `edge`.
- `nova-layer.css`: the style layer, loaded after the DevBrain component stylesheet. In the app it
  becomes the stylesheet that fills shadcn's `cn-*` class hooks (see "How this system is built").
- Source: shadcn's v4 registry, `apps/v4/registry/styles/style-nova.css` and the Base UI components
  in `apps/v4/registry/bases/base/ui`.

DevBrain Nova is DevBrain's design system rebased on shadcn's **Nova** style ("reduced padding and margins"): shadcn's current component sizes, corners and spacing, with DevBrain's colours, glyphs and signature components kept so the app still looks like DevBrain. It sits beside the DevBrain Design System so the two can be compared; the components, tokens and names are the same, and only the values below differ.

## What comes from Nova and what stays DevBrain

**From Nova** (shadcn v4 registry, `style-nova.css`):

- **Sizes.** 32px is the default for buttons, inputs, selects, segmented controls and sidebar items; 28px `sm` and menu items; 24px `xs`, `icon-xs` and pills; 36px `lg`. Rows are 40px.
- **Type.** Controls, menus, inputs, labels, rows and descriptions use 14px (`text-sm`): medium for buttons, labels and tabs, regular for rows and menu items. Badges, metadata, shortcuts and menu labels use 12px. Dialog and card titles are 16px medium.
- **Corners.** shadcn's 10px radius scale: `radius-md` (8px) for items inside a control, `radius-lg` (10px) for controls, menus and popovers, `radius-xl` (14px) for cards, dialogs, sheets and toasts.
- **Edges.** Raised surfaces (cards, menus, popovers, dialogs, sheets, toasts) take the translucent `edge` outline, Nova's `ring-foreground/10`, instead of a solid line, so they read on any ground.
- **Fields.** Inputs and checkboxes sit on an `input` fill at 30% with an `input` outline, so they are findable at rest.
- **Destructive.** `destructive` is a red tint (20%) with red text, never a solid red.
- **Dialogs.** 16px padding and gap, 384px wide, with the actions in a footer band (`muted` at 50% over a `border` line).
- **Focus.** shadcn's ring, unchanged: the border turns `ring` with a 3px `ring` halo at 50%.

**Kept from DevBrain** (these make it DevBrain, not stock shadcn):

- **Colour.** Every colour token: the near-black neutral ground, `foreground` at neutral-200, the status, priority, health and date colours, the six swatches and their tiles, and the red `now-indicator`.
- **Type family.** Inter for everything; 30px and 24px titles.
- **The logomark.**
- **Glyphs.** `StatusIcon`, `PriorityIcon`, `HealthIcon` and `ProgressRing`, each status with its own shape and colour.
- **The quiet default button.** `default` is still DevBrain's quiet bordered button, drawn as Nova's dark outline button; the filled style stays `primary`, rarely used.
- **Entity pills.** Every relation is an outlined pill on the page colour, with an entity icon or the calendar's colour bar.
- **The segmented control.** `ToggleGroup` and `Tabs` are outlined segments on the page colour (Nova's are a muted track).
- **The dark tooltip.** Nova inverts tooltips; DevBrain keeps them dark with an outline.
- **Lists.** Task and event rows with a line beneath, a hover tone and `muted` group bands.
- **Planning views.** The board, the time grid, event blocks and the mini calendar with its red "today".
- **Sidebar.** The workspace tile, the outlined active item, and full-size Recents and Favorites.

## How this system is built

- **shadcn/ui on Base UI.** shadcn now ships an official Base UI version of its components (`apps/v4/registry/bases/base/ui`). DevBrain uses those components, with Base UI's `render` prop in place of `asChild` and Base UI's data attributes (`data-checked`, `data-pressed`, `data-active`, `data-highlighted`, `data-open`) for state.
- **A style is a stylesheet.** shadcn's components carry fixed class hooks (`cn-button`, `cn-button-size-default`, `cn-dropdown-menu-item`, …) and each style fills them in from one CSS file. DevBrain Nova is that file, written in plain CSS against DevBrain's tokens: no Tailwind.
- **One deliberate rename.** shadcn's `default` button is filled; DevBrain's `default` is the quiet button and the filled one is `primary`.

## Content

- Write in the user's terms: tasks, projects, notes, events, workspaces.
- Buttons and menu items are verbs. Buttons use title case ("New Task", "Show in Finder"); menu items, headings and labels use sentence case ("Turn into", "Due date").
- Address the user as "you": "Good morning, Mitchell." / "You have **12 tasks** and **4 meetings** today."
- Dates are short: "Jul 1", "Today 10:30 AM", "In 5 minutes", "2h ago".
- A destructive confirmation says what happens to linked items and how to undo it.
- Empty values are invitations: "Add description…", "+ Add start date". No emoji.

## Colour

- Dark is the primary theme. Pages, the sidebar, lists and cards sit on `background`; menus, popovers, tooltips, dialogs, sheets and toasts on `popover`.
- Text: `foreground` for body, `foreground-strong` for titles and row names, `muted-foreground` for labels, descriptions and menu icons, `subtle-foreground` for metadata a reader can skip.
- Lines: `border` between rows and around pills; `input` around fields and the quiet button; `edge` around anything raised.
- Status colours keep one meaning each (`status-*`, `priority-*`, `health-*`, `date-today`, `date-overdue`), each with its own icon shape. Users pick from the six `swatch-*` colours, shown as 3px bars, dots and swatches.

## Type

- Inter for everything, Geist Mono for code.
- `button`, `label` and `menu-item` 14px; `row` 14px regular; `meta`, `badge` and `menu-label` 12px; `dialog-title` and `card-title` 16px medium; `section-heading` 14px medium; `document-title` 24px; `page-title` 30px.
- Weights: 400 running text and rows, 500 controls, labels and small titles, 600 page and document titles.

## Space, size and shape

- 4px spacing scale (`space-*`).
- Heights: `control-xs` (24px) pills and xs buttons, `control-sm` (28px) sm buttons and menu items, `control-md` (32px) buttons, inputs, segmented controls and sidebar items, `control-lg` (36px) lg buttons, `row-height` (40px), `group-height` (36px).
- Corners: `radius-md` (8px) inside controls, `radius-lg` (10px) controls and menus, `radius-xl` (14px) surfaces, `radius-full` pills.
- Shadows only on floating layers: `shadow-md` for menus and tooltips, `shadow-2xl` for dialogs, sheets and toasts.
- Layout: a `sidebar-width` (256px) sidebar; lists run edge to edge; details open in a `sheet-width` (380px) panel.

## Components

- Reach for the shadcn component first; DevBrain components are compositions of them (a task row is a Checkbox, icons and pills on a 40px row).
- Every relation and property is a pill. Plain text is never clickable.
- `ToggleGroup` for an immediate choice from a short set; `Tabs` for sections.
- Confirm irreversible actions in an AlertDialog; offer Undo in a Toast for reversible ones.

## Iconography

- Lucide at stroke 1.75: 16px in navigation, rows, buttons and menu items; 12px inside pills and xs buttons; `currentColor`. Inactive and menu icons take `muted-foreground`; status icons their status token.
- Brand marks are image assets, never redrawn. The Logos group holds the DevBrain logomark in white for dark grounds and `neutral-950` for light grounds.

## Motion

- 100ms for hover and press; menus, popovers and tooltips fade and zoom from 95% in 150ms (Nova's `zoom-in-95`); dialogs, sheets and toasts in 250ms. Nothing moves under `prefers-reduced-motion`.
