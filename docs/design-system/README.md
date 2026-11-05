# DevBrain design system

The design system for the DevBrain app. It was developed as "DevBrain Nova Lists" and replaces the
[first DevBrain design system](archive/devbrain-v1/README.md) and
[DevBrain Nova](archive/nova/README.md), which are kept in `archive/` for reference.

## Source of truth

**The code is the single source of truth**: this README and the guides in `components/`, the
tokens in `tokens.json`, and the components in `src/renderer/components/` with their Storybook
stories (`npm run storybook`), which are the browsable version. A change to the design lands in
the component, its stories and its guide together. The Figma file and the
[Claude design-system page](https://claude.ai/artifact/9ZGwb8KzWqLyDsnPnoTLav) follow the code;
both are behind it today (the Claude page predates the Figma audit of Nov 2026). See `CLAUDE.md`.

## Files

- `tokens.json`: every token, and the only file here the app uses. `npm run tokens` generates
  `src/renderer/styles/tokens.css` from it.
- `components/`: the guide for each component, describing what the component in
  `src/renderer/components/` does.
- `reference/`: superseded and out of date. The stylesheet and React stand-ins behind the Claude
  design-system page, kept until that page is synced from the code; nothing imports them, and
  nothing should be built from them.
- `archive/`: superseded systems. The implementation notes in the
  [v1 spec](archive/devbrain-v1/README.md) (Base UI parts, styling without Tailwind) still apply,
  except that variants are now `cva` classes rather than `data-variant`/`data-size` styles.

DevBrain's design system: shadcn's Nova style with DevBrain's colours, glyphs and signature components, plus the quiet list behaviours. (It was developed as "DevBrain Nova Lists" and replaces the first DevBrain system and DevBrain Nova.) Everything you see outside a list is Nova (its sizes, type, corners, outlines, quiet buttons, entity pills, sidebar and toolbar); lists drop their strokes and gain a clickable status, a real selected state, whole-row focus, a grouped layout and a calmer board card.

## What comes from Nova and what stays DevBrain

**From Nova** (shadcn v4 registry, `style-nova.css`):

- **Sizes.** 32px is the default for buttons, inputs, selects, segmented controls and sidebar items; 28px `sm` and menu items; 24px `xs`, `icon-xs` and pills; 36px `lg`. Rows are 48px (`row-height`).
- **Type.** Controls, menus, inputs, labels, rows and descriptions use 14px (`text-sm`): medium for buttons, labels and tabs, regular for rows and menu items. Badges, metadata, shortcuts and menu labels use 12px. Dialog and card titles are 16px medium.
- **Corners.** shadcn's 10px radius scale: `radius-md` (8px) for items inside a control, `radius-lg` (10px) for controls, menus and popovers, `radius-xl` (14px) for cards, dialogs, sheets and toasts.
- **Edges.** Raised surfaces (cards, menus, popovers, dialogs, sheets, toasts) take the translucent `edge` outline, Nova's `ring-foreground/10`, instead of a solid line, so they read on any ground.
- **Lines are translucent.** In dark, `border` is `foreground` at 10% and `input` at 15%, as shadcn's white at 10% and 15%: a divider, a field or a pill outline shows on the page, on a card and on a hovered row alike.
- **Cards are filled.** `card` is `neutral-900` in dark (shadcn's card) and `neutral-50` on the white page in light, outlined with `edge`.
- **Fields.** Inputs, selects, checkboxes and the quiet default button sit on `input-fill` (`foreground` at 5% in dark, none in light) with an `input` outline, so they are findable at rest.
- **Destructive.** `destructive` is a red tint (20%) with red text, never a solid red.
- **Dialogs.** 16px padding and gap, 384px wide, with the actions in a footer band (`muted` at 50% over a `border-strong` line). They hang about 160px from the top of the window (create dialogs 140px, the ⌘K search 120px), centred on the whole window, ignoring the sidebar (Figma centres them over the page beside it; the window was chosen instead).
- **Focus.** shadcn's ring, unchanged: the border turns `ring` with a 3px `ring` halo at 50%.

**Kept from DevBrain** (these make it DevBrain, not stock shadcn):

- **Colour.** Every colour token: the near-black neutral ground, `foreground` at neutral-200, the status, priority, health and date colours, the six swatches, and the red `now-indicator`. (Red is one shade in dark, workspace tiles use the 900 steps and group tiles a 15% tint: see Colour.)
- **Type family.** Inter for everything; 30px and 24px titles.
- **The logomark.**
- **Glyphs.** `StatusIcon`, `PriorityIcon`, `HealthIcon` and `ProgressRing`, each status with its own shape and colour.
- **The quiet default button.** `default` is still DevBrain's quiet bordered button, drawn as Nova's dark outline button; the filled style stays `primary`, rarely used.
- **Entity pills.** Every relation is an outlined pill (shadcn's outline badge) with an entity icon or the calendar's colour bar. Its fill (`pill-fill`) is none in dark, so the outline alone marks it, and white in light, a chip on cards and hovered rows (in dark it was the page colour until Nov 2026).
- **The segmented control.** `ToggleGroup` is outlined segments on the page colour (Nova's are a muted track), for quick choices: views, calendar range, settings values.
- **Section switchers.** Page sections (Settings, a project's Overview / Tasks / Notes) use `Tabs` drawn as shadcn's outline ToggleGroup, and so does the search dialog's type filter: separate outlined buttons 8px apart, the current one filled in `accent`.
- **The dark tooltip.** Nova inverts tooltips; DevBrain keeps them dark with an outline.
- **Lists.** Entity pills, priority and date on the right of every row (the rows themselves follow the list behaviours below).
- **Planning views.** The board, the time grid, event blocks and the mini calendar with its red "today".
- **Sidebar.** The workspace tile, the outlined active item, and full-size Recents and Favorites.

## Detail pages

- **One column.** A task or project page is the title, then `PropertyRow` (properties on the first line, links on the second), the description and the content (subtasks and the task note; or the project's task groups). No side cards: a project's notes live in its Notes tab.
- **Centred column.** Task and note pages centre their document at `content-max-width` (720px), so moving between a task and its note never shifts the text. See Page widths.
- **Header actions stay put.** The star and the "…" menu sit at the right of the top bar on every detail page; nothing under them is covered, because the page has no side column.
- **One "…" menu for every detail page**, in the same order: the page's own actions, then Copy as Markdown, then Move to trash last. Favorite stays the star button, and there is no "Copy link": everything is local.
  - Task: Convert to project, Link to ›, Make subtask of ›, Duplicate (⌘D). A Linear task adds Open in Linear, Copy Linear URL and Detach from Linear before Move to trash; a detached one offers Reattach to Linear instead.
  - Project: New task, New note, Change colour ›.
  - Note: Link to ›, Change project ›, Duplicate (⌘D), Show in Finder.
- **Note rows open a right-click menu** (no "…" button on the row): Open note (↵), Favorite (F), Change link ›, Change project ›, Copy as Markdown, then Move to trash.

## Lists

- **Strokeless rows.** No line between rows and no group band. A row is a `row-height` (48px) block with `radius-md` corners that take `row-selected` on hover and when selected (the same tint; selected also brightens the title). Space separates groups (`group-gap`, 32px above each heading). List density is these two tokens: 48px rows with a 32px gap, or 40px rows with a 24px gap.
- **Title first.** The task name leads, then pills: a synced task's `SourcePill` (provider logo and key), a subtask's parent pill, and the subtask count (`ProgressRing` and "3/4"). Entity pills, priority and date stay on the right, as in Nova.
- **The status icon is a button.** Clicking it, or pressing `S` on a focused row, opens the `StatusMenu`; `1`, `2`, `3` pick. Overdue shows as the flag until the task is started or done.
- **Leading control.** The selection checkbox lives in a strip left of the status icon. It appears on hover and keyboard focus, and on every row once anything is selected. `X` toggles the focused row.
- **Row states.** Rest, hover (`row-selected`, the selected tint), selected (`row-selected` with `row-selected-foreground` titles; neighbouring selected rows join into one block), keyboard focus (the hover tint with a 1px `ring` outline around the whole row, no halo), completed (the title in `muted-foreground`, not struck through), overdue (flag and `date-overdue`), subtask (indented).
- **Selection bar.** While rows are selected, a `SelectionBar` floats over the bottom of the list: the count, then Status, Priority, Due date, Move, more, and clear.
- **Grouped list.** `GroupHeading` is a tile, a title over a subtitle ("Overdue · Oldest due Sep 28", "Mitchell / Jesse 1:1 · Event · Today, 10:00 AM"), an xs "Add task", done/total and a progress bar.
- **Board.** Open `BoardColumn`s (no panel, 24px apart) hold borderless filled `BoardCard`s (`card`): the title, then the task's relations as the same pills a task row uses (source, subtasks, event or note, project), wrapping as needed, then priority and the date. Hover lightens the card, with no outline; completed cards go darker; each open column ends with a dashed "Add task" slot.
- **Toolbar values.** Toolbar buttons show their current choice after the label ("Filter Assigned to me", "Sort Due date"), still Nova's quiet button. The main action stays the quiet `default` "New Task", not `primary`. In compact windows the values hide (the label stays, an active filter shows as the pressed state, the value moves to the tooltip).
- **Pills stack when a row runs out of room.** On each side of the title the pills overlap like a deck: the last shows in full, the ones behind show their edge and icon, and the row keeps its 48px. Pointing at a stack (or focusing it) spreads it out over the end of the title until the pointer leaves. Priority, the date and the status icon never give way; the title shortens only after the pills have stacked.

## Window sizes

The window is never smaller than `window-min-width` × `window-min-height` (960 × 640). Three ranges:

- **Wide (`breakpoint-wide`, 1280px and up):** everything as designed. Sheets dock beside the page; Home and the calendar show their right columns.
- **Medium (1080–1279px):** Home's right column and the calendar's right panel hide. The sidebar rests open and sheets still dock.
- **Compact (960–1079px):**
  - The sidebar rests as the 56px icon rail (`sidebar-rail-width`); expanding it opens the full sidebar as a drawer over the page, with the `backdrop` scrim behind it, and picking a page, clicking outside or Esc closes it. A sidebar the user collapsed stays collapsed at any width.
  - Sheets float over the page instead of docking.
  - Toolbar values hide, and card grids (Notes cards, Home's projects and notes) drop to two columns, with "All projects" / "All notes" for the rest.
- **At every size:** the week view keeps all seven days (hiding days could hide events); the day columns narrow instead. Long text ends in "…" at its own width: pill labels before titles, titles before dates, and breadcrumbs keep the first and last items. Sheets and dialogs scroll inside themselves at the minimum height, and the selection bar and toasts sit on the window's bottom edge. Document pages cap their content and centre it in the page (see Page widths); workspace pages use the full width.

## Page widths

Two kinds of page, one rule each:

- **Document pages centre a capped column**, like Notion: a note and a task at `content-max-width` (720px), Settings and Integrations too. The header (breadcrumb, star, "…" menu) still spans the page; on a wide window the margins grow and the column keeps its width. Menus anchored to the content (the slash menu, pickers under the property pills) move with it.
- **Workspace pages use the full width**: lists, the board, the calendar, Home, and a project's page (its 1056px column of task groups and tabs nearly fills the window already).

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

- Dark is the primary theme. Pages, the sidebar and lists sit on `background`; cards, board cards and settings groups on `card` (`neutral-900` in dark, `neutral-50` in light); menus, popovers, tooltips, dialogs, sheets and toasts on `popover`, lifted by their shadow.
- Text: `foreground` for body, `foreground-strong` for titles and row names, `muted-foreground` for labels, descriptions and menu icons, `subtle-foreground` for metadata a reader can skip.
- Lines: `border` between rows, settings rows and around pills; `input` around fields and the quiet button; `edge` around anything raised. All three are translucent in dark, so they never vanish into the surface beneath them.
- Hover and highlight: `accent` is `neutral-800` in dark, so a highlighted item shows on `popover` (`neutral-900`) as well as on the page.
- **One red.** In dark, overdue, high priority, off track and delete all use `red-400` (6.2:1 on `popover`); light uses `red-600` throughout. The calendar's today and the time grid's now line keep `now-indicator` (`red-600`), which carries a white number.
- **Workspace tiles** sit on the 900 step of their swatch (`swatch-*-tile`), so a 20px tile reads as colour; the white letter stays above 9:1.
- **Group heading tiles** take a 15% tint of the group's colour (`swatch-*-tint`, `status-*-tint`) behind the icon at full strength.
- Status colours keep one meaning each (`status-*`, `priority-*`, `health-*`, `date-today`, `date-overdue`), each with its own icon shape. Users pick from the six `swatch-*` colours, shown as 3px bars, dots and swatches.
- **Derived colours say what they derive from.** In `tokens.json` a translucent token is written as a recipe, `{foreground} / 10%` (another token at an opacity, as Tailwind's `foreground/10`), not as the numbers it comes to; the generator writes it as `color-mix(in srgb, var(--foreground) 10%, transparent)`. So `border` reads `{foreground} / 10%` beside shadcn's white at 10%, a tint follows its colour, and how a token differs from shadcn shows in the token itself. Components derive states the same way at the point of use (`color-mix(in oklab, var(--ring) 50%, transparent)` for shadcn's `ring/50`).

## Type

- Inter for everything, Geist Mono for code, bundled with the app from Fontsource (`src/renderer/styles/fonts.css`, imported by the renderer and Storybook): 400, 500 and 600 with their italics, so nothing is fetched from the network.
- `button`, `label` and `menu-item` 14px; `row` 14px regular; `meta`, `badge` and `menu-label` 12px; `dialog-title` and `card-title` 16px medium; `section-heading` 14px medium; `document-title` 24px; `page-title` 30px.
- Weights: 400 running text and rows, 500 controls, labels and small titles, 600 page and document titles.

## Space, size and shape

- 4px spacing scale (`space-*`).
- Heights: `control-xs` (24px) pills and xs buttons, `control-sm` (28px) sm buttons and menu items, `control-md` (32px) buttons, inputs, segmented controls and sidebar items, `control-lg` (36px) lg buttons, `row-height` (48px) and `group-gap` (32px) for list density, `group-height` (36px).
- Corners: `radius-md` (8px) inside controls, `radius-lg` (10px) controls and menus, `radius-xl` (14px) surfaces, `radius-full` pills.
- Shadows only on floating layers: `shadow-md` for menus and tooltips, `shadow-2xl` for dialogs, sheets and toasts. The exceptions are `shadow-segment`, under the current segment of a segmented control, and `shadow-pinned`, under the sidebar's pinned header while content is scrolled beneath it.
- Layout: a `sidebar-width` (256px) sidebar, or the `sidebar-rail-width` (56px) rail in compact windows; lists run edge to edge; details open in a `sheet-width` (380px) panel docked on the right, and the page narrows beside it (an overlay only in narrow windows).

## Components

- Reach for the shadcn component first; DevBrain components are compositions of them (a task row is a Checkbox, icons and pills on a `row-height` row).
- Every relation and property is a pill. Plain text is never clickable.
- `ToggleGroup` for an immediate choice from a short set; `Tabs` for sections.
- Confirm irreversible actions in an AlertDialog; offer Undo in a Toast for reversible ones.

## Iconography

- Lucide at stroke 1.75: 16px in navigation, rows, buttons and menu items; 12px inside pills and xs buttons; `currentColor`. Inactive and menu icons take `muted-foreground`; status icons their status token.
- Brand marks are image assets, never redrawn. The Logos group holds the DevBrain logomark in white for dark grounds and `neutral-950` for light grounds.

## Motion

- 100ms for hover and press; menus, popovers and tooltips fade and zoom from 95% in 150ms (Nova's `zoom-in-95`). These use `ease-out`, which is nearly done in the first fifth of the time: right for small popups.
- Large surfaces take 250ms on `ease-surface` (ease-out-cubic, halfway at a fifth of the time), so their motion reads, opening and closing alike: dialogs (and the ⌘K search) fade in as they rise 8px and grow from 96% over a fading scrim; sheets slide in from the right (docked, the page narrowing with them; or floating over a fading scrim); the sidebar collapses to the rail and back (its width slides, its content fades in), and in compact windows its drawer widens out of the rail over the page; toasts rise in from below the window's edge as they fade in, the stack shifting back and spreading on the same curve, and leave by fading where they are (the front one sinking back below the edge).
- Nothing moves under `prefers-reduced-motion`.
