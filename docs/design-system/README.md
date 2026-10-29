# DevBrain design system

DevBrain's interface is **shadcn/ui with a DevBrain theme on top**, plus a small set of DevBrain components built from shadcn parts.

- **Components** are shadcn/ui (new-york-v4): same names, anatomy, sizes, radii, type, states and Radix primitives. The app styles them with CSS Modules instead of Tailwind.
- **Tokens** live in [`tokens.json`](tokens.json) and are generated into [`src/renderer/styles/tokens.css`](../../src/renderer/styles/tokens.css) with `npm run tokens`. Colour variables use shadcn's names; every colour is a Tailwind v4 colour.
- **The visual reference** with live previews of every component in both themes is the [DevBrain design system page](https://claude.ai/artifact/4hf6qVrE4z8cmsCGJpNjt2), built from the same `tokens.json`.
- **Sources**: shadcn/ui's new-york-v4 component source and theme (a July 2025 snapshot of the registry), Tailwind v4's palette, and the [DevBrain v1 Figma file](https://www.figma.com/design/w9WtYAUXkkzqKIMAzFo08I/DevBrain-v1) for the screens, the dark look and the DevBrain components.

## Contents

1. [Principles](#1-principles)
2. [Building shadcn components without Tailwind](#2-building-shadcn-components-without-tailwind)
3. [Theme](#3-theme)
4. [Type, space and shape](#4-type-space-and-shape)
5. [Components](#5-components)
6. [Where each screen uses what](#6-where-each-screen-uses-what)
7. [Where this differs from the Figma file](#7-where-this-differs-from-the-figma-file)
8. [Open questions](#8-open-questions)
9. [Build order](#9-build-order)

---

## 1. Principles

1. **shadcn first.** Use the shadcn component and its variants before making anything new. A DevBrain component is a composition of shadcn parts (a task row is a table row of a Checkbox, icons and Badges), not a new visual language.
2. **Change the theme, not the component.** DevBrain's look comes from the theme variables. A component's CSS reads `--primary`, `--border`, `--radius-md`; it never hard-codes a colour or size.
3. **Colour means something.** Neutrals carry the UI. Colour is reserved for task status, priority, project health, due dates and user-picked calendar/workspace colours.
4. **Dark first.** Every DevBrain screen is dark; the light theme is shadcn's and works without extra effort.
5. **Keyboard reachable.** Radix primitives give focus management, arrow keys and Escape; shadcn's focus ring is on every control.

---

## 2. Building shadcn components without Tailwind

shadcn/ui is not a package: you copy each component's file into the project. Keep that model and change only the styling layer.

| shadcn                                       | DevBrain                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Radix primitives (`radix-ui`)                | Same                                                                     |
| `cva()` variants in `className`              | `data-variant` / `data-size` attributes, styled in a CSS Module          |
| Tailwind classes (`h-9 px-4 rounded-md`)     | The same values from tokens (`--control-md`, `--space-4`, `--radius-md`) |
| `bg-primary/90`, `ring-ring/50`              | `color-mix(in oklab, var(--primary) 90%, transparent)`                   |
| `dark:` variants                             | `:root:not([data-theme='light']) .x { … }` (dark is the default theme)   |
| `cn()` (clsx + tailwind-merge)               | `clsx`                                                                   |
| `globals.css` theme                          | `tokens.css`, generated from `tokens.json`                               |
| `components/ui/*.tsx`                        | `src/renderer/components/ui/*.tsx` + `*.module.css`                      |
| Sonner, cmdk, react-day-picker, lucide-react | Same libraries                                                           |

shadcn's Button as a CSS Module:

```tsx
// src/renderer/components/ui/button.tsx
import { Slot } from 'radix-ui';
import clsx from 'clsx';
import styles from './button.module.css';

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs' | 'icon-sm' | 'icon-xs';
  asChild?: boolean;
};

export function Button({
  variant = 'default',
  size = 'default',
  asChild,
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={clsx(styles.button, className)}
      {...props}
    />
  );
}
```

```css
/* button.module.css: shadcn's buttonVariants */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: var(--control-md); /* h-9 */
  padding: 0 var(--space-4); /* px-4 */
  border: 1px solid transparent;
  border-radius: var(--radius-md); /* rounded-md */
  font: var(--font-weight-medium) var(--text-sm) / var(--text-sm-leading) var(--font-sans);
  transition:
    background-color var(--duration-fast),
    box-shadow var(--duration-fast);
}
.button:has(> svg) {
  padding: 0 var(--space-3); /* has-[>svg]:px-3 */
}
.button[data-variant='default'] {
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow: var(--shadow-xs);
}
.button[data-variant='default']:hover {
  background: color-mix(in oklab, var(--primary) 90%, transparent);
}
.button[data-variant='outline'] {
  background: var(--background);
  border-color: var(--border);
  box-shadow: var(--shadow-xs);
}
:root:not([data-theme='light']) .button[data-variant='outline'] {
  background: color-mix(in oklab, var(--input) 30%, transparent); /* dark:bg-input/30 */
  border-color: var(--input);
}
.button:focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.button:disabled {
  opacity: 0.5;
  pointer-events: none;
}
```

The design system page's `components/bundle.css` has this translation for every component listed in section 5.

---

## 3. Theme

`tokens.json` holds every colour with a usage note; `npm run tokens` writes `tokens.css`.

### 3.1 How DevBrain differs from shadcn's neutral theme

The light theme is shadcn's neutral light theme, except `--ring` (neutral-500 instead of neutral-400, which is 2.6:1 on white). The dark theme is shadcn's neutral dark theme with these overrides, so it matches the DevBrain screens:

| Variable               | shadcn dark | DevBrain dark | Why                                                |
| ---------------------- | ----------- | ------------- | -------------------------------------------------- |
| `--foreground`         | neutral-50  | neutral-200   | Softer body text in long lists, as in Figma        |
| `--card`               | neutral-900 | neutral-950   | Cards are outlined on the page, not filled         |
| `--secondary`          | neutral-800 | neutral-900   | Figma's filled controls and hover are neutral-900  |
| `--muted`, `--accent`  | neutral-800 | neutral-900   | Same                                               |
| `--border`             | white 10%   | neutral-900   | Figma uses solid neutral-900 lines                 |
| `--input`              | white 15%   | neutral-800   | Solid equivalent; inputs still fill with it at 30% |
| `--sidebar`            | neutral-900 | neutral-950   | The sidebar sits on the page colour                |
| `--sidebar-foreground` | neutral-50  | neutral-400   | Inactive navigation is quiet                       |
| `--sidebar-accent`     | neutral-800 | neutral-900   | Matches `--accent`                                 |

Unchanged from shadcn: `--background`, `--popover`, `--primary`, `--muted-foreground`, `--destructive`, `--ring`, `--sidebar-primary`.

DevBrain additions: `--foreground-strong` (titles and row names), `--subtle-foreground` (skippable metadata; 4.2:1 in dark, never for instructions or errors) and `--backdrop` (shadcn's `bg-black/50` as a variable).

### 3.2 DevBrain colours

| Group                      | Tokens                                                                         | Dark                                                     | Light                           |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------- |
| Task status (`TaskStatus`) | `--status-not-started`, `-in-progress`, `-completed`, `-overdue`, `-cancelled` | neutral-500, orange-500, green-500, red-500, neutral-500 | 700 steps, red-600              |
| Priority (`TaskPriority`)  | `--priority-high`, `-medium`, `-low`                                           | red-500, amber-500, emerald-600                          | red-600, amber-700, emerald-700 |
| Health (`ProjectHealth`)   | `--health-on-track`, `-at-risk`, `-off-track`, `-not-started`, `-completed`    | lime-500, amber-500, red-500, neutral-500, green-500     | 700 steps                       |
| Dates                      | `--date-today`, `--date-overdue`, `--now-indicator`                            | amber-500, red-500, red-600                              | amber-700, red-600              |
| Swatches                   | `--swatch-red/amber/green/blue/indigo/pink` and `--swatch-*-tile`              | Tailwind 500 steps; tiles use the 950 step               | same                            |

Each status also has its own icon shape, so colour is never the only signal. The light theme uses the 700 step because the 500s fall below 3:1 on white. The swatch check mark is `--neutral-950` (white is under 3:1 on amber and green). The one non-Tailwind colour is `--platform-linear`, Linear's brand colour.

---

## 4. Type, space and shape

**Type.** Inter for the interface (shadcn's own site uses Geist; DevBrain keeps the Inter of its designs) and Geist Mono for code. Components use shadcn's sizes; pages use shadcn's typography styles.

| Style          | Size / line | Weight               | Used for                                        |
| -------------- | ----------- | -------------------- | ----------------------------------------------- |
| `page-title`   | 30 / 36     | 600, tracking-tight  | Page and document titles (shadcn typography h2) |
| `heading-1`    | 24 / 32     | 600, tracking-tight  | Note H1, calendar day title (h3)                |
| `heading-2`    | 20 / 28     | 600, tracking-tight  | Note H2 (h4)                                    |
| `heading-3`    | 18 / 28     | 600                  | Note H3 (DevBrain addition)                     |
| `dialog-title` | 18 / 18     | 600                  | Dialog and alert dialog titles                  |
| `card-title`   | 16 / 16     | 600                  | Card and sheet titles, Home section headings    |
| `lead`         | 20 / 28     | 400                  | Subtitle under a page title, `muted-foreground` |
| `paragraph`    | 16 / 28     | 400                  | Note and description text                       |
| `body`         | 14 / 20     | 400                  | Menu items, inputs, row names, sidebar items    |
| `control`      | 14 / 20     | 500                  | Buttons, tabs, toggles, menu labels             |
| `label`        | 14 / 14     | 500                  | Form labels                                     |
| `badge`        | 12 / 16     | 500                  | Badges, sidebar group labels                    |
| `caption`      | 12 / 16     | 400                  | Dates, keys, tooltips, hints                    |
| `shortcut`     | 12 / 16     | 400, tracking-widest | Menu shortcuts                                  |
| `code`         | 14 / 20     | 600 mono             | Inline code on `muted`                          |

**Space.** Tailwind's 4px scale (`--space-*`).

**Sizes.** shadcn's heights: `--control-md` 36px (default button, input, select, tab list), `--control-sm` 32px (small button, sidebar item, calendar day), `--control-lg` 40px; DevBrain adds `--control-xs` 24px for in-row actions and `--row-height` 48px for list rows. Widths: `--sidebar-width` 16rem, `--popover-width` 18rem, `--dialog-width` 32rem, `--sheet-width` 24rem, `--toast-width` 356px.

**Radius.** shadcn's scale from one base, `--radius` (10px): `--radius-sm` 6px (menu items), `--radius-md` 8px (buttons, inputs, badges, popovers, tooltips), `--radius-lg` 10px (dialogs, tab lists), `--radius-xl` 14px (cards), plus `--radius-checkbox` 4px and `--radius-full`. Change `--radius` to make the whole system rounder (the Figma screens are closer to 12px).

**Shadows.** Tailwind v4: `--shadow-xs` controls, `--shadow-sm` cards and the active tab, `--shadow-md` menus and popovers, `--shadow-lg` dialogs, sheets and toasts.

**Motion.** shadcn's (tw-animate-css): overlays fade, zoom from 95% and slide 8px from their trigger side; dialogs 200ms, sheets 500ms in / 300ms out; colour changes 150ms. Off under `prefers-reduced-motion`.

**Icons.** Lucide (`lucide-react`) at shadcn's defaults: 16px, stroke 2; 12px inside badges and xs buttons. The Figma screens draw Bootstrap Icons; use the Lucide equivalent (house-door → `House`, check-circle → `CircleCheck`, file-earmark-text → `FileText`, lightning → `Zap`, three-dots → `Ellipsis`, arrow-return-right → `CornerDownRight`). The DevBrain logomark is [`src/renderer/assets/devbrain-logomark.svg`](../../src/renderer/assets/devbrain-logomark.svg).

---

## 5. Components

### 5.1 shadcn components to add

Install with the shadcn CLI or copy from its registry, then translate the classes as in section 2. "Addition" marks what DevBrain adds to a shadcn component.

| Component                                          | Variants and sizes used                                                                                                             | Used for                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Button                                             | `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; `default`/`sm`/`lg`/`icon`. Addition: `xs`, `icon-sm`, `icon-xs` | `outline` for "New Task", "Show in Finder", filters; `default` for dialog confirms; `link` for "View all →" |
| Button Group                                       | outline buttons joined                                                                                                              | Settings export split button, calendar ‹ Today ›                                                            |
| Badge                                              | `default`, `secondary`, `destructive`, `outline`. Addition: icon node, muted prefix, colour bar                                     | Every pill: projects, status, dates, counts                                                                 |
| Toggle, Toggle Group                               | `default`, `outline`; `default`/`sm`                                                                                                | Month/Week/Day, list/grid/board, Home quick filters                                                         |
| Tabs                                               | shadcn tabs. Addition: `line` variant                                                                                               | Settings sections; `line` for project Overview / Tasks / Notes                                              |
| Input, Textarea, Label                             | shadcn                                                                                                                              | Workspace name, link editor, descriptions                                                                   |
| Checkbox, Switch                                   | shadcn                                                                                                                              | Row selection, to-do blocks; "Create more", sync and preference toggles                                     |
| Select                                             | shadcn (`default`/`sm` trigger)                                                                                                     | Sort, settings options                                                                                      |
| Dropdown Menu, Context Menu                        | shadcn; checkbox items, submenus, shortcuts, `destructive` items                                                                    | Row "…" menus, right-click menus, "Turn into"                                                               |
| Popover                                            | shadcn                                                                                                                              | Filter builder, date picker, link editor                                                                    |
| Command                                            | shadcn (cmdk)                                                                                                                       | ⌘K search, editor slash menu, "Link to…", project picker                                                    |
| Calendar                                           | shadcn (react-day-picker)                                                                                                           | Calendar sidebar, date pickers                                                                              |
| Dialog, Alert Dialog                               | shadcn                                                                                                                              | Create task / event; destructive confirmations                                                              |
| Sheet                                              | right side                                                                                                                          | Event and task details                                                                                      |
| Sonner                                             | shadcn's toaster                                                                                                                    | Feedback with Undo                                                                                          |
| Tooltip                                            | shadcn (inverted, `primary` ground)                                                                                                 | Icon buttons, truncated names                                                                               |
| Card                                               | shadcn. Addition: `compact` size                                                                                                    | Home sections, properties panel, settings groups                                                            |
| Sidebar                                            | shadcn, with the team-switcher header block                                                                                         | App navigation, Recents, Favorites                                                                          |
| Breadcrumb                                         | shadcn. Addition: entity icon on the current page                                                                                   | Top bar                                                                                                     |
| Separator, Skeleton, Progress, Scroll Area, Avatar | shadcn                                                                                                                              | Panels, loading, imports, long lists                                                                        |
| Kbd, Field, Empty                                  | added to shadcn in late 2025; the design system follows their look but they were not checked against shadcn's source                | Shortcuts, form fields, empty states                                                                        |

### 5.2 DevBrain components

| Component                                             | Built from                                                                               | Notes                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| StatusIcon, PriorityIcon, HealthIcon                  | Lucide icons in domain colours                                                           | One shape per state; map 1:1 to `TaskStatus`, `TaskPriority`, `ProjectHealth` |
| ProgressRing                                          | SVG on an `--input` track                                                                | Subtask "3/4" in rows; project progress                                       |
| EntityPill                                            | outline Badge                                                                            | Link to a project, note, task or event; opens it                              |
| PropertyPanel                                         | Card + outline Badges opening Dropdown Menu, Popover + Calendar, Command                 | Unset properties show "+ Add …"                                               |
| TaskRow, EventRow, NoteRow, ProjectRow                | shadcn table-row pattern (border-b, hover `muted`/50, selected `muted`), Checkbox, Badge | 48px (`--row-height`), 14px names, 12px dates                                 |
| GroupHeading                                          | table-header pattern on `muted`/50                                                       | "Due now", "Due today", "Coming up"; sticky, collapsible                      |
| ScheduleCard, NoteCard, ProjectCard                   | compact Card                                                                             | Home summary                                                                  |
| SettingsGroup                                         | Card with rows of Label + description + control                                          | Settings                                                                      |
| WorkspaceTile, SwatchPicker                           | shadcn sidebar block's team logo (size-8, `rounded-lg`); radio group                     | Workspace identity                                                            |
| EventBlock, all-day row, time grid                    | FullCalendar, themed with tokens                                                         | See [the adapter spec](../calendar/fullcalendar-adapter.md)                   |
| Editor (formatting toolbar, slash menu, link popover) | Toggle Group, Command, Popover                                                           | Note editing                                                                  |
| Splash, onboarding                                    | Logomark, Card, Input, SwatchPicker, Button                                              | Welcome flow                                                                  |

---

## 6. Where each screen uses what

| Figma page          | Components                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome             | Logomark, Card, Input, SwatchPicker, WorkspaceTile, Button                                                                                                                    |
| Loading/Splash      | Logomark (pulsing)                                                                                                                                                            |
| Home (final), Inbox | Sidebar, page title + lead, Toggle Group (quick filters), GroupHeading, TaskRow, EventRow, ScheduleCard, NoteCard                                                             |
| Tasks               | Breadcrumb, toolbar (Popover filter, Select sort, Toggle Group views, Button), TaskRow, Sheet / document page with PropertyPanel, Dialog (create), Context Menu, Alert Dialog |
| Notes               | NoteRow, document page, EntityPill, Editor, Dropdown Menu                                                                                                                     |
| Project             | ProjectRow, line Tabs, HealthIcon Badge, ProgressRing, TaskRow, Context Menu with submenus                                                                                    |
| Calendar            | Button Group, Toggle Group, FullCalendar with EventBlock, Calendar, Sheet (event details)                                                                                     |
| Archive             | rows with Restore and Delete actions                                                                                                                                          |
| Settings            | Tabs, SettingsGroup, Button Group, Select, Switch                                                                                                                             |
| Editor              | Editor toolbar, Command (slash menu), Popover (links), Dropdown Menu ("Turn into")                                                                                            |

---

## 7. Where this differs from the Figma file

Building on shadcn changes some values the Figma file drew differently. Each comes from shadcn's source, and each can be tuned through a token if the design should win.

| Thing               | Figma                         | Now (shadcn)                                         | Token to change        |
| ------------------- | ----------------------------- | ---------------------------------------------------- | ---------------------- |
| Corner radius       | 12px on buttons, pills, cards | 8px buttons/badges, 14px cards                       | `--radius`             |
| Button height       | 34px, 12px semibold labels    | 36px (`sm` 32px), 14px medium labels                 | `--control-md`         |
| Main action button  | quiet bordered button         | `outline` variant (`default` is filled)              | none: pick the variant |
| Pills               | fully rounded, 24px           | Badge: `rounded-md`, 22px                            | `--radius`             |
| Row text            | 12px medium                   | 14px regular (`body`)                                | none                   |
| Sidebar width       | 288px                         | 256px (16rem)                                        | `--sidebar-width`      |
| Active sidebar item | filled with an outline        | filled, medium weight, no outline                    | none                   |
| Tooltip             | dark popover                  | inverted (`primary` ground)                          | none                   |
| Dialogs and sheets  | #111 surface                  | `background` with a border                           | none                   |
| Mini calendar today | red square                    | `accent` square; red only for the time-grid now line | none                   |
| Focus               | not designed                  | shadcn's 3px ring at 50%                             | `--ring`               |

---

## 8. Open questions

1. **Cancelled task status.** `TaskStatus.CANCELLED` exists in the data model but has no design; `--status-cancelled` and a slashed circle are placeholders.
2. **Project status vs health.** Figma's "Project Status" pill matches `ProjectHealth`. `ProjectStatus` (Not started, On hold, Active, Completed) has no design.
3. **Light theme screens** are not designed; the tokens support them.
4. **Views.** The Tasks toolbar shows list, grid and board toggles; only list is designed.
5. **Integrations and Help pages** are in the sidebar but not designed.
6. **Notes left in the Figma file:** "Should we have a default Backlog status?", "144 vs 128???", "Change padding on icons", "Empty state for no project and no note???", "Menu item: Link project, toggle linked tasks", "Unlink note".
7. **Section 7's differences.** Confirm each is wanted, or tune the token.

---

## 9. Build order

1. Load `tokens.css`, Inter and Geist Mono; base styles (body font and background, `border-color: var(--border)` on everything, shadcn's focus ring).
2. shadcn basics: Button, Badge, Separator, Label, Input, Textarea, Checkbox, Switch, Toggle, Toggle Group, Tabs, Tooltip, Skeleton.
3. Overlays: Dropdown Menu, Context Menu, Popover, Select, Command, Dialog, Alert Dialog, Sheet, Sonner.
4. Shell: Sidebar (with the workspace switcher), Breadcrumb, page title, toolbar.
5. DevBrain atoms: status, priority and health icons, ProgressRing, EntityPill.
6. Lists: TaskRow, GroupHeading, EventRow, NoteRow, ProjectRow with keyboard navigation.
7. Documents: PropertyPanel, Calendar and date picker, Card; Home cards.
8. FullCalendar theming, the editor, onboarding and splash.
