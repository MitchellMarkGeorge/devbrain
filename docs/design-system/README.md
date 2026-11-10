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
- `components/`: the guide for each component in `src/renderer/components/` (`ui/`, `entities/`
  and the feature groups), describing what it does. The layout utilities (`Text`, `Heading`, `Flex`, `Grid`, `Box`, `VisuallyHidden`) have
  none: they only apply the type, space and colour rules below.
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

- **Colour.** Every colour token: the near-black neutral ground, `foreground` at neutral-200, the status, priority, health and date colours, the six swatches, and the red `now-indicator`. (Red is one shade in dark and workspace tiles use the 900 steps: see Colour.)
- **Type family.** Inter for everything; 30px and 24px titles.
- **The logomark.**
- **Glyphs.** `StatusIcon`, `PriorityIcon`, `HealthIcon` and `ProgressRing`, each status with its own shape and colour.
- **The quiet default button.** `default` is still DevBrain's quiet bordered button, drawn as Nova's dark outline button; the filled style stays `primary`, rarely used.
- **Entity pills.** Every relation is an outlined pill (shadcn's outline badge) with an entity icon or the calendar's colour bar. Its fill (`pill-fill`) is none in dark, so the outline alone marks it, and white in light, a chip on cards and hovered rows (in dark it was the page colour until Nov 2026).
- **The segmented control.** In dark, `ToggleGroup` is outlined segments on the page colour (Nova's are a muted track); light keeps shadcn's muted track with a white thumb. For quick choices: views, calendar range, settings values.
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

- **Strokeless rows.** No line between rows. A row is a `row-height` (48px) block with `radius-md` corners that take `row-selected` on hover and when selected (the same tint; selected also brightens the title). A `muted` band, tinted 8% with the group's colour, heads each group, with `group-gap` (12px) above it. List density is these two tokens: 48px rows with a 12px gap, or 40px rows with an 8px gap.
- **Title first.** The task name leads, then pills: a synced task's `SourcePill` (provider logo and key), a subtask's parent pill, and the subtask count (`ProgressRing` and "3/4"). Entity pills, priority and date stay on the right, as in Nova.
- **The status icon is a button.** Clicking it, or pressing `S` on a focused row, opens the `StatusMenu`; `1`, `2`, `3` pick. Overdue (open, due before today) shows as the flag until the task is started or done; a started task keeps its icon, with its date in `date-overdue`.
- **Leading control.** The selection checkbox lives in a strip left of the status icon. It appears on hover and keyboard focus, and on every row once anything is selected. `X` toggles the focused row.
- **Keys are the app's, not the row's.** ↑/↓, Home/End, ↵, `X`, `S`, `1`–`3`, `F` and ⌘⌫ are the default keymap's list commands (`src/renderer/keyboard`), so a Vim keymap can rebind them. `TaskRow` and `TaskList` bind no keys: the list exposes what the keys do (move focus, select, open the status menu) through its ref, and the page supplies open, status, favorite and trash.
- **Row states.** Rest, hover (`row-selected`, the selected tint), selected (`row-selected` with `row-selected-foreground` titles; neighbouring selected rows join into one block), keyboard focus (the hover tint with a 1px `ring` outline around the whole row, no halo), completed (the title in `muted-foreground`, not struck through), overdue (flag and `date-overdue`), subtask (indented).
- **Selection bar.** While rows are selected, a `SelectionBar` floats over the bottom of the list: the count, then Status, Priority, Due date, Move, more, and clear.
- **Grouped list.** `GroupHeading` is a 36px band in one line, `muted` with 8% of the group's colour mixed in: the group's 14px icon in its colour, the title and the count ("Auth Overhaul 12"; an event adds its time, "Mitchell / Jesse 1:1 Today, 10:00 AM 1"), and a "+" on hover. In a grouped `TaskList` it sticks to the top of the list while its group scrolls.
- **Board.** Open `BoardColumn`s (no panel, 24px apart) hold borderless filled `BoardCard`s (`card`): the title, then the task's relations as the same pills a task row uses (source, subtasks, event or note, project), wrapping as needed, then priority and the date. Hover lightens the card, with no outline; completed cards go darker; each open column ends with a dashed "Add task" slot.
- **Toolbar values.** Toolbar buttons show their current choice after the label ("Filter Assigned to me", "Sort Due date"), still Nova's quiet button. The main action stays the quiet `default` "New Task", not `primary`. In compact windows the values hide (the label stays, an active filter shows as the pressed state, the value moves to the tooltip).
- **Long lists are virtualized and scroll on their own.** `TaskList` (flat and grouped), each `BoardColumn`, `VirtualCardGrid` and `VirtualList` fill the height the page gives them and scroll there, under the page header, which never scrolls away; each board column scrolls by itself. `PageContent`'s `list` and `grid` layouts give them that height under the toolbar, so a list page never scrolls. They draw only what is in view, with `@tanstack/react-virtual`; rows are `row-height` tall, and focus and selection are kept by id so they survive scrolling. The grouped view is one list whose current heading sticks to its top. Each calls `onEndReached` near its last loaded rows to load the next page.
- **Pills stack when a row runs out of room.** On each side of the title the pills overlap like a deck: the last shows in full, the ones behind show their edge and icon, and the row keeps its 48px. Pointing at a stack (or focusing it) spreads it out over the end of the title until the pointer leaves. Priority, the date and the status icon never give way; the title shortens only after the pills have stacked.

## Home

Home answers "what matters right now". It is one centred column, `home-max-width` (800px) wide, with no date line and no right-hand column:

- **The logomark,** then the greeting in the page title ("Good morning, Mitchell"; "Welcome, Mitchell" in a new workspace).
- **The summary,** one sentence in 14px `muted-foreground`: counts and names in `foreground-strong` medium ("**6 tasks**", "**Sprint Planning**"), overdue in `date-overdue` ("2 are overdue"), and good news in `health-on-track` ("Nothing's due today", "Your day is clear"). It can mention what didn't make the sections.
- **The `CaptureBox`,** 28px below, with its one-line tip under it. It holds the slot an AI prompt will take later, at the same footprint.
- **One section** (`HomeSection`), 28px below the tip: the one for what is coming up soonest, or what you just did (see Sections).
- **The footer,** 32px below, centred in 12px `subtle-foreground`: "Press ⌘K to search", and "· Google Calendar paused · Reconnect" (an xs ghost button) when a calendar needs signing in again.

Everything fits on one page without scrolling at the default window size (1200 × 800), and the column sits centred across and down the page.

**Sections.** Home shows one section, with at most three rows; the rest goes into an "N more tasks today" line. Each section has a menu-label header and, optionally, a link at the right ("All 6 tasks →", "Calendar →", "All notes →", "All projects →"). Which section shows follows what is coming up and what you have been doing. Each section has its trigger:

- **Meetings:** a meeting coming up, or in progress.
- **Tasks:** a task overdue or coming up.
- **Recent projects:** a project deadline coming up.
- **Recent notes:** a note you just created or edited.

When more than one applies, what comes due soonest wins: the next meeting, task due date or project deadline decides the section (an overdue task or a meeting in progress is due now). A recently edited note shows only when nothing is coming up. What the section leaves out can still be mentioned in the summary. "Get started" fills the slot in a new workspace with nothing to show.

- **Meetings:** `HomeMeetingRow`s, drawn from core's events: the colour bar, the title and when, at the right ("In 12m" in `date-today`, "Now", "10:30 AM", "Tue 9:30 AM"). An xs Join button shows from 5 minutes before the start until the end. The next or current meeting's row is filled with `card`; finished meetings drop off; tomorrow's first meeting is dimmed.
- **Tasks:** `TaskRow compact`: 44px with no selection strip, with all their pills.
- **Recent notes:** three small `NoteCard`s in a row (`size="sm"`: icon and edit time, a one-line title and a one-line preview).
- **Recent projects:** `HomeRow`s: the folder in the project's colour, the name, a small progress bar, "3/12", then the due date or status.
- **Get started:** `SetupRow`s (Connect Google Calendar, Connect Linear, Start a project), each saying what it adds to Home. A row disappears once its step is done; the section has no link.

Home's rows are lighter than the lists': no selection strip, 36px for meetings and projects (`HomeRow`) and 44px for tasks.

## Window sizes

The window is never smaller than `window-min-width` × `window-min-height` (960 × 640). Three ranges:

- **Wide (`breakpoint-wide`, 1280px and up):** everything as designed. Sheets dock beside the page; the calendar shows its right panel.
- **Medium (1080–1279px):** the calendar's right panel hides. The sidebar rests docked and sheets still dock.
- **Compact (960–1079px):**
  - The sidebar rests hidden, and opens as a drawer over the page (see below).
  - Sheets float over the page instead of docking.
  - Toolbar values hide, and card grids (the Notes and Projects card views) drop to two columns.
- **The sidebar has two states:** docked (`sidebar-width`, 256px, the page beside it) or hidden. The user hides and shows it with ⌘\ or the sidebar toggle at any width; a sidebar the user hid stays hidden at any width, and in compact windows it rests hidden. While it's hidden:
  - The `WindowBar` takes the sidebar's place at the top left (the title bar's start, the sidebar toggle, back and forward), and the page's header sits beside it.
  - The sidebar opens as a drawer over the page, with the `backdrop` scrim behind it. Pointing at the toggle, or at an 8px strip along the window's left edge, peeks at it after 200ms, so a passing pointer doesn't; it closes 300ms after the pointer leaves it. A peek leaves focus where it was.
  - Clicking the toggle or ⌘\ pins the drawer open in compact windows, and docks the sidebar where the window is wide enough. Clicking inside a peeking drawer, or moving focus into it, pins it too. Esc, a click outside or picking a page closes it. Keyboard users open it with the toggle or ⌘\.
- **At every size:** the week view keeps all seven days unless Hide weekends is on (Settings › Calendar, `calendar.hideWeekends`), since hiding days could hide events; the day columns narrow instead. With Hide weekends on and events on the visible week's weekend, the header says so ("2 events on the weekend") with a link that shows the weekend. Long text ends in "…" at its own width: pill labels before titles, titles before dates, and breadcrumbs keep the first and last items. Sheets and dialogs scroll inside themselves at the minimum height, and the selection bar and toasts sit on the window's bottom edge. Document pages cap their content and centre it in the page (see Page widths); workspace pages use the full width.

## Window frame

The page draws its own title bar, a 48px strip (the `WindowBar` while the sidebar is hidden; the
sidebar's window row and the `PageHeader` beside the docked sidebar), and leaves room for the
window controls the system draws. Main sets the frame up per platform
(`src/main/runtime/window-chrome.ts`); the page reads the platform from `WindowFrameProvider`
(`src/renderer/components/lib/platform.ts`), and the Storybook toolbar picks one.

- **macOS** (the designs): no title bar; the system draws the traffic lights in the 68px slot the
  strip keeps at its top left (52px of lights, then 16px clear).
- **Windows:** no title bar; Windows draws minimise, maximise and close (138px, 48px tall, in the
  theme's `background` and `foreground`) over the top right, so maximise keeps its snap layouts. A
  menu button takes the traffic lights' place and pops up the app menu, as there is no menu bar.
  The header's actions stop 16px short of the buttons. Beside the docked sidebar the header gets a
  row of its own across the window, and a docked sheet starts under it, so a sheet's own close
  never sits beside the window's; floating sheets start under the strip too.
- **Linux:** the system frame, with its title bar and the menu bar, sits above the page. The strip
  has no start (no traffic lights, no menu button); a sheet runs the full height, as on macOS.

Keys are written as on macOS ("⌘K", "⌘⇧X"). `Kbd`, menu shortcuts and the tooltips that show keys
name them for the platform: "Ctrl+K", "Ctrl+Shift+X" on Windows and Linux (`formatKeys`).

## Browser pages

The pages the OAuth loopback serves to the browser at the end of a sign-in (signed in, sign-in not
completed, unexpected sign-in link, nothing here) are one template,
`src/main/core/integrations/oauth/page.html`, filled in by `pages.ts`. They are drawn as the
`AppShell` header, centred on the page: the `Logomark` (40×48), the title 38px under it
(30px semibold `foreground-strong`) and one 14px `muted-foreground` line 8px under that, in a column
at most 480px wide on `background`. They follow the browser's light or dark preference, not the
app's theme setting.

They load nothing: the listener stops accepting once it has answered, so the styles are inline and
the logomark assets are imported with `?raw` and inlined as data URIs (Vite reads `?raw` in the main
build, in Vitest and in scripts run with `scripts/run-with-vite.mts`). Their colours and font stack
come from `tokens.json` through `npm run tokens` (`BROWSER_PAGE_COLOURS` and `BROWSER_PAGE_FONT` in
`src/common/theme.ts`); Inter shows where it is installed, and the page falls back along
`--font-sans` otherwise.

## Page widths

Two kinds of page, one rule each:

- **Document pages centre a capped column**, like Notion: a note and a task at `content-max-width` (720px), Settings and Integrations too. Home centres its own column at `home-max-width` (800px), and down the page as well while it fits (see Home). The header (breadcrumb, star, "…" menu) still spans the page; on a wide window the margins grow and the column keeps its width. Menus anchored to the content (the slash menu, pickers under the property pills) move with it.
- **Workspace pages use the full width**: lists, the board, the calendar, and a project's page (its 1056px column of task groups and tabs nearly fills the window already).

## How this system is built

- **shadcn/ui on Base UI.** shadcn now ships an official Base UI version of its components (`apps/v4/registry/bases/base/ui`). DevBrain uses those components, with Base UI's `render` prop in place of `asChild` and Base UI's data attributes (`data-checked`, `data-pressed`, `data-active`, `data-highlighted`, `data-open`) for state.
- **A style is a stylesheet.** shadcn's components carry fixed class hooks (`cn-button`, `cn-button-size-default`, `cn-dropdown-menu-item`, …) and each style fills them in from one CSS file. DevBrain Nova is that file, written in plain CSS against DevBrain's tokens: no Tailwind.
- **One deliberate rename.** shadcn's `default` button is filled; DevBrain's `default` is the quiet button and the filled one is `primary`.
- **Entity components take core's shapes.** A task row takes a `TaskListItem` as core returns it (`<TaskRow task={item} />`), a note card a `NoteListItem`, a project card a `Project` and its `ProjectStats`, an event row an `Event`. Each component's prop is a `Pick` of the shared type in `src/common/types` (`TaskRowData`, `NoteCardData`, …), and it works out what it draws: overdue from the status, the due date and `now`; the words for dates from `useFormat()`; colours with `resolveColor`, which takes a swatch name or a `#rrggbb` checked with `hexColorSchema` and falls back otherwise. Statuses and priorities are core's enums (`TaskStatus`, `TaskPriority`, `ProjectStatus`, `ProjectHealth`); overdue is not a status but a flag a row derives.
- **Dates come from one `FormatProvider`** (`components/lib/format.tsx`: luxon for dates and times, `Intl.RelativeTimeFormat` for relative times). It supplies a clock, ticking each minute so "In 12m" counts down, and the 12 or 24 hour clock from settings; components read the clock at the precision they need (`useFormat()` for due dates and overdue, which moves at midnight; `useFormat('minute')` for relative times), so a task row does not re-render every minute; the app mounts it once, and Storybook mounts it at a fixed `now` of 22 Jun 2026, 9:48 AM (the Clock menu in the toolbar switches 12 and 24 hour). Relative times use `Intl.RelativeTimeFormat` in its narrow style ("2h ago", "In 12m", "Yesterday") rather than luxon's `toRelative`, whose English is fixed ("2 hr. ago"). Where these libraries' wording differs from a Figma string, the design follows them rather than hand-formatting dates.

## Content

- Write in the user's terms: tasks, projects, notes, events, workspaces.
- Buttons and menu items are verbs. Buttons use title case ("New Task", "Show in Finder"); menu items, headings and labels use sentence case ("Turn into", "Due date").
- Address the user as "you": "Good morning, Mitchell" / "**Sprint Planning** starts in 12 minutes. You have **6 tasks** today, and 2 are overdue."
- Dates are short and worded through `useFormat()`: due dates "Today", "Tomorrow", "In 3 days" within a week, else "Jul 1"; times "10:30 AM" (or "10:30" on a 24 hour clock); edits and countdowns "2h ago", "In 12m".
- A destructive confirmation says what happens to linked items and how to undo it.
- Empty values are invitations: "Add description…", "+ Add start date". No emoji.

## Colour

- Dark is the primary theme. Pages, the sidebar and lists sit on `background`; cards, board cards and settings groups on `card` (`neutral-900` in dark, `neutral-50` in light); menus, popovers, tooltips, dialogs, sheets and toasts on `popover`, lifted by their shadow.
- Text: `foreground` for body, `foreground-strong` for titles and row names, `muted-foreground` for labels, descriptions and menu icons, `subtle-foreground` for metadata a reader can skip.
- Lines: `border` between rows, settings rows and around pills; `input` around fields and the quiet button; `edge` around anything raised. All three are translucent in dark, so they never vanish into the surface beneath them.
- Hover and highlight: `accent` is `neutral-800` in dark, so a highlighted item shows on `popover` (`neutral-900`) as well as on the page.
- **One red.** In dark, overdue, high priority, off track and delete all use `red-400` (6.2:1 on `popover`); light uses `red-600` throughout. The calendar's today and the time grid's now line keep `now-indicator` (`red-600`), which carries a white number.
- **Workspace tiles** sit on the 900 step of their swatch (`swatch-*-tile`), so a 20px tile reads as colour; the white letter stays above 9:1.
- **Group headings** show the group's colour on their 14px icon and as an 8% tint of the `muted` band (`color-mix`, so any colour works without a token).
- Status colours keep one meaning each (`status-*`, `priority-*`, `health-*`, `date-today`, `date-overdue`), each with its own icon shape. Users pick from the six `swatch-*` colours, shown as 3px bars, dots and swatches.
- **Derived colours say what they derive from.** In `tokens.json` a translucent token is written as a recipe, `{foreground} / 10%` (another token at an opacity, as Tailwind's `foreground/10`), not as the numbers it comes to; the generator writes it as `color-mix(in srgb, var(--foreground) 10%, transparent)`. So `border` reads `{foreground} / 10%` beside shadcn's white at 10%, a tint follows its colour, and how a token differs from shadcn shows in the token itself. Components derive states the same way at the point of use (`color-mix(in oklab, var(--ring) 50%, transparent)` for shadcn's `ring/50`).

## Type

- Inter for everything, Geist Mono for code, bundled with the app from Fontsource (`src/renderer/styles/fonts.css`, imported by the renderer and Storybook): 400, 500 and 600 with their italics, so nothing is fetched from the network.
- `button`, `label` and `menu-item` 14px; `row` 14px regular; `meta`, `badge` and `menu-label` 12px; `dialog-title` and `card-title` 16px medium; `section-heading` 14px medium; `document-title` 24px; `page-title` 30px.
- Weights: 400 running text and rows, 500 controls, labels and small titles, 600 page and document titles.

## Space, size and shape

- 4px spacing scale (`space-*`).
- Heights: `control-xs` (24px) pills and xs buttons, `control-sm` (28px) sm buttons and menu items, `control-md` (32px) buttons, inputs, segmented controls and sidebar items, `control-lg` (36px) lg buttons, `row-height` (48px) and `group-gap` (12px) for list density, `group-height` (36px) for group heading bands, `board-card-gap` (10px) between board cards.
- Corners: `radius-md` (8px) inside controls, `radius-lg` (10px) controls and menus, `radius-xl` (14px) surfaces, `radius-full` pills.
- Shadows only on floating layers: `shadow-md` for menus and tooltips, `shadow-2xl` for dialogs, sheets and toasts. The exceptions are `shadow-segment`, under the current segment of a segmented control (Figma's in dark, shadcn's `shadow-sm` in light), and `shadow-pinned`, under the sidebar's pinned header while content is scrolled beneath it.
- Layout: Home's `home-max-width` (800px) column; a `sidebar-width` (256px) sidebar, docked or hidden (and then a drawer over the page); lists run edge to edge; details open in a `sheet-width` (380px) panel docked on the right, and the page narrows beside it (an overlay only in narrow windows).

## Scrollbars

**A scrollbar never takes width.** Every area that scrolls (the page, a `TaskList`, a board column, a `VirtualCardGrid`, the sidebar, a sheet's body, every menu: `DropdownMenu`, `ContextMenu`, `Select`, `Command` and the editor's suggestion menus) scrolls inside a `ScrollArea`, whose thin scrollbar is drawn over its right edge and shows only while it scrolls or is pointed at. The native scrollbar is hidden, so a list's rows reach the same edge on every platform: macOS overlays its own, but Windows and Linux (and macOS set to always show them) would otherwise take about 15px from the content.

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
- Large surfaces take 250ms on `ease-surface` (ease-out-cubic, halfway at a fifth of the time), so their motion reads, opening and closing alike: dialogs (and the ⌘K search) fade in as they rise 8px and grow from 96% over a fading scrim; sheets slide in from the right (docked, the page narrowing with them; or floating over a fading scrim); the sidebar slides out to the left as it hides and back in as it docks, the page widening and narrowing beside it, and its drawer slides in from the window's left edge over a fading scrim (docking from the drawer swaps them where they stand, with no motion); toasts rise in from below the window's edge as they fade in, the stack shifting back and spreading on the same curve, and leave by fading where they are (the front one sinking back below the edge).
- The app shell fades in as it appears (after the splash, at startup and on a switch of workspace) in 250ms on `ease-surface`, growing from 99%. The splash just goes: nothing is drawn under it, so there's nothing to crossfade.
- Nothing moves under `prefers-reduced-motion`.
