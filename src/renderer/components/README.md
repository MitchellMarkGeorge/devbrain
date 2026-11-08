# Renderer components

The DevBrain design system built as React components. **This code, its stories, the tokens in
`docs/design-system/tokens.json` and the guides in `docs/design-system/` are the single source of
truth**: a design change lands in the component, its stories and its guide together, and the Figma
file and the Claude design-system page follow it (see `CLAUDE.md`).

Components are grouped in folders by what they know about. Each group is a Storybook section of
the same name, and builds only on the groups listed before it:

1. **`layout/`**: utility components for layout and type. Imports only `lib/`.
2. **`ui/`**: the generic design system, built on [Base UI](https://base-ui.com)
   (`@base-ui/react`) where the component's guide names a Base UI part. Knows nothing about tasks,
   projects or notes. Imports only `layout/`, `lib/` and `types.ts` (one exception: `Toast` draws
   success with the completed `StatusIcon`).
3. **`entities/`**: how DevBrain's things look wherever they appear: the status, priority and
   health glyphs, their pickers, entity pills, providers and workspace tiles. Imports only the
   groups above.
4. **Feature groups** (`shell/`, `lists/`, `board/`, `detail/`, `editor/`, `calendar/`, `home/`,
   `projects/`, `notes/`, `integrations/`, `settings/`, `onboarding/`): the pieces of one area of
   the app. They use everything above, and another feature group's component when they compose it
   (`ProjectHeader` shows the `detail/` `DateRange`).

ESLint enforces steps 2 and 3 (`eslint.config.js`); stories may import anything.

| Folder          | Storybook    | Components                                                                                                                                                                                        |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/`       | Layout       | Text, Heading, Flex, Stack, Grid, Box, VisuallyHidden                                                                                                                                             |
| `ui/`           | UI           | Button, IconButton, ButtonGroup, Input, Textarea, Field, Checkbox, Switch, ToggleGroup, Tabs, Select, SwatchPicker                                                                                |
|                 |              | DropdownMenu, ContextMenu, Command, Calendar, DatePicker, DateRangePicker                                                                                                                         |
|                 |              | Tooltip, Popover, Dialog, ConfirmDialog, Sheet, Toast                                                                                                                                             |
|                 |              | Card, Badge, Kbd, Separator, Skeleton (and the card skeletons), Progress, ProgressRing, Breadcrumb, EmptyState, ScrollArea, Icon, ColourBar, SwatchDot, Logomark                                  |
| `entities/`     | Entities     | StatusIcon, PriorityIcon, HealthIcon, ProjectStatusIcon, StatusMenu, PriorityMenu, ProjectPicker, EntityPill, EntityHoverCard, SourcePill, SyncedBadge, ProviderLogo, ProviderTile, WorkspaceTile |
| `shell/`        | Shell        | AppShell, WorkspaceShell, WindowBar, Sidebar, WorkspaceSwitcher, SyncStatus, PageHeader, DocumentPage, CardGrid                                                                                   |
| `lists/`        | Lists        | ListRow, TaskRow, TaskList, NoteRow, ProjectRow, TrashRow, EventRow, LinkedTaskRow, QuickAddRow, DraftTaskRow, TaskRowSkeleton, GroupHeading, SelectionBar                                        |
| `board/`        | Board        | BoardCard, BoardColumn                                                                                                                                                                            |
| `detail/`       | Detail       | PropertyRow, DetailRow, DetailSection, DateRange, TaskNoteCard, AddSlot, CreateDialog                                                                                                             |
| `editor/`       | Editor       | EditorContent, FormatToolbar, LinkToolbar, TurnIntoMenu, ColourMenu, SlashMenu, MentionMenu, Callout, CodeBlock                                                                                   |
| `calendar/`     | Calendar     | TimeGrid, MonthGrid, EventBlock, CalendarAgenda                                                                                                                                                   |
| `home/`         | Home         | CaptureBox, HomeRow, HomeSection (and HomeCards), SetupRow                                                                                                                                        |
| `projects/`     | Projects     | ProjectCard, ProjectHeader                                                                                                                                                                        |
| `notes/`        | Notes        | NoteCard                                                                                                                                                                                          |
| `integrations/` | Integrations | IntegrationCard, AccountStatus, SourceRow                                                                                                                                                         |
| `settings/`     | Settings     | SettingsGroup                                                                                                                                                                                     |
| `onboarding/`   | Onboarding   | WorkspaceListItem                                                                                                                                                                                 |

Also here:

- `types.ts`: what the components add to core's enums (`TaskStatus`, `TaskPriority`,
  `ProjectStatus`, `ProjectHealth`, imported from `@common/types`): their labels and colour tokens,
  `isOverdue`/`dueTone`, `resolveColor` (swatch names and `#rrggbb` checked with `hexColorSchema`)
  and `cssColor`, plus the components' own `Swatch`, `Provider` and `CalendarEvent`.
- `event-text.ts` and `project-text.ts`: how events and projects are worded (an event's time and
  repeat rule, how soon it starts; "Done Jun 12").
- `lib/`: helpers (`cn`, `mergeClassName`), the window frame (`platform.ts`:
  `WindowFrameProvider`, `usePlatform`, `formatKeys`), and dates (`format.tsx`: `FormatProvider`
  and `useFormat()`, on luxon and `Intl.RelativeTimeFormat`). `story-dates.ts` is the stories' fixed `now` (22 Jun 2026, 9:48 AM).

**Entity components take core's own shapes.** `TaskRow`, `BoardCard`, `NoteRow`, `NoteCard`,
`ProjectRow`, `ProjectCard`, `EventRow` and the rest take the row core returns (a
`TaskListItem`, a `Project`, an `Event`) as a `Pick` of its shared type, with no mapping step in
the page, and derive what they draw (overdue, "Today", 10:30 AM, colours) through `useFormat()`.
Their stories' fixtures are core-shaped rows with real `Date`s around the story's `now`
(`lists/TaskRow/fixtures.ts`, `notes/NoteCard/fixtures.ts`, `projects/ProjectCard/fixtures.ts`).

- `screens/`: the `Screens/*` stories, which rebuild the designed screens of the Figma file from
  these components (Tasks, Task detail, Notes, Projects, Calendar, Home, Settings, Search, menus,
  pickers, sheets, the editor, create dialogs, onboarding and app-wide states) as a check that they
  are enough to build them. Their shared frames and sample data live beside them.

The editor components are the chrome and block styles of `RichTextEditor`, which lives in
`src/renderer/editor`. Not built yet: the pickers behind the SelectionBar's buttons.

Run `npm run storybook` to browse every component (`npm run build-storybook` builds it into
`dist/storybook`). The **Theme** menu in the toolbar switches stories between System, Dark and
Light.

### Where a new component goes

Put it in the lowest group it fits: in `ui/` if it would make sense in any app, in `entities/` if it
draws one of DevBrain's things the same way wherever it appears, and otherwise in the feature
group of the area that uses it. When a second area starts to use a feature component, it can stay
where it is; move it down to `entities/` or `ui/` once it no longer depends on its area. Then:

- add the folder to its group's `index.ts` (kept sorted); `components/index.ts` exports every group;
- give its story the group's Storybook section (`title: 'Lists/TaskRow'`);
- add its guide, `docs/design-system/components/<Name>.md` (not for `layout/`).

A helper shared by several components of one group sits at the group's root (as
`calendar/calendar-events.ts` does for TimeGrid and MonthGrid).

## A component's folder

```
ui/Button/
  Button.tsx          the component
  Button.module.css   its styles (CSS Modules, values from tokens.css)
  Button.stories.tsx  its Storybook stories
  index.ts            its public exports
```

Components import each other from the folder (`import { Button } from '../../ui/Button'`); code
outside `components/` imports from the barrel (`import { Button } from '../components'`).

## Rules

- **Styles are CSS Modules on the tokens.** Every value comes from `src/renderer/styles/tokens.css`
  (`var(--control-md)`, `var(--radius-lg)`, `var(--border)`); no raw colours. No Tailwind.
  shadcn's `bg-primary/90` is `color-mix(in oklab, var(--primary) 90%, transparent)`.
- **Variants use `cva`** (class-variance-authority), mapping each variant to a CSS Module class:
  `cva(styles.button, { variants: { size: { sm: styles.sizeSm } } })`. Export the `*Variants`
  function so other components can reuse the look. Class names join with `cn` (clsx).
- **State comes from Base UI's data attributes** (`[data-checked]`, `[data-highlighted]`,
  `[data-open]`, `[data-starting-style]`), not from extra classes or props.
- **`render` replaces shadcn's `asChild`.** Base UI parts take `render`; DevBrain's own components
  that render one element use `useRender` and `mergeProps` from Base UI to accept it too.
- **`className` on a Base UI part may be a function of its state:** join it with `mergeClassName`.
- **Icons are Lucide** at stroke 1.75 via `Icon` (`<Icon icon={Folder} size={12} />`). Components
  that take an icon accept an `IconSource`: a Lucide icon (`icon={Folder}`) or a node, drawn with
  `renderIcon(icon, size)`.
- **Focus** is shadcn's ring: `border-color: var(--ring)` and
  `box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)` on `:focus-visible`.
- **Theme.** Colours come from tokens, which switch with the theme on their own. A rule that must
  differ by theme (rare) is written twice, so it follows both the system setting and a pinned
  `data-theme` (what Storybook's toggle sets):
  `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) .x { … } }` and
  `:root[data-theme='light'] .x { … }`.
- **Motion** honours `prefers-reduced-motion` (tokens.css zeroes the durations).

Every component outside `layout/` has its guide at `docs/design-system/components/<Name>.md`; keep
it describing what the component does. The `layout/` utilities have no guides: they draw nothing of
their own, only map their props onto the tokens (the type scale, the spacing scale, the colours)
that `docs/design-system/README.md` describes, so their props' doc comments and stories are their
reference. `docs/design-system/reference/` is superseded and out of date: don't build from it.
