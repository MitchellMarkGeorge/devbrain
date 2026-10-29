# DevBrain design system

DevBrain's interface is **shadcn/ui components drawn in DevBrain's own design language**: the dark, quiet look of the [DevBrain v1 Figma file](https://www.figma.com/design/w9WtYAUXkkzqKIMAzFo08I/DevBrain-v1).

- **Components** follow shadcn/ui (new-york-v4): the same names, `variant` and `size` props and theme variable names. Their behaviour comes from **Base UI** ([`@base-ui/react`](https://base-ui.com)) instead of Radix, and their look (corners, heights, text sizes, outlines) from the Figma file. The app styles them with CSS Modules instead of Tailwind.
- **Tokens** live in [`tokens.json`](tokens.json) and are generated into [`src/renderer/styles/tokens.css`](../../src/renderer/styles/tokens.css) with `npm run tokens`. Every colour is a Tailwind v4 colour.
- **The visual reference** is the [DevBrain design system page](https://claude.ai/artifact/4hf6qVrE4z8cmsCGJpNjt2): live previews of every component in both themes, built from the same `tokens.json`.

## Contents

1. [Principles](#1-principles)
2. [Building shadcn components without Tailwind](#2-building-shadcn-components-without-tailwind)
3. [Colour](#3-colour)
4. [Type, size and shape](#4-type-size-and-shape)
5. [Components](#5-components)
6. [Where each screen uses what](#6-where-each-screen-uses-what)
7. [Where this differs from shadcn and from Figma](#7-where-this-differs-from-shadcn-and-from-figma)
8. [Open questions](#8-open-questions)
9. [Build order](#9-build-order)

---

## 1. Principles

1. **shadcn's structure, DevBrain's look.** Start from the shadcn component and keep its API and behaviour; give it the Figma styling through tokens and its CSS Module.
2. **Quiet chrome.** Surfaces are near-black; structure comes from 1px lines (`--border`, `--border-strong`), not fills. Shadows only on floating layers.
3. **Colour means something.** Neutrals carry the UI. Colour is reserved for task status, priority, project health, due dates and user-picked colours.
4. **Dense but legible.** The interface lives at 12–14px (rows, pills, buttons at 12px; navigation and menus at 14px); titles jump to 24–30px. Rows are 48px.
5. **One shape language.** 12px corners for anything you click or open as a whole (buttons, pills, cards, menus, dialogs); 8px for items inside them (menu items, sidebar items, inputs); 4px for tiny things (checkbox, small tile).
6. **Keyboard reachable.** Base UI handles focus, arrow keys, typeahead and Escape; shadcn's focus ring is on every control.

---

## 2. Building shadcn components without Tailwind

shadcn/ui is copied into the project, one file per component. Keep that model, swap Radix for Base UI and change the styling layer.

| shadcn                                         | DevBrain                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Radix primitives (`radix-ui`)                  | Base UI parts (`@base-ui/react`), mapped in [5.2](#52-base-ui-parts)                     |
| `asChild` + Radix `Slot`                       | Base UI's `render` prop (`useRender` for DevBrain's own components)                      |
| Radix `data-state="open"`, `"checked"`, `"on"` | Base UI's `data-open`, `data-checked`, `data-pressed`, `data-active`, `data-highlighted` |
| `tw-animate-css` enter/exit classes            | Transitions on `[data-starting-style]` and `[data-ending-style]`                         |
| `cva()` variants in `className`                | `data-variant` / `data-size` attributes, styled in a CSS Module                          |
| Tailwind classes                               | Values from tokens (`--control-md`, `--radius-lg`, `--border-strong`)                    |
| `bg-primary/90`, `ring-ring/50`                | `color-mix(in oklab, var(--primary) 90%, transparent)`                                   |
| `dark:` variants                               | `:root:not([data-theme='light']) .x { … }` (dark is the default theme)                   |
| `cn()` (clsx + tailwind-merge)                 | `clsx`                                                                                   |
| `globals.css` theme                            | `tokens.css`, generated from `tokens.json`                                               |
| `components/ui/*.tsx`                          | `src/renderer/components/ui/*.tsx` + `*.module.css`                                      |
| Sheet, Sonner, cmdk                            | Base UI Drawer, Toast and Autocomplete                                                   |
| react-day-picker, lucide-react                 | Same libraries (Base UI has no calendar)                                                 |

shadcn's Button on Base UI, in DevBrain's look:

```tsx
// src/renderer/components/ui/button.tsx
import { Button as BaseButton } from '@base-ui/react/button';
import clsx from 'clsx';
import styles from './button.module.css';

type ButtonProps = BaseButton.Props & {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'xs' | 'icon' | 'icon-sm' | 'icon-xs';
};

// `render` (from Base UI) replaces shadcn's `asChild`:
// <Button render={<div />} nativeButton={false}>, <Menu.Trigger render={<Button />}>
export function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // Base UI's className may be a function of the button's state
      className={(state) =>
        clsx(styles.button, typeof className === 'function' ? className(state) : className)
      }
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
  justify-content: center;
  gap: var(--space-1-5);
  height: var(--control-md); /* 34px */
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-lg); /* 12px */
  font: var(--font-weight-semibold) var(--text-xs) / var(--text-xs-leading) var(--font-sans);
  transition: background-color var(--duration-fast);
}
/* DevBrain's default is the Figma quiet button; shadcn's filled default is `primary` */
.button[data-variant='default'],
.button[data-variant='destructive'] {
  background: var(--secondary);
  border-color: var(--border-strong);
  color: var(--secondary-foreground);
}
.button[data-variant='destructive'] {
  color: var(--destructive);
}
.button[data-variant='primary'] {
  background: var(--primary);
  color: var(--primary-foreground);
}
.button[data-variant='ghost']:hover {
  background: var(--accent);
}
.button:focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.button[data-disabled] {
  opacity: 0.5;
  pointer-events: none;
}
```

State styles target Base UI's attributes. A checkbox, for example:

```css
.checkbox {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.checkbox[data-checked] {
  background: var(--primary);
  border-color: var(--primary);
}
.popup[data-starting-style],
.popup[data-ending-style] {
  opacity: 0;
  transform: translateY(4px);
}
.popup {
  transition:
    opacity var(--duration-normal),
    transform var(--duration-normal);
}
```

The design system page's `components/bundle.css` has this translation for every component in section 5.

---

## 3. Colour

`tokens.json` holds every colour with a usage note. Variable names are shadcn's; values are Tailwind v4.

### 3.1 Theme

The light theme is shadcn's neutral light theme (with `--ring` at neutral-500, since neutral-400 is 2.6:1 on white). The dark theme is the Figma file's, which differs from shadcn's neutral dark theme here:

| Variable                                                 | shadcn dark | DevBrain dark | Figma use                                         |
| -------------------------------------------------------- | ----------- | ------------- | ------------------------------------------------- |
| `--foreground`                                           | neutral-50  | neutral-200   | Body text                                         |
| `--card`, `--sidebar`                                    | neutral-900 | neutral-950   | Cards and the sidebar sit on the page colour      |
| `--secondary`, `--muted`, `--accent`, `--sidebar-accent` | neutral-800 | neutral-900   | Button fill, hover, selected nav item, group band |
| `--border`                                               | white 10%   | neutral-900   | Row lines, pills, cards, checkbox                 |
| `--input`                                                | white 15%   | neutral-800   | Input outline                                     |
| `--sidebar-foreground`                                   | neutral-50  | neutral-400   | Inactive navigation                               |

Unchanged from shadcn: `--background`, `--popover`, `--primary`, `--muted-foreground`, `--destructive`, `--ring`.

DevBrain additions: `--border-strong` (neutral-800: outlines of buttons, menus, dialogs, toasts and the selected nav item), `--foreground-strong` (titles and row names), `--subtle-foreground` (skippable metadata, 4.2:1 in dark; never instructions or errors) and `--backdrop`.

Surfaces: page, sidebar, lists and cards on `--background`; menus, popovers, tooltips, dialogs, sheets and toasts on `--popover` (Figma draws dialogs and toasts on #111; neutral-900 is the nearest Tailwind step).

### 3.2 DevBrain colours

| Group                      | Tokens                                                                         | Dark                                                     | Light                           |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------- |
| Task status (`TaskStatus`) | `--status-not-started`, `-in-progress`, `-completed`, `-overdue`, `-cancelled` | neutral-500, orange-500, green-500, red-500, neutral-500 | 700 steps, red-600              |
| Priority (`TaskPriority`)  | `--priority-high`, `-medium`, `-low`                                           | red-500, amber-500, emerald-600                          | red-600, amber-700, emerald-700 |
| Health (`ProjectHealth`)   | `--health-on-track`, `-at-risk`, `-off-track`, `-not-started`, `-completed`    | lime-500, amber-500, red-500, neutral-500, green-500     | 700 steps                       |
| Dates                      | `--date-today`, `--date-overdue`, `--now-indicator`                            | amber-500, red-500, red-600                              | amber-700, red-600              |
| Swatches                   | `--swatch-red/amber/green/blue/indigo/pink`, `--swatch-*-tile`                 | Tailwind 500 steps; tiles the 950 step                   | same                            |

Each status also has its own icon shape. The light theme uses the 700 steps because the 500s fall below 3:1 on white. The one non-Tailwind colour is `--platform-linear` (Linear's brand colour).

---

## 4. Type, size and shape

**Type.** Inter, and Geist Mono for code. From the Figma text styles:

| Style             | Size / line  | Weight   | Used for                                                   |
| ----------------- | ------------ | -------- | ---------------------------------------------------------- |
| `page-title`      | 30 / 36      | 600      | Home greeting, Settings                                    |
| `document-title`  | 24 / 32      | 600      | Task, note, project and day titles                         |
| `dialog-title`    | 20 / 28      | 500      | Onboarding titles                                          |
| `section-heading` | 14 / 20      | 500      | Home and Settings sections; dialog, sheet and toast titles |
| `body`            | 14 / 20      | 400      | Sidebar navigation, note text                              |
| `menu-item`       | 14 / 20      | 500      | Menu items, segmented tabs                                 |
| `row`             | 12 / 16      | 500      | Row names, pill labels, inputs                             |
| `button`          | 12 / 16      | 600      | Button labels                                              |
| `menu-label`      | 12 / 16      | 600      | Menu group labels                                          |
| `meta`            | 12 / 16      | 400      | Dates, keys, descriptions, hints, tooltips                 |
| `editor-h1/2/3`   | 24 / 20 / 18 | 600      | Note headings (sizes inferred from layer heights)          |
| `code`            | 13 / 20      | 400 mono | Code (not specified in Figma)                              |

**Sizes** (measured from the Figma screens): pills `--control-xs` 24px; menu items, inputs and editor toolbar buttons `--control-sm` 32px; buttons, toolbar controls and segmented controls `--control-md` 34px; sidebar items `--control-lg` 36px; in-row buttons ("+ Add") `--control-2xs` 22px; rows `--row-height` 48px; group headings `--group-height` 40px. Widths: sidebar 288px, menus 224px (180px short), alert dialogs 480px (create task 600px), details panel 380px, toasts 356px.

**Corners.** `--radius-lg` 12px (buttons, pills, cards, menus, popovers, dialogs, sheets, toasts, segmented tracks), `--radius-md` 8px (menu items, sidebar items, inputs, segmented thumbs, tooltips, swatches), `--radius-sm` 4px (checkbox, small tile, today in the calendar), `--radius-xs` 2px (colour bars), `--radius-xl` 16px (large workspace tile).

**Shadows.** Only floating layers: `--shadow-md` for menus, popovers and tooltips; `--shadow-2xl` for dialogs, sheets and toasts. Buttons and cards are flat.

**Motion.** 100ms hover and press; menus, popovers and tooltips fade with a 4px slide in 150ms; dialogs, sheets and toasts 250ms. Off under `prefers-reduced-motion`.

**Icons.** Lucide (`lucide-react`, shadcn's set) at stroke 1.75 to match the light Bootstrap Icons in the Figma screens: 16px for navigation, status and rows, 12px inside pills, menus and small buttons. Mapping: house-door → `House`, check-circle → `CircleCheck`, file-earmark-text → `FileText`, lightning → `Zap`, three-dots → `Ellipsis`, arrow-return-right → `CornerDownRight`. The DevBrain logomark is [`src/renderer/assets/devbrain-logomark.svg`](../../src/renderer/assets/devbrain-logomark.svg).

---

## 5. Components

### 5.1 shadcn components, in DevBrain's look

| Component                                    | DevBrain look                                                                                                                                                                                                                                                                                            | Used for                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Button                                       | `default` is the quiet button (`--secondary` + `--border-strong`, 34px, 12px semibold, 12px corners); `primary` is shadcn's filled one; `outline`, `secondary`, `ghost`, `destructive` (red text, no fill), `link`. Sizes `default` 34, `sm` 28, `lg` 36, `xs` 22, `icon` 34, `icon-sm` 32, `icon-xs` 24 | "New Task", "Show in Finder", dialog confirms (`default`); Filter, Sort (`outline`); "Close" (`ghost`); "View all →" (`link`) |
| Button Group                                 | joined default buttons                                                                                                                                                                                                                                                                                   | Export split button, ← Today →                                                                                                |
| Badge                                        | `outline` is the DevBrain pill (24px, 12px corners, `--background` with `--border`, 12px medium); adds icon, muted prefix, colour bar                                                                                                                                                                    | Every pill: projects, status, dates, counts                                                                                   |
| Toggle Group, Tabs                           | one segmented control: 34px `--background` track with `--border`, 8px `--secondary` thumb; toggles 12px, tabs 14px. Tabs add a `line` variant                                                                                                                                                            | Month/Week/Day, views, quick filters; Settings sections; project sub-pages                                                    |
| Input, Textarea, Label                       | 32px, 8px corners, `--input` outline, 12px text                                                                                                                                                                                                                                                          | Workspace name, link editor, descriptions                                                                                     |
| Checkbox                                     | 16px, 4px corners, `--border` outline                                                                                                                                                                                                                                                                    | Row selection, to-do blocks                                                                                                   |
| Switch                                       | 28×16 track, 10px thumb                                                                                                                                                                                                                                                                                  | "Create more", sync and preference toggles                                                                                    |
| Select, Dropdown Menu, Context Menu, Command | `--popover`, `--border-strong`, 12px corners, `--shadow-md`, 4px padding; 32px items with 8px corners, 12px icons, 14px medium labels in `--muted-foreground`; 12px semibold group labels; mono shortcut hints                                                                                           | Sort, row and right-click menus, "Turn into", slash menu, ⌘K                                                                  |
| Popover, Tooltip                             | `--popover` with `--border-strong`; tooltips 12px medium, 8px corners, dark (not shadcn's inverted)                                                                                                                                                                                                      | Filters, date picker, link editor; icon buttons                                                                               |
| Dialog, Alert Dialog                         | `--popover`, `--border-strong`, 12px corners, `--shadow-2xl`, 24px padding; 14px medium title, 12px description; `ghost` Close + action                                                                                                                                                                  | Create task / event; "Delete Task?"                                                                                           |
| Sheet                                        | 380px panel, `--popover`, `--border-strong`, 12px corners; header with expand and close icon buttons                                                                                                                                                                                                     | Event and task details                                                                                                        |
| Toast                                        | 356px, `--popover`, `--border-strong`, 12px corners; 14px title, 12px description; small default action button                                                                                                                                                                                           | Feedback with Undo                                                                                                            |
| Card                                         | flat: `--card`, `--border`, 12px corners, 16px padding, no shadow; `compact` size                                                                                                                                                                                                                        | Home summary, properties panel, settings groups                                                                               |
| Sidebar                                      | 288px; 36px nav items with 8px corners, active = `--sidebar-accent` + `--border-strong` outline; Recents and Favorites entries are the same 36px items under 14px group labels                                                                                                                           | App navigation                                                                                                                |
| Breadcrumb                                   | 14px section, 12px chevron, current item muted with its entity icon                                                                                                                                                                                                                                      | Top bar                                                                                                                       |
| Calendar                                     | 12px numerals, single-letter weekdays, today on a red (`--now-indicator`) square                                                                                                                                                                                                                         | Calendar sidebar, date pickers                                                                                                |
| Progress                                     | 3px bar in the project's health colour                                                                                                                                                                                                                                                                   | Project progress                                                                                                              |
| Separator, Skeleton, Scroll Area, Kbd        | shadcn, in tokens                                                                                                                                                                                                                                                                                        | Panels, loading, long lists, shortcuts                                                                                        |

### 5.2 Base UI parts

Every part below exists in `@base-ui/react` 1.9. Styles key off the listed attributes.

| Component                                              | Base UI parts                                                                                                                                                   | State attributes                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Button                                                 | `Button` (`render`, `nativeButton`)                                                                                                                             | `data-disabled`                                                    |
| Toggle Group                                           | `ToggleGroup`, `Toggle`                                                                                                                                         | `data-pressed`                                                     |
| Tabs                                                   | `Tabs.Root`, `.List`, `.Tab`, `.Panel`, `.Indicator` (the `line` underline)                                                                                     | `data-active` on the tab                                           |
| Input, Textarea, Label                                 | `Field.Root`, `.Label`, `.Control`, `.Description`, `.Error`; `Input`                                                                                           | `data-invalid`, `data-focused`, `data-touched`                     |
| Checkbox                                               | `Checkbox.Root`, `.Indicator`                                                                                                                                   | `data-checked` / `data-unchecked`, `data-indeterminate`            |
| Switch                                                 | `Switch.Root`, `.Thumb`                                                                                                                                         | `data-checked` / `data-unchecked`                                  |
| Dropdown Menu                                          | `Menu.Root`, `.Trigger`, `.Portal`, `.Positioner`, `.Popup`, `.Item`, `.Group`, `.GroupLabel`, `.Separator`, `.CheckboxItem`, `.SubmenuRoot`, `.SubmenuTrigger` | `data-highlighted`, `data-checked`, `data-popup-open`, `data-open` |
| Context Menu                                           | `ContextMenu` with the same parts                                                                                                                               | same                                                               |
| Select                                                 | `Select.Root`, `.Trigger`, `.Value`, `.Popup`, `.Item`, `.ItemIndicator`                                                                                        | `data-highlighted`, `data-selected`, `data-placeholder`            |
| Command palette, pickers                               | `Autocomplete` in a `Dialog` (Base UI's command-palette pattern); `Combobox` for project and note pickers                                                       | `data-highlighted`, `data-selected`                                |
| Popover, Tooltip                                       | `Popover.*`, `Tooltip.Provider`, `Tooltip.*` (`Root`, `Trigger`, `Positioner`, `Popup`, `Arrow`)                                                                | `data-open`, `data-side`, `data-starting-style`                    |
| Dialog, Alert Dialog                                   | `Dialog.*`, `AlertDialog.*` (`Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`)                                                 | `data-open`, `data-starting-style` / `data-ending-style`           |
| Sheet                                                  | `Drawer` with `swipeDirection="right"`                                                                                                                          | `data-open`, `data-swiping`                                        |
| Toast                                                  | `Toast.Provider`, `.Viewport`, `.Root`, `.Title`, `.Description`, `.Action`, `.Close`; tone as the toast `type`                                                 | `data-type`, `data-starting-style` / `data-ending-style`           |
| Progress                                               | `Progress.Root`, `.Track`, `.Indicator`                                                                                                                         | `data-complete`                                                    |
| Separator, Scroll Area, Avatar, Collapsible            | `Separator`, `ScrollArea.*`, `Avatar.*`, `Collapsible.*` (sidebar groups)                                                                                       | `data-orientation`, `data-scrolling`                               |
| Badge, Card, Kbd, Breadcrumb, Skeleton, Sidebar layout | Plain markup; interactive badges render as a trigger via `render`                                                                                               | `data-active` on the current sidebar item                          |
| Calendar                                               | None: react-day-picker inside a `Popover`                                                                                                                       |                                                                    |

### 5.3 DevBrain components

| Component                                | Built from                                                                                   | Notes                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StatusIcon, PriorityIcon, HealthIcon     | Lucide icons in domain colours                                                               | One shape per state; map to `TaskStatus`, `TaskPriority`, `ProjectHealth`                                                                                 |
| ProgressRing                             | SVG on an `--input` track                                                                    | Subtask "3/4" in rows; project progress                                                                                                                   |
| EntityPill                               | outline Badge                                                                                | Links to a project, note, task or event                                                                                                                   |
| PropertyPanel                            | Card + pills opening Dropdown Menu, Popover + Calendar, Command                              | Unset properties show "+ Add …"                                                                                                                           |
| TaskRow, EventRow, NoteRow, ProjectRow   | 48px row, Checkbox, icons, pills                                                             | 12px medium names, `--accent` hover and selection                                                                                                         |
| GroupHeading                             | 40px `--muted` band                                                                          | "Due now", "Due today", "Coming up"                                                                                                                       |
| BoardColumn, BoardCard                   | Card on `--neutral-900` with a `--neutral-800` border; cards on `--background` with a border | The Figma board (Tasks page): status icon, name and count above each column; a card has link pills, the title with a subtask pill, then priority and date |
| ScheduleCard, NoteCard, ProjectCard      | compact Card                                                                                 | Home summary                                                                                                                                              |
| SettingsGroup                            | Card of label + description + control rows                                                   | Settings                                                                                                                                                  |
| WorkspaceTile, SwatchPicker              | letter tile (20px, 4px corners; 60–72px on onboarding); radio group                          | Workspace identity                                                                                                                                        |
| EventBlock, all-day row, time grid       | FullCalendar themed with tokens                                                              | See [the adapter spec](../calendar/fullcalendar-adapter.md)                                                                                               |
| Editor toolbar, slash menu, link popover | Toggle Group, Command, Popover                                                               | Note editing                                                                                                                                              |
| Splash, onboarding                       | Logomark, Card, Input, SwatchPicker, Button                                                  | Welcome flow                                                                                                                                              |

---

## 6. Where each screen uses what

| Figma page          | Components                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome             | Logomark, Input, SwatchPicker, WorkspaceTile, Button                                                                                                                  |
| Loading/Splash      | Logomark (pulsing)                                                                                                                                                    |
| Home (final), Inbox | Sidebar, page title, Toggle Group (quick filters), GroupHeading, TaskRow, EventRow, ScheduleCard, NoteCard                                                            |
| Tasks               | Breadcrumb, toolbar (Popover filter, Select sort, Toggle Group views, Button), TaskRow, document page with PropertyPanel, Dialog (create), Context Menu, Alert Dialog |
| Notes               | NoteRow, document page, EntityPill, editor, Dropdown Menu                                                                                                             |
| Project             | ProjectRow, line Tabs, HealthIcon pill, ProgressRing, TaskRow, Context Menu with submenus                                                                             |
| Calendar            | Button Group, Toggle Group, FullCalendar with EventBlock, Calendar, Sheet (event details)                                                                             |
| Archive             | rows with Restore and Delete actions                                                                                                                                  |
| Settings            | Tabs, SettingsGroup, Button Group, Select, Switch                                                                                                                     |
| Editor              | toolbar, Command (slash menu), Popover (links), Dropdown Menu ("Turn into")                                                                                           |

---

## 7. Where this differs from shadcn and from Figma

**From shadcn's defaults** (the Figma design language wins): `default` button is quiet and bordered (filled moves to `primary`); `destructive` is red text, not a red fill; 12px corners instead of shadcn's 8–14px; 34px controls and 12px labels instead of 36px and 14px; badges are 24px pills; Tabs and Toggle Group share one segmented look; tooltips are dark, not inverted; dialogs, sheets and toasts sit on `--popover` with `--border-strong`; cards are flat; sidebar 288px with outlined active item; calendar "today" is red.

**From the Figma file** (by choice or by earlier decisions):

| Thing                    | Figma                             | Here                        | Why                        |
| ------------------------ | --------------------------------- | --------------------------- | -------------------------- |
| Dialog and toast surface | #111                              | neutral-900                 | Nearest Tailwind colour    |
| Secondary text           | neutral-500, metadata neutral-600 | neutral-400 and neutral-500 | Contrast (shadcn's values) |
| Swatches                 | Tailwind v3 hex                   | Tailwind v4 500 steps       | Tailwind v4 palette        |
| Icons                    | Bootstrap Icons                   | Lucide at stroke 1.75       | shadcn's icon set          |
| Switch                   | 18×10                             | 28×16                       | Big enough to click        |
| Focus                    | not designed                      | shadcn's 3px ring           | Keyboard access            |
| Editor heading sizes     | layer heights only                | 24 / 20 / 18px              | Inferred                   |

---

## 8. Open questions

1. **Cancelled task status.** `TaskStatus.CANCELLED` has no design; `--status-cancelled` and a slashed circle are placeholders.
2. **Project status vs health.** Figma's "Project Status" pill matches `ProjectHealth`; `ProjectStatus` (Not started, On hold, Active, Completed) has no design.
3. **Light theme screens** are not designed; the tokens support them.
4. **Views.** The Tasks toolbar shows list, grid and board toggles. List and board are designed (the board on the Tasks page: filled status columns of outlined cards); grid is not.
5. **Integrations and Help pages** are in the sidebar but not designed.
6. **Notes left in the Figma file:** "Should we have a default Backlog status?", "144 vs 128???", "Change padding on icons", "Empty state for no project and no note???", "Menu item: Link project, toggle linked tasks", "Unlink note".

---

## 9. Build order

1. Add `@base-ui/react`; load `tokens.css`, Inter and Geist Mono; base styles (body font and background, `border-color: var(--border)` on everything, the focus ring).
2. shadcn basics in DevBrain's look: Button, Badge, Separator, Label, Input, Textarea, Checkbox, Switch, Toggle Group, Tabs, Tooltip, Skeleton.
3. Overlays on Base UI: Menu, Context Menu, Popover, Select, Autocomplete (command palette), Dialog, Alert Dialog, Drawer (sheet), Toast.
4. Shell: Sidebar with the workspace switcher, Breadcrumb, page title, toolbar.
5. DevBrain atoms: status, priority and health icons, ProgressRing, EntityPill.
6. Lists: TaskRow, GroupHeading, EventRow, NoteRow, ProjectRow with keyboard navigation.
7. Documents: PropertyPanel, Calendar and date picker, Card; Home cards.
8. FullCalendar theming, the editor, onboarding and splash.
