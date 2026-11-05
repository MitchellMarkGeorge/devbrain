# Renderer components

The DevBrain design system built as React components. **This code, its stories, the tokens in
`docs/design-system/tokens.json` and the guides in `docs/design-system/` are the single source of
truth**: a design change lands in the component, its stories and its guide together, and the Figma
file and the Claude design-system page follow it (see `CLAUDE.md`).

- `ui/`: the design system's components, one folder each (`ui/Button/`), built on
  [Base UI](https://base-ui.com) (`@base-ui/react`) where the component's guide names a Base UI part.
- `layout/`: utility components for layout and type: `Text`, `Heading`, `Flex`/`Stack`, `Grid`,
  `Box`, `VisuallyHidden`.
- `lib/`: helpers (`cn`, `mergeClassName`).

Run `npm run storybook` to browse every component (`npm run build-storybook` builds it into
`dist/storybook`). The **Theme** menu in the toolbar switches stories between System, Dark and
Light. Everything is exported from `components/index.ts`; `ui/types.ts` holds the shared
domain types (`TaskStatus`, `Priority`, `Swatch`, …) and their colour helpers.

| Group                                 | Components                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout and type                       | Text, Heading, Flex, Stack, Grid, Box, VisuallyHidden                                                                                                                                       |
| Controls                              | Button, IconButton, ButtonGroup, Input, Textarea, Field, Checkbox, Switch, ToggleGroup, Tabs, SwatchPicker, Select                                                                          |
| Menus and pickers                     | DropdownMenu, ContextMenu, StatusMenu, PriorityMenu, ProjectPicker, Command, DatePicker, DateRangePicker, Calendar, DateRange                                                               |
| Overlays                              | Tooltip, Popover, Dialog, AlertDialog, ConfirmDialog, Sheet, Toast, EntityHoverCard                                                                                                         |
| Display                               | Card, Badge, NewBadge, Kbd, Separator, Skeleton, Progress, Breadcrumb, Logomark, WorkspaceTile, EmptyState, SectionHeading, SyncStatus, ScrollThumb                                         |
| Glyphs and pills                      | Icon, StatusIcon, PriorityIcon, HealthIcon, ProjectStatusIcon, ProgressRing, ColourBar, SwatchDot, ProviderLogo, ProviderTile, EntityPill, SourcePill, SyncedBadge                          |
| App shell                             | AppShell, WindowBar, Sidebar, PageHeader, DocumentPage, CardGrid                                                                                                                            |
| Lists and board                       | ListRow, TaskRow, TaskList, NoteRow, ProjectRow, TrashRow, EventRow, LinkedTaskRow, QuickAddRow, DraftTaskRow, TaskRowSkeleton, GroupHeading, SelectionBar, BoardCard, BoardColumn, AddSlot |
| Detail pages                          | PropertyRow, DetailRow, DetailSection, TaskNoteCard, CreateDialog                                                                                                                           |
| Editor chrome                         | EditorContent, FormatToolbar, LinkToolbar, TurnIntoMenu, ColourMenu, SlashMenu, MentionMenu                                                                                                 |
| Calendar                              | TimeGrid, MonthGrid, EventBlock, CalendarAgenda, ScheduleCard                                                                                                                               |
| Home and first run                    | QuickCapture, QuickAddInput, UpNextStrip, HomeAgenda, HomeNotice, SetupProgress, SetupPrompt, StepCard, TipCard, SetupBanner, QuickStartCard                                                |
| Projects and notes                    | ProjectCard, ProjectHeader, NoteCard                                                                                                                                                        |
| Settings, workspaces and integrations | SettingsGroup, WorkspaceListItem, WorkspaceSwitcher, OnboardingScreen, IntegrationCard, AccountStatus, SourceRow                                                                            |

`Screens/*` stories rebuild the designed screens of the Figma file from these components (Tasks,
Task detail, Notes, Projects, Calendar, Home, Settings, Search, menus, pickers, sheets, the
editor, create dialogs, onboarding and app-wide states), as a check that they are enough to build
them. Their shared frames and sample data live in `screens/*/` beside them.

Not built yet: the pickers behind the SelectionBar's buttons, and the rich-text editor itself (the
editor components are its chrome and block styles, for whichever editor library the app adopts).

## A component's folder

```
ui/Button/
  Button.tsx          the component
  Button.module.css   its styles (CSS Modules, values from tokens.css)
  Button.stories.tsx  its Storybook stories
  index.ts            its public exports
```

Import from the folder (`import { Button } from '@/components/ui/Button'`, relative in practice) or
from the barrel (`components/ui/index.ts`).

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

Each component in `ui/` has its guide at `docs/design-system/components/<Name>.md`; keep it
describing what the component does. The `layout/` utilities have no guides: they draw nothing of
their own, only map their props onto the tokens (the type scale, the spacing scale, the colours)
that `docs/design-system/README.md` describes, so their props' doc comments and stories are their
reference. `docs/design-system/reference/` is superseded and out of date: don't build from it.
