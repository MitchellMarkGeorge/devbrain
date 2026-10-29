# DevBrain design system

The visual language and component set for the renderer. It is built from the [DevBrain v1 Figma file](https://www.figma.com/design/w9WtYAUXkkzqKIMAzFo08I/DevBrain-v1): every page was reviewed (Welcome, Loading/Splash, Home, Home (final), Home (old ideas), Tasks, Notes, Project, Calendar, Archive, Settings, Components, Editor, Flow, Logo, Inbox, Test).

- **Tokens** live in [`src/renderer/styles/tokens.css`](../../src/renderer/styles/tokens.css): plain CSS custom properties, dark theme by default, light theme behind `data-theme="light"`.
- **Components** follow shadcn/ui: same names, same prop APIs (`variant`, `size`, `asChild`), same Radix primitives underneath. Styling is CSS Modules reading the tokens, **not Tailwind**.
- **The look** is DevBrain's own: near-black surfaces, neutral hairline borders, 12px rounded pills and buttons, small (12–14px) Inter text, and colour only where it carries meaning (status, priority, dates, calendars).

## Contents

1. [Principles](#1-principles)
2. [How shadcn is used without Tailwind](#2-how-shadcn-is-used-without-tailwind)
3. [Tokens](#3-tokens)
4. [Component inventory](#4-component-inventory)
5. [Patterns](#5-patterns)
6. [Where each screen uses what](#6-where-each-screen-uses-what)
7. [Gaps and open questions from the Figma file](#7-gaps-and-open-questions-from-the-figma-file)
8. [Build order](#8-build-order)

---

## 1. Principles

1. **Content first, chrome quiet.** Surfaces are `--background` (neutral-950); structure comes from 1px `--border` lines, not fills or shadows. Shadows appear only on floating layers (menus, dialogs, toasts).
2. **Colour means something.** Neutrals carry all UI. Colour is reserved for task status, priority, project health, overdue/today dates, calendar/event colours and the workspace swatch. Never use colour for decoration.
3. **Dense but legible.** The base UI size is 12px (rows, pills, meta) and 14px (navigation, menus, body); page titles jump straight to 24–30px. Rows are 40px.
4. **One shape language.** 12px radius for anything you click as a whole (buttons, pills, cards, popovers, dialogs); 8px for items inside a container (menu items, nav items, inputs); 4px for tiny things (checkbox, small tile).
5. **Dark first, light supported.** Every finished screen is dark. The light theme is shadcn's neutral theme so the shadcn-based Figma library ("DevBrain UI Components", Nova style) and the app agree.
6. **Keyboard reachable.** Everything is a Radix primitive or a native control, so focus, arrow keys and Escape work out of the box. Focus is always visible (`--ring`).

---

## 2. How shadcn is used without Tailwind

shadcn/ui is not a package: it is a set of component files you copy in, each a thin styled wrapper around a Radix primitive. We keep that model and swap only the styling layer.

| shadcn piece                                 | DevBrain                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Radix primitives (`@radix-ui/react-*`)       | Same: install `radix-ui` (the single package)                            |
| Tailwind utility classes in `className`      | A CSS Module per component (`button.module.css`) using the tokens        |
| `cva()` variants                             | `data-variant` / `data-size` attributes, styled with attribute selectors |
| `cn()` (clsx + tailwind-merge)               | `clsx` only (no class conflicts to merge)                                |
| Theme variables in `globals.css`             | `tokens.css` (same variable names, plus a few DevBrain additions)        |
| `components/ui/*`                            | `src/renderer/components/ui/*`                                           |
| Sonner, cmdk, react-day-picker, lucide-react | Same libraries, styled with tokens                                       |

Example shape of a component:

```tsx
// src/renderer/components/ui/button.tsx
import { Slot } from 'radix-ui';
import clsx from 'clsx';
import styles from './button.module.css';

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'destructive' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'icon-xs' | 'icon-sm' | 'icon';
  asChild?: boolean;
};

export function Button({
  variant = 'default',
  size = 'sm',
  asChild,
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-variant={variant}
      data-size={size}
      className={clsx(styles.button, className)}
      {...props}
    />
  );
}
```

```css
/* button.module.css */
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  font: var(--font-weight-semibold) var(--text-xs) / var(--text-xs-leading) var(--font-sans);
  transition: background-color var(--duration-fast) var(--ease-out);
}
.button[data-variant='default'] {
  background: var(--secondary);
  border-color: var(--border-strong);
  color: var(--secondary-foreground);
}
.button[data-variant='default']:hover {
  background: var(--hover);
}
.button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

Rules:

- Components read **semantic** tokens (`--popover`, `--border`) and **domain** tokens (`--status-in-progress`), never primitives (`--neutral-900`). That is what makes the light theme work.
- No hard-coded colours, sizes or radii in component CSS. If a value is missing, add a token.
- Disabled state: `opacity: 0.5; pointer-events: none`, as in shadcn.
- Icons: [Lucide](https://lucide.dev) (`lucide-react`), shadcn's icon set and the one the Figma component library already uses. The finished screens still use Bootstrap Icons; map them to the Lucide equivalent (table in [3.7](#37-iconography)).

---

## 3. Tokens

All values come from the Figma variables (`color/neutral/*`, `font/*`, `shadcn colors/*`, `Default/*`) unless marked _added_.

### 3.1 Colour: semantic

| Token                                    | Dark              | Light       | Used for                                                 |
| ---------------------------------------- | ----------------- | ----------- | -------------------------------------------------------- |
| `--background`                           | neutral-950       | white       | App, sidebar, lists, cards                               |
| `--foreground`                           | neutral-200       | neutral-950 | Body text, menu items, pill labels                       |
| `--foreground-strong` _added_            | neutral-100       | neutral-950 | Page and document titles, row names, sidebar entries     |
| `--muted-foreground`                     | neutral-500       | neutral-500 | Inactive nav, secondary labels, placeholders, pill icons |
| `--subtle-foreground` _added_            | neutral-600       | neutral-400 | Dates, descriptions, hints, "Linked to", issue keys      |
| `--card`                                 | neutral-950       | white       | Schedule, note and project cards; settings groups        |
| `--popover`                              | neutral-900       | white       | Dropdown, context menu, select, combobox, slash menu     |
| `--overlay` _added_                      | #111              | white       | Dialog, sheet/aside, toast                               |
| `--primary` / `--primary-foreground`     | neutral-200 / 900 | 900 / 50    | Checked checkbox, switch on, the one emphasised button   |
| `--secondary` / `--secondary-foreground` | neutral-900 / 200 | 100 / 900   | Default button, selected nav item, segmented thumb       |
| `--muted`                                | neutral-900       | neutral-100 | Group heading band, all-day row, code block              |
| `--accent` / `--accent-foreground`       | neutral-900 / 100 | 100 / 900   | Hover on rows and menu items, highlighted menu item      |
| `--hover` _added_                        | #1c1c1c           | neutral-100 | Hover on something already `--secondary`                 |
| `--destructive`                          | red-500           | red-600     | Delete actions (text colour, not a red fill)             |
| `--border`                               | neutral-900       | neutral-200 | Row dividers, pills, cards, sidebar edge, checkbox       |
| `--border-strong` _added_                | neutral-800       | neutral-200 | Buttons, popovers, dialogs, selected nav item, inputs    |
| `--input`                                | neutral-800       | neutral-200 | Input and select borders                                 |
| `--ring`                                 | neutral-600       | neutral-400 | Focus outline                                            |
| `--sidebar*`                             | see tokens.css    |             | Sidebar surface, items, active item                      |

**Contrast note.** `--subtle-foreground` (neutral-600 on neutral-950) is about 2.6:1, below WCAG AA. Figma uses it for dates and descriptions; keep it for secondary metadata only and use `--muted-foreground` for anything a user must read (dialog descriptions, settings help text, empty states).

### 3.2 Colour: domain

| Group                                          | Token                                       | Value                 | Shown as                                               |
| ---------------------------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------ |
| Task status (`TaskStatus`)                     | `--status-not-started`                      | neutral-500           | Empty circle                                           |
|                                                | `--status-in-progress`                      | orange-500 `#ff6900`  | Activity / pulse line                                  |
|                                                | `--status-completed`                        | green-500 `#00c951`   | Filled check circle; name struck through and muted     |
|                                                | `--status-cancelled`                        | neutral-600           | _Not designed yet_: suggest a slashed circle           |
|                                                | `--status-overdue`                          | red-500 `#fb2c36`     | Flag (derived, not stored)                             |
| Priority (`TaskPriority`)                      | `--priority-high`                           | red-500               | Double chevron up                                      |
|                                                | `--priority-medium`                         | amber-500 `#f59e0b`   | Equals sign                                            |
|                                                | `--priority-low`                            | emerald-600 `#009966` | Chevron down                                           |
| Project health (`ProjectHealth`)               | `--health-on-track`                         | lime-500 `#7ccf00`    | Clock / pulse                                          |
|                                                | `--health-at-risk`                          | amber-500             | Warning circle                                         |
|                                                | `--health-off-track`                        | red-500               | X circle                                               |
|                                                | `--health-not-started`                      | neutral-500           | Empty circle                                           |
|                                                | `--health-completed`                        | green-500             | Filled check circle                                    |
| Dates                                          | `--date-today`                              | amber-500             | "Today", "In 3 hours"                                  |
|                                                | `--date-overdue`                            | red-500               | Overdue date, "In 5 minutes"                           |
|                                                | `--now-indicator`                           | red-600 `#e7000b`     | Calendar current-time line, today in the mini calendar |
| Swatches (workspace, calendar, event, project) | `--swatch-red/amber/green/blue/indigo/pink` | Figma `Default/*-500` | Colour bar, tile, dot                                  |

Swatch tiles (the workspace letter tile) use a tint of the swatch: `background: color-mix(in srgb, var(--swatch-green) var(--swatch-tint-amount), var(--background)); color: var(--white)`. Figma's green tile is `#052e16` (green-950); the tint formula reproduces it for every swatch without a hand-picked 950 per colour.

### 3.3 Typography

Font: **Inter** (bundle it with the app; do not rely on a system install). Some Figma layers fall back to SF Pro; treat them as Inter.

| Role                      | Size / line | Weight  | Colour                | Example                                     |
| ------------------------- | ----------- | ------- | --------------------- | ------------------------------------------- |
| Page title                | 30 / 36     | 600     | `--foreground-strong` | "Good morning, Mitchell.", "Settings"       |
| Document title            | 24 / 32     | 600     | `--foreground-strong` | Task, note, project and day titles          |
| Dialog / onboarding title | 20 / 28     | 500     | `--foreground-strong` | "Welcome to DevBrain"                       |
| Section heading           | 14 / 20     | 500     | `--foreground-strong` | "Today's schedule", "Import & Export"       |
| Body / nav / menu item    | 14 / 20     | 400–500 | `--foreground`        | Note body, sidebar nav, menu items          |
| Row text / pill / button  | 12 / 16     | 500     | `--foreground-strong` | Task names, pill labels; buttons use 600    |
| Meta                      | 12 / 16     | 400     | `--subtle-foreground` | Dates, "2h ago", descriptions, issue keys   |
| Menu label                | 12 / 16     | 600     | `--foreground`        | "Turn into", "Basic Blocks"                 |
| Code                      | 13 / 20     | 400     | `--foreground`        | Code blocks and inline code (`--font-mono`) |

Editor content headings: H1 24/32, H2 20/28, H3 18/28, all 600; paragraph 14/20.

### 3.4 Spacing

4px grid (`--space-1` … `--space-16`), with `--space-0-5` (2px) and `--space-1-5` (6px) for hairline nudges. Common values:

- Row: 40px tall, 16px horizontal padding, 12–16px gap between the left cluster (checkbox, status, key, name) and the right cluster (pill, priority, date).
- Pill: 4px × 12px padding, 6px gap between icon and label.
- Sidebar: 12px outer padding, 8px item padding, 24px between groups.
- Page content: 48px top, 64px sides on document pages (task, note, project); list pages run edge to edge.
- Popover: 4px inner padding, 8px × 6px item padding, 8px divider block.
- Dialog: 24px padding, 16px gap.

### 3.5 Radius

| Token           | Value | Used on                                                     |
| --------------- | ----- | ----------------------------------------------------------- |
| `--radius-xs`   | 2px   | Colour bars, progress track                                 |
| `--radius-sm`   | 4px   | Checkbox, small workspace tile, kbd                         |
| `--radius-md`   | 8px   | Menu items, sidebar items, inputs, icon buttons, swatches   |
| `--radius-lg`   | 12px  | Buttons, pills, cards, popovers, dialogs, toasts, segmented |
| `--radius-xl`   | 16px  | Large workspace tile (onboarding)                           |
| `--radius-full` | 999px | Switch, avatar, dots                                        |

### 3.6 Elevation and motion

| Layer                | Surface        | Border            | Shadow         |
| -------------------- | -------------- | ----------------- | -------------- |
| Page, list, card     | `--background` | `--border`        | none           |
| Popover / menu       | `--popover`    | `--border-strong` | `--shadow-md`  |
| Dialog, sheet, toast | `--overlay`    | `--border-strong` | `--shadow-2xl` |

Motion: hover and press `--duration-fast`; menus, popovers, tooltips `--duration-normal` (fade + 4px slide from the trigger side); dialogs, sheets, toasts `--duration-slow`. All collapse to 0 under `prefers-reduced-motion`. The splash logomark pulses (opacity 0.4 → 1, 1.2s, ease-in-out) while the workspace loads.

### 3.7 Iconography

Lucide, 1.5px stroke. 16px for navigation, status and row icons; 12px inside pills, menu items, sidebar sub-items and small buttons. Icons take `currentColor`; inactive icons are `--muted-foreground`.

| Use                        | Figma (Bootstrap)                                                                                    | Lucide                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Home                       | house-door                                                                                           | `House`                                                                                                          |
| Tasks / completed          | check-circle                                                                                         | `CircleCheck`                                                                                                    |
| Projects                   | folder                                                                                               | `Folder`                                                                                                         |
| Notes                      | file-earmark-text                                                                                    | `FileText`                                                                                                       |
| Calendar / event           | calendar                                                                                             | `Calendar`                                                                                                       |
| Integrations               | lightning                                                                                            | `Zap`                                                                                                            |
| Settings / help            | gear, question-circle                                                                                | `Settings`, `CircleHelp`                                                                                         |
| In progress                | activity                                                                                             | `Activity`                                                                                                       |
| Not started                | circle                                                                                               | `Circle`                                                                                                         |
| Overdue                    | flag                                                                                                 | `Flag`                                                                                                           |
| Priority                   | custom                                                                                               | `ChevronsUp`, `Equal`, `ChevronDown`                                                                             |
| Subtask                    | arrow-return-right                                                                                   | `CornerDownRight`                                                                                                |
| Search / new / more        | search, pencil-square, three-dots                                                                    | `Search`, `SquarePen`, `Ellipsis`                                                                                |
| Favourite                  | star                                                                                                 | `Star`                                                                                                           |
| Back / forward             | arrow-left, arrow-right                                                                              | `ArrowLeft`, `ArrowRight`                                                                                        |
| Filter / sort              | filter-left                                                                                          | `ListFilter`, `ArrowUpDown`                                                                                      |
| Views                      | list, grid, board                                                                                    | `List`, `LayoutGrid`, `Columns3`                                                                                 |
| Meeting link               | camera-video                                                                                         | `Video`                                                                                                          |
| Open in panel / full page  | arrows-angle-expand, box-arrow-up-right                                                              | `Maximize2`, `SquareArrowOutUpRight`                                                                             |
| Archive / restore / delete | archive, arrow-counterclockwise, trash3                                                              | `Archive`, `RotateCcw`, `Trash2`                                                                                 |
| Editor                     | type, type-h1…, list-ul, list-ol, list-check, code-slash, quote, link-45deg, table, image, paperclip | `Type`, `Heading1`…, `List`, `ListOrdered`, `ListChecks`, `Code`, `Quote`, `Link`, `Table`, `Image`, `Paperclip` |

Brand marks (Linear, GitHub, Google, the DevBrain logomark) stay as SVG assets in `src/renderer/assets/`.

---

## 4. Component inventory

Every component the Figma screens need. **Base** components are shadcn/ui equivalents in `components/ui/`. **App** components are DevBrain-specific and built from base components.

### 4.1 Base components (shadcn/ui equivalents)

| Component               | Radix / library    | DevBrain spec                                                                                                                                                                                                                                                                                                                                                            | Used in                                                                 |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Button**              | Slot               | Variants: `default` (secondary fill, strong border), `primary` (light fill), `ghost` (text only: "Close"), `outline`, `destructive` (default look with `--destructive` text), `link` ("View all tasks →"). Sizes: `xs` 24, `sm` 32 (default), `md` 36; `icon-xs` 24, `icon-sm` 28, `icon` 32. 12px/600 label, 12px radius, optional leading icon.                        | Everywhere                                                              |
| **Button Group**        | –                  | Joined buttons with a shared border; split button = action + chevron menu.                                                                                                                                                                                                                                                                                               | Settings "Export as JSON ▾", calendar ← Today →                         |
| **Toggle Group**        | ToggleGroup        | Segmented control: `--background` track, `--border` outline, 12px radius, `--secondary` thumb on the active item. Text and icon-only variants.                                                                                                                                                                                                                           | Month/Week/Day, list/grid/board view, home quick filters                |
| **Tabs**                | Tabs               | Two styles: `segmented` (same look as Toggle Group) and `underline` (2px `--foreground` bar under the active label).                                                                                                                                                                                                                                                     | Settings sections (segmented), project Overview/Tasks/Notes (underline) |
| **Badge**               | –                  | Pill: `--background` fill, `--border` outline, 4×12 padding, 12px/500. Optional leading icon or colour bar, `count` variant (small square number, "Today 1").                                                                                                                                                                                                            | Base for every pill in 4.3                                              |
| **Input**               | –                  | 32px, `--background`, `--input` border, 8px radius, 12px text, `--muted-foreground` placeholder. `ghost` variant with no border for inline titles.                                                                                                                                                                                                                       | Workspace name, link popover, search                                    |
| **Textarea**            | –                  | Auto-growing, borderless in documents ("Add description…").                                                                                                                                                                                                                                                                                                              | Task/event description, create-task dialog                              |
| **Checkbox**            | Checkbox           | 16px, 4px radius, `--border` outline, `--primary` when checked. Used to select rows, not to complete tasks.                                                                                                                                                                                                                                                              | Row selection, todo blocks in the editor                                |
| **Switch**              | Switch             | 18×10 track (compact), `--primary` when on.                                                                                                                                                                                                                                                                                                                              | "Create more" in the create-task dialog, settings toggles               |
| **Select**              | Select             | Trigger looks like a ghost Button with a value and chevron ("Sort **Priority**", "No Links ▾"). Content is a Dropdown Menu surface.                                                                                                                                                                                                                                      | Sort, settings options, calendar filter                                 |
| **Dropdown Menu**       | DropdownMenu       | `--popover`, `--border-strong`, 12px radius, `--shadow-md`, 4px padding. Items 32px, 8px radius, 12px icon + 14px/500 label; inactive items `--muted-foreground`, highlighted `--foreground`. Label (12px/600), separator (8px block with a 1px line), check indicator on the right, shortcut hint on the right (`#`, `##`, `---`), submenu chevron, `destructive` item. | Row "…" menus, "Turn into", filters                                     |
| **Context Menu**        | ContextMenu        | Same surface and items as Dropdown Menu.                                                                                                                                                                                                                                                                                                                                 | Right-click on task, project, note rows                                 |
| **Popover**             | Popover            | `--popover` surface, 12px radius, 12px padding.                                                                                                                                                                                                                                                                                                                          | Filter builder, date picker, link editor, workspace colour              |
| **Command**             | cmdk               | Search list inside a Popover or Dialog: input on top, grouped results ("Basic Blocks", "List Blocks", "Media", "Others").                                                                                                                                                                                                                                                | Slash menu, "Link to…", global search, project/note pickers             |
| **Calendar**            | react-day-picker   | Mini month: 7 columns, 12px day numbers, `--subtle-foreground` for outside days, today = `--now-indicator` filled 4px-radius square.                                                                                                                                                                                                                                     | Calendar sidebar, date picker                                           |
| **Date Picker**         | Popover + Calendar | Plus time input and quick picks (Today, Tomorrow, Next week).                                                                                                                                                                                                                                                                                                            | Task due/start date, project dates                                      |
| **Dialog**              | Dialog             | `--overlay`, `--border-strong`, 12px radius, `--shadow-2xl`, 24px padding, footer actions right-aligned (ghost Close + default action).                                                                                                                                                                                                                                  | Create task (600 wide), create event                                    |
| **Alert Dialog**        | AlertDialog        | Same as Dialog, 480 wide; destructive action uses `destructive` Button.                                                                                                                                                                                                                                                                                                  | "Delete Task?", unlink, delete project                                  |
| **Sheet**               | Dialog (side)      | Right-side panel 380 wide, `--overlay`, header with title, expand and close icon buttons.                                                                                                                                                                                                                                                                                | Event Details, Task Details (in calendar and lists)                     |
| **Toast**               | Sonner             | 356 wide, `--overlay`, `--border`, 12px radius, `--shadow-2xl`, 16px padding. Leading status icon (success `--status-completed`, warning `--priority-medium`, error `--destructive`), title 14/500, description 12 `--subtle-foreground`, optional action button ("Undo").                                                                                               | Create/delete/undo feedback                                             |
| **Tooltip**             | Tooltip            | `--popover`, 8px radius, 12px text, 4×8 padding, 300ms delay.                                                                                                                                                                                                                                                                                                            | Icon buttons, truncated names                                           |
| **Avatar**              | Avatar             | Letter tile: 20 (sidebar), 60/72 (onboarding). Swatch tint background, white letter, `--radius-sm`/`--radius-xl`.                                                                                                                                                                                                                                                        | Workspace tile, attendees                                               |
| **Separator**           | Separator          | 1px `--border`.                                                                                                                                                                                                                                                                                                                                                          | Lists, menus, panels                                                    |
| **Breadcrumb**          | –                  | 14px, `--foreground` parent, chevron, current item `--muted-foreground` with its entity icon.                                                                                                                                                                                                                                                                            | Top bar of every page                                                   |
| **Progress**            | Progress           | Bar: 3px tall, `--radius-xs`, `--border` track, swatch/health fill.                                                                                                                                                                                                                                                                                                      | Project progress in lists                                               |
| **Progress Ring** _app_ | –                  | SVG ring 12/16px (subtask "3/4", in-progress orange), 160/280px (project overview).                                                                                                                                                                                                                                                                                      | Subtask progress, project overview                                      |
| **Scroll Area**         | ScrollArea         | Thin overlay scrollbar, `--border-strong` thumb.                                                                                                                                                                                                                                                                                                                         | Sidebar, lists, calendar grid                                           |
| **Kbd**                 | –                  | 12px mono, `--muted` fill, 4px radius.                                                                                                                                                                                                                                                                                                                                   | Menu shortcuts, help                                                    |
| **Skeleton**            | –                  | `--muted` block with a pulse.                                                                                                                                                                                                                                                                                                                                            | Lists while loading                                                     |
| **Empty**               | –                  | Centred icon, title 14/500, description `--muted-foreground`, optional action.                                                                                                                                                                                                                                                                                           | Empty lists, empty calendar day ("No event")                            |
| **Label / Field**       | Label              | Field label 12px `--muted-foreground` above or beside a control.                                                                                                                                                                                                                                                                                                         | Task properties, settings, event details                                |
| **Sidebar**             | –                  | See 4.2.                                                                                                                                                                                                                                                                                                                                                                 | App shell                                                               |

### 4.2 App shell

| Component             | Spec                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AppShell**          | Sidebar (288px) + main column. Main column: Titlebar/Breadcrumb bar, then the page. `--background` throughout, `--sidebar-border` between.                                  |
| **Titlebar**          | 40px drag region: macOS traffic lights (native, `titleBarStyle: 'hiddenInset'`), back/forward icon buttons on the right of the sidebar.                                     |
| **WorkspaceSwitcher** | Sidebar header: 20px tile + workspace name (14/500) + chevron, opens a Dropdown Menu of workspaces and "New Workspace". Search and New (square-pen) icon buttons beside it. |
| **SidebarNav**        | Items: 36px, 8px padding, 16px icon + 14px label, `--sidebar-foreground`. Active item: `--sidebar-accent` fill, `--border-strong` outline, `--sidebar-accent-foreground`.   |
| **SidebarGroup**      | Collapsible heading (14px `--muted-foreground`, "Recents", "Favorites") over entity links: 32px, 12px icon or colour bar + 12px name, "More" overflow.                      |
| **SidebarFooter**     | Settings and Help nav items, pinned to the bottom.                                                                                                                          |
| **PageHeader**        | Title (page or document style), optional subtitle ("You have **12 tasks** and **4 meetings** today"), actions on the right ("…", favourite star).                           |
| **Toolbar**           | 36px row under the header: Filter button with count, quick filters (Toggle Group), item count ("12 tasks"), Sort select, view Toggle Group, primary action ("New Task").    |
| **DetailsAside**      | Docked right column (or Sheet on narrow windows): property fields for the open item.                                                                                        |

### 4.3 App components: entities and properties

| Component                    | Variants / states                                                                                                     | Notes                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **TaskStatusIcon**           | Not started, In progress, Completed, Overdue (derived), Cancelled (to design)                                         | 16px; 12px inside pills. Clicking it cycles or opens a status menu.                                       |
| **PriorityIcon**             | High, Medium, Low                                                                                                     | 16px, no label in rows.                                                                                   |
| **ProjectHealthIcon**        | On track, At risk, Off track, Not started, Completed                                                                  | Maps 1:1 to `ProjectHealth`.                                                                              |
| **PlatformIcon**             | Linear, GitHub, (Google calendar)                                                                                     | Brand SVG, 16px in rows, 12px in pills.                                                                   |
| **TaskDate**                 | Regular, Today (`--date-today`), Overdue (`--date-overdue`), None ("No due date")                                     | 12px meta text, right-aligned in rows.                                                                    |
| **RelativeTime**             | Soon (red, < 1h), today (amber), later (subtle)                                                                       | "In 5 minutes", "In 3 hours", "2h ago".                                                                   |
| **EntityPill** ("Linked to") | Project (folder), Note (file), Event (colour bar), Task (status icon), Linear, GitHub; `count` ("3 Tasks"); removable | Badge with icon + truncated name. A "Linked to" prefix in `--subtle-foreground` when shown on a document. |
| **PropertyPill**             | Status, Priority, Date ("Today 10:30 AM"), Project, empty ("+ Add start date", "+ Add to project")                    | Badge-shaped Select/Popover trigger. Empty state is dashed-feel: `--muted-foreground` with a plus icon.   |
| **ProjectStatusPill**        | Health icon + label ("On Track"), Started/Due date pills                                                              | Project header.                                                                                           |
| **SubtaskProgress**          | Ring + "3/4"                                                                                                          | Badge with a Progress Ring.                                                                               |
| **ColorBar**                 | 3px wide, full height, `--radius-xs`, swatch colour                                                                   | Events in lists, sidebar, schedule cards, calendar blocks.                                                |
| **WorkspaceTile**            | 20 / 60 / 72px                                                                                                        | Avatar with swatch tint.                                                                                  |
| **SwatchPicker**             | 6 swatches, 24px, 8px radius, check mark on the selected one                                                          | Onboarding, workspace settings, project/calendar colour.                                                  |
| **IssueKey**                 | "ENG-124", "#1293"                                                                                                    | 12px `--subtle-foreground`, tabular figures.                                                              |

### 4.4 App components: lists

| Component        | Spec                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TaskRow**      | 40px, `--border` bottom. Left: select Checkbox (visible on hover or when any row is selected), TaskStatusIcon, PlatformIcon + IssueKey (when synced), TaskName. Right: EntityPill (project or event), PriorityIcon, TaskDate. Hover `--accent`; selected `--accent` + checkbox on. |
| **TaskName**     | Default; Is subtask (`CornerDownRight` + parent EntityPill); Has subtasks (SubtaskProgress); Completed (struck through, `--muted-foreground`).                                                                                                                                     |
| **EventRow**     | Calendar icon, title, time ("Today, 12:05 – 12:30PM"), "• Repeats every day"; right: "Join Meeting" button (when it has a link and starts soon) and RelativeTime.                                                                                                                  |
| **NoteRow**      | File icon, title, preview (subtle), EntityPills, updated time.                                                                                                                                                                                                                     |
| **ProjectRow**   | Folder icon, title, ProjectHealthIcon or pill, Progress bar, task count, due date. "Icon only" variant for compact lists.                                                                                                                                                          |
| **GroupHeading** | 40px `--muted` band: icon (flag, clock, calendar), label 12/500, count (subtle), hint on the right ("Overdue & within 1 hour"). Collapsible.                                                                                                                                       |
| **List**         | Container for rows: virtualised for long lists, keyboard navigation (↑/↓, Enter to open, x to select, Space for quick look).                                                                                                                                                       |
| **ArchiveRow**   | Any row plus Restore (`RotateCcw`) and Delete forever (`Trash2`) actions.                                                                                                                                                                                                          |

### 4.5 App components: cards (Home)

| Component         | Spec                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **SectionHeader** | Section heading on the left, link Button on the right ("View calendar →").                                                                     |
| **ScheduleCard**  | `--card`, `--border`, 12px radius. ColorBar, title 14/500, "12 mins • 9:00 AM" (time-until in `--date-today` when soon), optional Join button. |
| **NoteCard**      | File icon + relative time, title 14/500, two-line preview `--subtle-foreground`.                                                               |
| **ProjectCard**   | Folder icon, title, health, progress.                                                                                                          |
| **SettingsGroup** | `--card` with `--border`, rows separated by `--border`: label 12/500 + description (meta) on the left, control on the right.                   |

### 4.6 App components: calendar

The calendar grid itself is FullCalendar (see [the adapter spec](../calendar/fullcalendar-adapter.md)); these components theme it and fill its slots.

| Component           | Spec                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **CalendarHeader**  | Date title (24/600), Filter, Month/Week/Day Toggle Group, ← Today → Button Group, "New Event".                         |
| **AllDayRow**       | `--muted` band with all-day items as EntityPill-like chips, "+ 1 more".                                                |
| **TimeGrid theme**  | Hour lines `--border`, hour labels 10px `--subtle-foreground`, now line `--now-indicator`.                             |
| **EventBlock**      | `--muted` fill, 8px radius, ColorBar on the left, title 12/500, time meta, video icon chip when it has a meeting link. |
| **MonthCell**       | Day number, up to N event chips, "+ more"; today's number in a `--now-indicator` square.                               |
| **CalendarSidebar** | Mini Calendar, then "Today" / "Tomorrow" agenda lists (sidebar-style entity links).                                    |
| **EventDetails**    | Sheet: ColorBar + title, field grid (Date, Time, Repeats, Where), description, linked Tasks list with "+ Add".         |

### 4.7 App components: documents and editor

| Component             | Spec                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DocumentHeader**    | Inline-editable title (document title style), date meta, "…" and favourite, pill row (project, "Linked to").                                                      |
| **PropertiesPanel**   | Aside card (`--border`, 12px radius): Label + PropertyPill rows (Status, Priority, Due, Project).                                                                 |
| **LinkedList**        | Small header ("Subtasks", "Notes", "Linked Tasks") + "+ Add" xs Button, then compact rows in bordered 8px-radius items, or an empty action ("Create Note").       |
| **Editor**            | Rich-text surface: paragraph, H1–H3, bulleted/numbered/todo lists, code block (`--muted`, mono), quote, divider, link, table, image, file attachment, task block. |
| **FormattingToolbar** | Floating bar on selection: block-type select ("Text ▾"), bold, italic, underline, strikethrough, code, link, text colour ("A"); 32px icon toggles, separators.    |
| **SlashMenu**         | Command list grouped as in Figma, with markdown shortcut hints on the right.                                                                                      |
| **LinkPopover**       | Input "Add a link…" + open, unlink, delete icon buttons.                                                                                                          |
| **ColorMenu**         | Text and highlight swatch grids (5 × 2).                                                                                                                          |

### 4.8 App components: onboarding and system

| Component           | Spec                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Logomark**        | SVG, 42×48 (onboarding), 72×82 (splash).                                                                                           |
| **SplashScreen**    | Centred pulsing Logomark on `--background`.                                                                                        |
| **OnboardingCard**  | Centred column: Logomark, title, subtitle, content (WorkspaceTile + Input + SwatchPicker, or a workspace list), full-width Button. |
| **WorkspacePicker** | Bordered list of workspaces (tile + name), separator, "+ New Workspace".                                                           |
| **IntegrationCard** | _Not designed yet_: brand icon, name, connection status, Connect/Disconnect, synced sources with Switches.                         |

---

## 5. Patterns

- **Rows over cards.** Lists of tasks, notes, projects and events are full-width 40px rows separated by `--border`. Cards are only for the Home summary sections and settings groups.
- **Pills for relations and properties.** Anything that points at another entity or opens a picker is a Badge-shaped pill; plain text is never clickable.
- **Hover reveals.** Row checkboxes, "…" menus and secondary actions appear on hover/focus so rows stay calm.
- **Empty values are actions.** An unset property shows "+ Add …" in `--muted-foreground`, never a blank.
- **Destructive = red text, not red fill.** Confirm with an Alert Dialog that says what happens to linked items, and offer Undo in a toast where the action can be reversed.
- **Truncate, then tooltip.** Names in pills and rows truncate with an ellipsis; the full name is in a Tooltip.
- **Focus.** `:focus-visible` gets a 2px `--ring` outline, offset 2px (inset for rows and menu items).

---

## 6. Where each screen uses what

| Figma page                   | Main components                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome                      | OnboardingCard, Logomark, WorkspaceTile, Input, SwatchPicker, WorkspacePicker, Button                                                                                                        |
| Loading/Splash               | SplashScreen                                                                                                                                                                                 |
| Home (final)                 | AppShell, PageHeader with subtitle, SectionHeader, ScheduleCard, TaskRow, NoteCard, ProjectCard, Empty (calendar)                                                                            |
| Inbox                        | Home variant: Toolbar with quick filters, GroupHeading, EventRow, TaskRow                                                                                                                    |
| Tasks                        | Breadcrumb, Toolbar (Filter, count, Sort, views, New Task), TaskRow, GroupHeading, task detail (DocumentHeader, PropertiesPanel, LinkedList), create-task Dialog, Context Menu, Alert Dialog |
| Notes                        | NoteRow, document page (DocumentHeader, EntityPill, Editor, LinkedList aside), Context Menu, Dropdown Menu                                                                                   |
| Project                      | ProjectRow, project page (ProjectStatusPill, underline Tabs, Progress Ring, TaskRow, NoteRow), Context Menu with submenus                                                                    |
| Calendar                     | CalendarHeader, AllDayRow, time grid, EventBlock, MonthCell, CalendarSidebar, EventDetails Sheet, Dropdown Menu filter                                                                       |
| Archive                      | ArchiveRow, Toolbar                                                                                                                                                                          |
| Settings                     | PageHeader, segmented Tabs, SettingsGroup, Button, Button Group, Select, Switch                                                                                                              |
| Editor                       | Editor, FormattingToolbar, SlashMenu, LinkPopover, ColorMenu, Dropdown Menu ("Turn into")                                                                                                    |
| Components                   | Source for TaskRow, TaskName, TaskDate, TaskStatusIcon, PriorityIcon, ProjectHealthIcon, EntityPill, Checkbox, Favourite, Toast, Alert Dialog, menus                                         |
| Flow, Home (old ideas), Test | Explorations; no extra components beyond the above                                                                                                                                           |

---

## 7. Gaps and open questions from the Figma file

Things the design does not settle yet. Decide them before building the related screens.

1. **Cancelled task status.** `TaskStatus.CANCELLED` exists in the data model but has no icon or colour in Figma. Token `--status-cancelled` is a placeholder.
2. **Project status vs health.** Figma's "Project Status" pill matches `ProjectHealth`. `ProjectStatus` (Not started, On hold, Active, Completed) has no design; a pause icon on the Components page hints at On hold.
3. **Light theme screens.** The shadcn components on the Components page ("Task Item (Shadcn)" etc.) are light; every screen is dark. The tokens support both; the light screens are not designed.
4. **Two task-item versions.** "Task Item" (dark, Bootstrap icons) and "Task Item (Shadcn)" (light, Lucide). This spec takes the dark layout and the shadcn structure.
5. **Notes left in the file:** "Should we have a default Backlog status?", "144 vs 128???" (row/column width), "Change padding on icons", "Empty state for no project and no note???", "Menu item: Link project, toggle linked tasks (could be a separate button)", "Unlink note".
6. **Views.** The Tasks toolbar shows list, grid and board toggles; only list is designed.
7. **Integrations and Help pages** are in the sidebar but not designed. IntegrationCard above is a proposal.
8. **Contrast.** `--subtle-foreground` (neutral-600) fails WCAG AA on the dark background; see 3.1.
9. **Font.** Several layers use SF Pro instead of Inter. This spec standardises on Inter.

---

## 8. Build order

1. Load `tokens.css` and Inter; base styles (body font, background, focus ring, scrollbar).
2. Base: Button, Badge, Separator, Tooltip, Checkbox, Input, Textarea, Switch, Kbd, Skeleton.
3. Overlays: Dropdown Menu, Context Menu, Popover, Select, Dialog, Alert Dialog, Sheet, Toast.
4. Shell: AppShell, Titlebar, Sidebar (WorkspaceSwitcher, nav, groups), Breadcrumb, PageHeader, Toolbar, Toggle Group, Tabs.
5. Entity atoms: status/priority/health/platform icons, TaskDate, EntityPill, PropertyPill, SubtaskProgress, ColorBar.
6. Lists: TaskRow, GroupHeading, NoteRow, ProjectRow, EventRow, List with keyboard navigation.
7. Documents: DocumentHeader, PropertiesPanel, LinkedList; Command, Calendar, Date Picker.
8. Home cards; Calendar theming; Editor; onboarding and splash.
