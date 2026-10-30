# DevBrain design system

The design system for the DevBrain app. It was developed as "DevBrain Nova Lists" and replaces the
[first DevBrain design system](archive/devbrain-v1/README.md) and
[DevBrain Nova](archive/nova/README.md), which are kept in `archive/` for reference.

The live, browsable version (every component with a preview, tokens and this brand book):
https://claude.ai/artifact/9ZGwb8KzWqLyDsnPnoTLav

## Files

- `tokens.json`: the token source. `npm run tokens` generates `src/renderer/styles/tokens.css` from it.
- `nova-layer.css` and `lists-layer.css`: the two style layers on top of the DevBrain component
  styles, in that order. Nova sets shadcn Nova's sizes, type, corners and edges; Lists adds the list
  behaviours.
- `reference/`: the complete built preview from the design system page: `bundle.css` (component
  styles with both layers), `bundle.js` (every component as a small React reference
  implementation) and `index.d.ts` (their props). Build the app's components to match these.
- `components/`: the usage guide for each component.
- The implementation notes in the [v1 spec](archive/devbrain-v1/README.md) (Base UI parts, the
  `data-variant`/`data-size` Button pattern, styling without Tailwind) still apply.

DevBrain's design system: shadcn's Nova style with DevBrain's colours, glyphs and signature components, plus the quiet list behaviours. Everything you see outside a list is Nova (its sizes, type, corners, outlines, quiet buttons, entity pills, sidebar and toolbar); lists drop their strokes and gain a clickable status, a real selected state, whole-row focus, a grouped layout and a calmer board card.

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

- **Colour.** Every colour token: the near-black neutral ground, `foreground` at neutral-200, the status, priority, health and date colours, the six swatches, and the red `now-indicator`. (Red is one shade in dark and the tiles use the 900 steps: see Colour.)
- **Type family.** Inter for everything; 30px and 24px titles.
- **The logomark.**
- **Glyphs.** `StatusIcon`, `PriorityIcon`, `HealthIcon` and `ProgressRing`, each status with its own shape and colour.
- **The quiet default button.** `default` is still DevBrain's quiet bordered button, drawn as Nova's dark outline button; the filled style stays `primary`, rarely used.
- **Entity pills.** Every relation is an outlined pill on the page colour, with an entity icon or the calendar's colour bar.
- **The segmented control.** `ToggleGroup` and `Tabs` are outlined segments on the page colour (Nova's are a muted track).
- **The dark tooltip.** Nova inverts tooltips; DevBrain keeps them dark with an outline.
- **Lists.** Entity pills, priority and date on the right of every row (the rows themselves follow the list behaviours below).
- **Planning views.** The board, the time grid, event blocks and the mini calendar with its red "today".
- **Sidebar.** The workspace tile, the outlined active item, and full-size Recents and Favorites.

## Lists

- **Strokeless rows.** No line between rows and no group band. A row is a 40px block with `radius-md` corners: `accent` on hover, `row-selected` when selected. Space separates groups (24px above each heading).
- **Title first.** The task name leads; the issue key (12px `subtle-foreground`) and the subtask count follow it. Entity pills, priority and date stay on the right, as in Nova.
- **The status icon is a button.** Clicking it, or pressing `S` on a focused row, opens the `StatusMenu`; `1`, `2`, `3` pick. Overdue shows as the flag until the task is started or done.
- **Leading control.** The selection checkbox lives in a strip left of the status icon. It appears on hover and keyboard focus, and on every row once anything is selected. `X` toggles the focused row.
- **Row states.** Rest, hover (`accent`), selected (`row-selected` with `row-selected-foreground` titles; neighbouring selected rows join into one block), keyboard focus (Nova's ring around the whole row), completed (struck through in `muted-foreground`), overdue (flag and `date-overdue`), subtask (indented).
- **Selection bar.** While rows are selected, a `SelectionBar` floats over the bottom of the list: the count, then Status, Priority, Due date, Move, more, and clear.
- **Grouped list.** `GroupHeading` is a tile, a title over a subtitle ("Overdue · Oldest due Sep 28", "Mitchell / Jesse 1:1 · Event · Today, 10:00 AM"), an xs "Add task", done/total and a progress bar.
- **Board.** Open `BoardColumn`s (no panel, 24px apart) hold borderless filled `BoardCard`s: the linked event or note as a quiet line, the title, then one line of priority, subtasks, project and date. Hover lightens the card and adds an outline; completed cards go darker; each open column ends with a dashed "Add task" slot.
- **Toolbar values.** Toolbar buttons show their current choice after the label ("Filter Assigned to me", "Sort Due date"), still Nova's quiet button. The main action stays the quiet `default` "New Task", not `primary`.

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
- **One red.** In dark, overdue, high priority, off track and delete all use `red-400` (6.2:1 on `popover`); light uses `red-600` throughout. The calendar's today and the time grid's now line keep `now-indicator` (`red-600`), which carries a white number.
- **Workspace tiles** sit on the 900 step of their swatch (`swatch-*-tile`), so a 20px tile reads as colour; the white letter stays above 9:1.
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
