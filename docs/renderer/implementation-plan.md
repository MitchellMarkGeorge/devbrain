# Renderer: implementation plan

The design system (`src/renderer/components`, with every designed screen rebuilt in Storybook under
`Screens/*`) and the main process (core services, the typed IPC router, change propagation) are
done. This plan turns the renderer from the test bench in `src/renderer/App.tsx` into the app:
routing with TanStack Router, a page per route wired to the IPC router, and the flows between them.
It also lists what main has to add or change for those pages (§ Main-process changes).

Sources: the Figma file (`w9WtYAUXkkzqKIMAzFo08I`, page "v2 Screens", node ids cited as `7158:6266`),
the `Screens/*` stories, `docs/design-system/README.md`, `docs/ipc/design.md` and
`docs/follow-ups.md`. Where Figma and the code disagree, the code wins (see `CLAUDE.md`).

> **Status:** plan only; nothing here is built yet. Revised after review (Nov 6 2026): FullCalendar
> for the calendar, `/app/trash`, a create-workspace dialog inside the app, no Help link yet, and a
> keyboard layer built for the coming Vim mode.

### How this plan was made

The plan came out of one exploration session
([session link](https://claude.ai/code/cshk_01P34MGc8FA2hC6HZwUZeYmjY3M4bEESad8nCgnjXMDDFx)), which
surveyed three things in parallel and checked the claims the plan rests on against the code:

- **The renderer**: every component and its props, the `Screens/*` stories and which frames they
  use, `src/renderer/ipc`, the editor, and the tests. Finding: no router, and components take
  display props, not core rows.
- **Main and IPC**: every procedure in `src/main/ipc/routers`, the core services behind them, the
  workspace lifecycle, settings, and the open items in `docs/follow-ups.md`. Finding: no route reads
  a note's content (`NoteService.readContent` is unexposed), `state.lastPage` is never used, and
  `tasks.create` requires a due date.
- **Figma** (read only): every frame on "v2 Screens", with node ids, and the flows they imply (which
  details are pages, sheets or dialogs; the shortcuts sheet; the Vim mock).

## Contents

1. [Decisions](#decisions)
2. [Where things stand](#where-things-stand)
3. [Route tree](#route-tree)
4. [Router setup](#router-setup)
5. [Search params](#search-params)
6. [Data: queries, lists, components](#data-queries-lists-components)
7. [App-wide pieces](#app-wide-pieces)
8. [Pages and flows](#pages-and-flows)
9. [Main-process changes](#main-process-changes)
10. [Milestones and PR breakdown](#milestones-and-pr-breakdown)
11. [Testing](#testing)
12. [Open questions](#open-questions)
13. [Out of scope](#out-of-scope)

## Decisions

| Area                               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router                             | `@tanstack/react-router` with file-based routes (`@tanstack/router-plugin/vite`) in `src/renderer/routes`, generating `src/renderer/routeTree.gen.ts`, which is checked in, formatted and linted as generated. No automatic code splitting: the bundle loads from disk, so splitting only adds work.                                                                                                                                                                                                                                                                                                                                                                                              |
| History                            | **Hash history** (`createHashHistory`). The production page loads from `file://`, where browser history paths don't resolve on reload; the hash keeps the location across a reload (⌘R, a crash restore) and in devtools. Memory history would lose it.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Paths                              | Snake case, as the project uses elsewhere, with the spelling fixed: `/onboarding`, `/onboarding/new_workspace`, `/onboarding/choose_workspace`, `/app/...`. Path params use the entity's prefixed id (`tsk_…`, `prj_…`, `nte_…`), validated with the same prefixes `zId` checks.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Param values                       | Snake case too (`data_storage`, `not_started`, `in_progress`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Search params                      | Validated per route with Zod v4 (already a dependency; TanStack Router accepts Standard Schema), each field `.optional().catch(undefined)`. Without the `catch`, one bad value (a link saved before a param's values changed, a typo, a removed option) makes `validateSearch` throw, and the whole page renders the error screen. With it, that one field falls back to its default and the rest of the URL still applies. The fallback is `undefined` rather than a literal default because a missing param means "the setting's default" (e.g. `tasks.defaultView`), read at render: so a default is never written into the URL, and changing the setting changes every URL without the param. |
| Data                               | React Query stays the cache, through `trpc.*.queryOptions()` as today. Route loaders only _prime_ that cache (`queryClient.ensureQueryData`), so a page renders with its data on the first frame and a missing entity becomes the route's not-found. The router keeps no cache of its own (`defaultPreloadStaleTime: 0`). Freshness stays with the query invalidator: nothing in a route invalidates by hand.                                                                                                                                                                                                                                                                                     |
| Router context                     | `{ queryClient, trpc, ipc }`, typed with `createRootRouteWithContext`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Entity components                  | The entity and list components take **core's own shapes**: a `TaskListItem` goes straight into `TaskRow`, with no mapping step. Each component's props are a `Pick` of the shared type it draws (`Pick<TaskListItem, 'title'                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 'status' | …>`), and it derives and formats what it draws (overdue, "Today", 10:30 AM) from a `FormatProvider`that supplies`now`and the time format. Needs the shared types and enums moved to`src/common` (X1). See [Entity components take core's shapes](#entity-components-take-cores-shapes). |
| Dates                              | **luxon**, already a dependency and what core uses: relative and calendar dates, locale formats, 12/24 hour. No hand-written date formatting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Virtualization                     | Every list and grid that can grow is virtualized with **`@tanstack/react-virtual`**: tasks (list, group, board columns), notes, projects, trash, search results. See [Virtualized lists](#virtualized-lists).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Detail presentation                | As designed: tasks, projects and notes are pages; a task opened from the board and an event opened from the calendar show in the docked `Sheet` over their list, addressed by an `open` search param so Back closes them. The task note opens as a dialog (local state).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Splash                             | `/` is the boot route and draws the splash while the last workspace reopens, then redirects. A workspace _switch_ draws the same splash as an overlay from the root route, driven by `workspace.changed` (as `App.tsx` does today), and does not navigate to `/`: a switch can start from the menu or another window, and the URL should land on the new workspace's landing page, not on `/`.                                                                                                                                                                                                                                                                                                    |
| Not in the route list but designed | `/app/integrations` (in the sidebar nav, Figma `7164:13117`). ⌘K is a dialog, not a route. Help has nothing behind it yet: the sidebar's Help item and Welcome's "What's a workspace?" link are drawn disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Trash                              | The route is **`/app/trash`**, matching the UI and `docs/deleting.md`. Core still says archive (`archive` router, `listArchived`); the code rename is its own follow-up (E2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| New workspace                      | Inside the app, "New workspace…" opens a **Create workspace dialog** over the page. `/onboarding/new_workspace` is only for when nothing is open. Both use one `CreateWorkspaceForm`, so the onboarding guard needs no exception. Mocked in Figma as "New workspace (dialog in the app)" (`7760:61527`). Why a dialog: see [Onboarding](#onboarding-onboarding).                                                                                                                                                                                                                                                                                                                                  |
| Calendar rendering                 | **FullCalendar** (`@fullcalendar/react` with the `timegrid`, `daygrid`, `interaction`, `rrule` and `luxon3` plugins), mapped per `docs/calendar/fullcalendar-adapter.md`. `TimeGrid` and `MonthGrid` are the visual spec: FullCalendar is themed to match them with tokens and draws `EventBlock`/`AllDayEvent` through its content hooks. See [Calendar](#calendar-appcalendar).                                                                                                                                                                                                                                                                                                                 |
| Keyboard                           | One command registry and a keymap dispatcher of our own, with modes and key sequences from the start, so Vim mode is a second keymap rather than a rewrite. See [Keyboard](#keyboard-commands-keymaps-and-vim-mode).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Where things stand

**Already built, and reused as is:**

- `src/renderer/ipc`: `trpc`, `ipc`, `queryClient`, `events`, `queryInvalidator` (with
  `ENTITIES_READ_BY_ROUTE`), the initial load context and `seedQueryCache`.
- `src/renderer/theme.tsx` (`FollowThemeSetting`) and `workspace-opening.ts` (`useOpeningWorkspace`,
  `useHeldFor`).
- `main.tsx` bootstrap (error catching, invalidator, seeding, theme, `WindowFrameProvider`).
- Every component, including `AppShell` (its `onBack`/`onForward`/`canGoBack`/`canGoForward`
  props are ready for the router's history) and `SidebarItem` (takes `render={<Link …/>}`).
- `RichTextEditor` with `useWorkspaceEditorHost` (search and `openUrl`), waiting for an
  `onOpenEntity` and a `resolveEntity`.

**Reused, but rebuilt into routes:** `App.tsx`'s splash logic and `WorkspaceMenu`, and the
compositions in `components/screens/*` (not their frames: the Calendar, Tasks and TaskDetail screens
use older hand-made frames; the Shell screens' `ScreenFrame` + `DemoSidebar` is the canonical one).

**Missing:**

- Any router; `@tanstack/react-router` is not installed.
- `ToastProvider` is not mounted, so `toast()` does nothing yet.
- Mappers from core types to component props.
- A route that reads a note's markdown (see Main-process changes, M1). This blocks the note page.

## Route tree

```
__root                      providers, splash overlay, global dialogs host, not-found/error
├── /                       index: boot + splash → redirect
├── /onboarding             layout: OnboardingScreen frame (no sidebar)
│   ├── /                   Welcome
│   ├── /new_workspace      Create workspace
│   └── /choose_workspace   Choose from existing workspaces
└── /app                    layout: AppShell + sidebar + <Outlet/>; guards "a workspace is open"
    ├── /                   index: redirect to the landing page
    ├── /home
    ├── /tasks              ?view=list|group|board, filters, sort, ?open=tsk_…
    │   └── /$taskId
    ├── /projects           ?view=list|card, filters, sort
    │   └── /$projectId     ?tab=overview|tasks|notes
    ├── /notes              ?view=list|card, filters, sort
    │   └── /$noteId
    ├── /calendar           ?view=week|month|day, ?date=YYYY-MM-DD, ?open=evt_…|tsk_…
    ├── /trash              ?tab=all|projects|tasks|notes
    ├── /integrations       (added: designed and in the sidebar)
    └── /settings           ?tab=general|calendar|tasks|data_storage
```

Files (`src/renderer/routes`, TanStack's flat dot notation, so a list and its detail are siblings
and the detail does not render inside the list's component):

```
__root.tsx
index.tsx
onboarding.tsx                    layout
onboarding.index.tsx
onboarding.new_workspace.tsx
onboarding.choose_workspace.tsx
app.tsx                           layout
app.index.tsx
app.home.tsx
app.tasks.index.tsx
app.tasks.$taskId.tsx
app.projects.index.tsx
app.projects.$projectId.tsx
app.notes.index.tsx
app.notes.$noteId.tsx
app.calendar.tsx
app.trash.tsx
app.integrations.tsx
app.settings.tsx
```

Route files stay thin: `validateSearch`, `loader`, `beforeLoad`, and a component that composes a
page from `src/renderer/pages/<feature>/`. Page pieces that are not routes (toolbars, the task
sheet, the event sheet, dialogs) live under `src/renderer/pages/<feature>/` too, so the route
generator never sees them. `src/renderer/components/` stays the design system: presentational, no
IPC, no router (its ESLint layering already enforces no `@main`/`@common` imports there).

## Router setup

### Install and build

- Add `@tanstack/react-router` and, as dev dependencies, `@tanstack/router-plugin` and
  `@tanstack/react-router-devtools` (devtools only in development builds).
- `vite/renderer.config.ts`: add `tanstackRouter({ target: 'react', routesDirectory:
'src/renderer/routes', generatedRouteTree: 'src/renderer/routeTree.gen.ts', autoCodeSplitting:
false })` **before** the React plugin. Check that the plugin runs on Vite 8 when installing; if it
  doesn't yet, fall back to code-based routes (the same tree in `src/renderer/router.tsx`) and keep
  everything else in this plan.
- Storybook: the components never import the router, so Storybook needs no change. Page stories,
  if added later, wrap in a memory-history router.
- ESLint/Prettier: ignore `routeTree.gen.ts`; keep the rule that the renderer imports `@main` as
  types only.

### `src/renderer/router.tsx`

```ts
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient, trpc, ipc },
  defaultPreload: 'intent', // hover a row: its page's loader primes the cache
  defaultPreloadStaleTime: 0, // React Query decides freshness
  defaultPendingMs: 150, // pending UI only when IPC is slow (a provider fetch)
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
  scrollRestoration: true,
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

`main.tsx` renders `<RouterProvider router={router} />` in place of `<App />`, inside the existing
providers. `App.tsx` and its test pages are deleted once `/app` renders the shell (milestone 2).

### Root route (`__root.tsx`)

Renders, around `<Outlet/>`:

- `ToastProvider` (not mounted anywhere today).
- The **workspace-switch splash overlay**: `useHeldFor(useOpeningWorkspace() !== null, 600)` draws
  `<OnboardingScreen logo={<Logomark size="lg" pulse/>}/>` over everything. When the open
  completes, `workspace.changed` (`{ id: new, opening: null }`) triggers a navigation to the new
  workspace's landing page (see below); `openFailed` (`{ id: null, opening: null }`) navigates to
  `/onboarding` with an error toast.
- `devbrain_unavailable`: when the initial load context says `devBrainAvailable: false`, the root
  renders a full-window error ("DevBrain couldn't open its data folder", with Show Log File) and no
  outlet.

### Boot: `/` (splash)

`/` is where the app starts (an empty hash). Its component draws the splash and runs boot once:

1. If `workspaces.current` (seeded) is set, a reload: redirect at once to the current URL's
   intended page. A reload keeps its hash, so `/` is only reached on a cold start.
2. Otherwise call `workspaces.openLast`. The splash says "Opening ‹last.name›…" from the initial
   load context's `last`, and is held 600ms as today.
3. On success, redirect to the **landing page**; on `null` (nothing to reopen) or failure, redirect
   to `/onboarding` (choose workspace if the list is not empty, else Welcome).

The **landing page** is one function, `landingPage(settings, state)`: `state.lastPage` when
`general.openToLastPage` is on and it parses as an `/app/*` location, else
`/app/${general.defaultLandingPage}`. `lastPage` needs a route (Main-process changes, S2).

### Guards

- `/app` `beforeLoad`: if `queryClient.getQueryData(workspaces.current)` is null, `throw
redirect({ to: '/onboarding' })`. The seeded cache makes this synchronous.
- `/onboarding` `beforeLoad`: if a workspace is open, redirect to `/app`, with no exceptions. The
  sidebar's "New workspace…" opens the Create workspace dialog instead of navigating here.
- A `no_workspace_open` error from any call (a workspace closed under the page) redirects to
  `/onboarding` from a `QueryCache`/`MutationCache` `onError` set on `queryClient`.

### Remembering the page

For "Reopen last page", the renderer tells main where it is, since main can't read the page's
location. `/app` subscribes to `router.subscribe('onResolved')` and saves the location's `href`
(the path plus search params, e.g. `/app/tasks?view=board`) with `settings.setLastPage` (S2).

The save is **debounced**: it waits until navigation has been still for 1s and saves only the last
location. Many navigations are not page changes: each filter choice, each ‹ › in the calendar and
each sheet opening rewrites the URL. Saving every one would write the settings file each time.
Saving when the window closes isn't reliable, because the IPC call may not finish before the page
goes away. Losing the last second of navigation is harmless.

Detail pages for a deleted entity resolve to not-found, and a not-found location is not saved.

### Back and forward

`AppShell` gets `onBack={() => router.history.back()}`, `onForward`, and `canGoBack` from
`useCanGoBack()`; `canGoForward` needs a small hook over `router.history` (index vs length, both
on `history.location.state.__TSR_index`). Search-param changes that only reflect UI state (a
toolbar value, the calendar's date) navigate with `replace: true`, so Back goes to the previous
_page_, not the previous filter; opening a sheet (`open=…`) pushes, so Back closes it.

## Search params

Schemas live beside each route's page in `src/renderer/pages/<feature>/search.ts`, so a `<Link>`
elsewhere imports the type. Every field is `.optional().catch(undefined)`: a bad value drops that
field back to its default instead of failing the page (see Decisions).

```ts
export const tasksSearch = z.object({
  view: z.enum(['list', 'group', 'board']).optional().catch(undefined),
  sort: z
    .enum(['priority', 'dueDate', 'status', 'createdAt', 'updatedAt'])
    .optional()
    .catch(undefined),
  project: z
    .union([zPrefixedId('prj'), z.literal('none')])
    .optional()
    .catch(undefined),
  // …
});
// at render: const view = search.view ?? settings.tasks.defaultView;
```

### `/app/tasks`

| Param      | Values                                                                                    | Notes                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `view`     | `list` (default) \| `group` \| `board`                                                    | default from `settings.tasks.defaultView`                                                           |
| `groupBy`  | `project` (default) \| `status` \| `priority` \| `due`                                    | `group` view only ("Group by: Project", `7158:9538`)                                                |
| `sort`     | `priority` \| `dueDate` \| `status` \| `createdAt` \| `updatedAt`                         | default `settings.tasks.defaultSort`                                                                |
| `dir`      | `asc` \| `desc`                                                                           |                                                                                                     |
| `status`   | `open` (default) \| `all` \| `not_started` \| `in_progress` \| `completed` \| `cancelled` | "Filter: Open" → `excludeClosed`; `showCompletedTasks` decides the default between `open` and `all` |
| `priority` | `low` \| `medium` \| `high`                                                               | single value, as core filters                                                                       |
| `project`  | `prj_…` \| `none`                                                                         | "Filter by project" menu (`7175:25639`)                                                             |
| `due`      | `overdue` \| `today` \| `week` \| `none`                                                  | mapped to `dueBefore`/`dueOn`/`dueAfter` at the call                                                |
| `source`   | `local` \| `external`                                                                     | core's `origin`                                                                                     |
| `open`     | `tsk_…`                                                                                   | the task sheet over the board (`7175:31599`)                                                        |

Core filters `status` and `priority` by one value each. Multi-select filters are a main change
(T3); the params are written as single values now and can become arrays later without breaking
URLs (`z.union([value, z.array(value)])`).

### `/app/projects`

`view` (`list` | `card`), `status` (`active` default \| `all` \| `not_started` \| `on_hold` \|
`completed`), `sort` (`dueDate` default \| `createdAt` \| `updatedAt` \| `status`), `dir`, `source`.

### `/app/projects/$projectId`

`tab` (`overview` default \| `tasks` \| `notes`). Figma `7159:12540`, `7159:13218`, `7159:13886`.

### `/app/notes`

`view` (`list` default \| `card`), `sort` (`updatedAt` default, "Last edited" \| `createdAt` \|
`title`), `dir`, `project` (`prj_…` \| `none`), `link` (`event` \| `task` \| `none`).

### `/app/calendar`

| Param        | Values                               | Notes                                                                                                                                                                                            |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `view`       | `week` (default) \| `month` \| `day` | default from `settings.calendar.defaultView`                                                                                                                                                     |
| `date`       | `YYYY-MM-DD`                         | the anchor day, default today. The visible range is derived from `view` + `date` + `firstDayOfWeek`, so month, year and week all come from one param and can never disagree. "Today" removes it. |
| `open`       | `evt_…` \| `tsk_…`                   | the item in the sheet. Ids are prefixed, so one param covers both the events and the tasks due that the agenda shows; the sheet picks its body from the prefix.                                  |
| `occurrence` | ISO datetime                         | with `open=evt_…` of a series: which occurrence was clicked (its `originalStartAt`), needed to edit "this event" vs "all events" (`7424:43188`)                                                  |

**Calendar filters are not search params.** "Filter: All calendars" (`7424:42573`) toggles which
calendars show, and core already persists that per calendar (`calendars.setVisible`) and applies
it in `events.listForCalendar`. Storing it in the URL as well would give two sources of truth.

### `/app/trash`

`tab` (`all` default \| `projects` \| `tasks` \| `notes`), `sort` (`trashed` default; only one
sort exists in core, newest first).

### `/app/settings`

`tab` (`general` default \| `calendar` \| `tasks` \| `data_storage`). Figma orders the tabs
General / Tasks / Calendar / Data & storage.

## Data: queries, lists, components

### Queries

- Read with `useSuspenseQuery(trpc.x.y.queryOptions(input))` in pages whose loader primed the
  query, and `useQuery` for secondary data (counts, pills' hover cards), so a slow secondary read
  never blocks the page.

### How the infinite lists work

Core's list routes are paged with a cursor (keyset pagination, `core/shared/pagination.ts`):

```ts
tasks.list({ filter: { excludeClosed: true }, sort: { sortBy: 'priority' }, limit: 100, cursor: null })
// → { items: [100 tasks], nextCursor: 'b64…' }
tasks.list({ …same, cursor: 'b64…' })
// → { items: [the next 100], nextCursor: null }   (null: that was the last page)
```

The cursor says "after this row in this sort order", so a page never skips or repeats a row when
rows are added before it, as an offset would.

`useInfiniteQuery(trpc.tasks.list.infiniteQueryOptions(input, { getNextPageParam: (p) =>
p.nextCursor }))` keeps every loaded page in **one** cache entry (`data.pages`), keyed by the
input without the cursor. `fetchNextPage()` asks for the next page with the last `nextCursor`, and
`hasNextPage` turns false when it is `null`. The list scrolls through `data.pages.flatMap((p) =>
p.items)`. It asks for the next page when the virtualizer reaches the last 20 loaded rows (see
below), so a list only loads what has been scrolled near.

**When something changes**, the invalidator marks the entry stale and React Query refetches it by
re-requesting the loaded pages in order, starting again from the first cursor. That keeps pages
consistent with each other, but a list scrolled through five pages refetches five pages (five
IPC calls of 100 rows: a few milliseconds each on SQLite). `maxPages: 10` caps that; scrolling back
up past the cap reloads the earlier pages.

**The board** is three of these, one per column, each with its own input (`filter: { status: 1 }`,
`{ status: 2 }`, `{ status: 3 }`). They're three cache entries, each loading its first page when
the board opens and more as that column scrolls. A task moved from In progress to Completed is
reported as a `task` change, so both columns refetch.

**The group view** works the same way, one infinite query per group:

- **Group by status or priority**: a fixed set of groups (three statuses; three priorities), each
  filtered by that value.
- **Group by project**: the groups come from `projects.list` (itself an infinite query), plus "No
  project" (`projectId: null`). A group's task query only **mounts while the group is on screen and
  expanded**, because the group view is virtualized. So a workspace with 40 projects runs the
  queries for the five groups in view, not 40. The heading's done/total comes from `projects.stats`
  (one per visible group, or from the list once P1 lands), not from loading the whole group.
- **Group by due date**: fixed buckets (Overdue, Today, This week, Later, No date), each a
  `dueBefore`/`dueOn`/`dueAfter` filter.

A group shows the rows it has loaded, then a "Show more" row while `hasNextPage`. T1 would replace
the per-group queries with one call; it's only worth it if this proves slow.

### Virtualized lists

Every list or grid that can grow renders only the rows in view (plus an overscan of about 10),
with `@tanstack/react-virtual`. A workspace with 5,000 tasks then draws about 30 rows.

- **Where:** `TaskList` (the tasks list, group view, a project's tasks, a note's tasks, subtasks),
  each `BoardColumn`, the notes list and card grid, the projects list and card grid, Trash, and ⌘K's
  results. Not the sidebar's Recents and Favorites (five items each) or Home (three rows).
- **Sizes come from tokens.** Rows are `row-height` (48px, or 40px in the compact density), so
  `estimateSize` is exact for task, note, project and trash rows. Group headings and cards have
  fixed heights too. `measureElement` covers anything that wraps (a board card's pills).
- **Grids** virtualize rows of cards: the column count comes from the width (three, or two in
  compact windows), and each virtual row holds that many cards.
- **The group view is one flat list**: heading rows and task rows in one virtualizer, with the
  current group's heading kept sticky (`rangeExtractor`). Collapsing a group removes its rows from
  the flat list.
- **Loading more** is driven by the virtualizer: when its last rendered index comes within 20 of
  the loaded count, call `fetchNextPage()`.
- **Focus and selection.** A row scrolled out of view unmounts, so `TaskList` keeps the focused row
  and the selection as **ids** in state, never as DOM focus alone. Moving focus to a row off screen
  calls `scrollToIndex` first, then focuses it. Shift-click and Vim's `v` ranges select by id over
  the loaded rows. `gg`, `G` and counts (`5j`) become `scrollToIndex` calls.
- **Accessibility.** The list keeps `aria-rowcount` (the total, when a heading's count gives it)
  and `aria-rowindex` on each rendered row, so a screen reader announces "row 212 of 340" even
  though only 30 rows exist in the DOM.
- **Browser find (⌘F)** only sees rendered rows. That's acceptable: ⌘K searches everything.
- **It's a design-system change.** `TaskList`, `BoardColumn` and `CardGrid` get virtualization
  built in, and their stories add a 1,000-row case. Each lands with its guide, per `CLAUDE.md`.

### Loaders

Each route's `loader` calls `ensureQueryData` (or `ensureInfiniteQueryData`) for what its first
frame needs, from `context.queryClient`, and translates core's `not_found` into `notFound()`:

```ts
loader: async ({ context: { queryClient, trpc }, params }) => {
  const task = await ensureOrNotFound(queryClient, trpc.tasks.get.queryOptions({ id: params.taskId }));
  void queryClient.prefetchQuery(trpc.tasks.subtasks.queryOptions({ id: task.id }));
},
```

`loaderDeps: ({ search }) => pickFilters(search)` on list routes, so a filter change reloads and a
sheet's `open` param does not.

### Mutations

- `useMutation(trpc.x.y.mutationOptions())`. Never invalidate by hand: the call's `changed` is
  refetched before it settles.
- **Optimistic updates** only where a click must feel instant: task status, priority and favorite
  on a row or board card, and dragging a board card across columns. Follow
  `docs/ipc/implementation-plan.md` § Optimistic updates: `cancelQueries`, patch fields in place,
  never add or remove list items, roll back in `onError`. One helper,
  `patchTaskInCaches(queryClient, id, patch)`, walks `tasks.*` and `favorites`/`recents` caches.
- **Errors** go through one `useMutationErrorToast()` that maps `IpcErrorCode` to copy
  (`external_read_only` → "This task is synced from Linear. Change it there, or detach it.",
  `rate_limited` → retry time, `internal` → "Something went wrong").
- **Confirmations** honour `settings.general.confirmBeforeArchiving` and `confirmBeforeDeleting`
  in one `useConfirm()` (ConfirmDialog); core never reads them.
- **Undo**: moving to trash shows the "Moved to trash · Undo" toast (`7175:33810`), whose action
  calls the matching `archive.restore*`.

### Entity components take core's shapes

**Today**, `TaskRow` takes display strings, so every page that draws a task has to prepare them:

```tsx
// in the tasks page, the board, the project page, Home, … (eight places)
<TaskRow
  task={{
    title: item.title,
    status: isOverdue(item, now) ? 'overdue' : STATUS_NAMES[item.status], // 2 → 'in-progress'
    priority: PRIORITY_NAMES[item.priority],
    date: item.dueDate ? formatDue(item.dueDate, now) : undefined, // "Today", "Jul 1"
    dateTone: dueTone(item.dueDate, now),
    project: item.project?.title,
    projectColor: item.project?.color,
    subtasks: item.subtaskProgress.total
      ? [item.subtaskProgress.completed, item.subtaskProgress.total]
      : undefined,
    key: item.external?.key,
    // …
  }}
/>
```

**Instead**, the component reads the row itself, and works out what it draws:

```tsx
// any page
<TaskRow task={item} />;

// TaskRow.tsx
import { TaskStatus, type TaskListItem } from '@common/types/tasks'; // moved there by X1

// the fields TaskRow reads, named once, from the type core returns
export type TaskRowData = Pick<
  TaskListItem,
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'subtaskProgress'
  | 'project'
  | 'link'
  | 'parentTask'
  | 'external'
>;

export function TaskRow({ task }: { task: TaskRowData }) {
  const { now, formatDue } = useFormat(); // from <FormatProvider>
  const overdue = isOverdue(task.status, task.dueDate, now);
  const color = resolveColor(task.project?.color); // checks the hex; falls back to the default
  // … draws StatusIcon (flag when overdue), the pills, PriorityIcon, formatDue(task.dueDate)
}
```

- **One type, both sides.** `TaskListItem` lives in `src/common` (X1): core returns it, and
  `TaskRow` takes a `Pick` of it. A field core renames is a type error in the component at once,
  with no type test needed. The `Pick` keeps the prop to what the row reads, so a story's fixture
  only fills those fields.
- **`FormatProvider`** (in `components/lib`) supplies `now` (ticking once a minute, so "In 12 min"
  counts down) and `timeFormat` from settings, and wraps luxon (`useFormat()` returns
  `formatDue`, `formatRelative`, `formatTime`). The app mounts it once in `/app`. Storybook mounts
  it in a decorator with a fixed `now` (22 Jun 2026, as the screens use), so stories stay stable.
- **Enums.** `TaskStatus`, `TaskPriority` and `ProjectStatus` move to `src/common` with the types
  (X1). The components' string unions (`'not-started' | …`) go away, and the derived `'overdue'`
  becomes a boolean the row computes.
- **Colours** are checked where they're drawn: `resolveColor` (already in `components/types.ts`)
  validates a hex string with the shared `hexColorSchema` and falls back to the default.

**Which components change:** the ones that draw an entity. `TaskRow`, `BoardCard`, `LinkedTaskRow`,
`NoteRow`, `NoteCard`, `ProjectRow`, `ProjectCard`, `ProjectHeader`, `EventRow`, `HomeRow`'s
meeting form, `CalendarAgendaItem`, `TrashRow`, `EntityPill` and `EntityHoverCard`. Generic `ui/`
components don't change. Each moves with its stories (fixtures become core-shaped rows with real
`Date`s) and its guide, per `CLAUDE.md`. It's a sizeable design-system change, done in milestone 3
before the pages, so every page is written against the new props once.

**What stays outside the components:**

- **Choosing and combining data**, which is the page's job: a task row on Home shows its event pill
  from the task's `link`, and the page picks which query feeds which list.
- **`toEventInput`**, the FullCalendar adapter. It's a translation to a library's format, not to a
  component's props.
- **Dates use luxon**, wrapped once in `FormatProvider`:
  - due dates: `toRelativeCalendar()` within a week ("Today", "Tomorrow", "Yesterday"), else
    `toLocaleString({ month: 'short', day: 'numeric' })` ("Jul 1");
  - edit times: `toRelative({ style: 'narrow' })` ("2h ago");
  - times: `toLocaleString(DateTime.TIME_SIMPLE, { hourCycle: timeFormat === '24' ? 'h23' : 'h12' })`.

  Where luxon's wording differs from a Figma string, the design copy follows luxon rather than the
  app hand-formatting dates.

`toEventInput(event,
calendar)` follows the adapter spec: one-offs map directly; a series becomes an `rrule` string (a
`DTSTART;TZID=…` line, its `recurrenceRule`, and an `EXDATE` per `exdates`) with a `duration`;
occurrence rows join their series' `groupId`. FullCalendar expands the series.

Home's meeting rows and the calendar agenda don't use FullCalendar, so they need today's
occurrences without it. `occurrencesBetween(event, start, end)` expands one series with `rrule`
directly, using the same DTSTART/EXDATE lines, and a test checks it agrees with FullCalendar's
expansion for the same input.

### Entities in the editor

Add `useEntityResolver()` beside `useWorkspaceEditorHost` (follow-up "Entity pills and the '@'
menu show default glyphs"): `resolveEntity` reads `tasks.get` / `projects.get` / `notes.get` /
`events.get` from the cache and subscribes so pills re-render when the query settles. Every page
with a `RichTextEditor` passes `onOpenEntity={useOpenEntity()}`, which navigates by type: task →
`/app/tasks/$id`, project → `/app/projects/$id`, note → `/app/notes/$id`, event →
`/app/calendar?date=…&open=evt_…`. The same `useOpenEntity` serves search results, recents,
favorites and pills.

## App-wide pieces

### App layout (`/app`)

`AppShell` with:

- **Sidebar header:** `WorkspaceMenu` (moved from `App.tsx`; "New workspace…" opens the Create
  workspace dialog, which creates and opens it under the switch splash; "Open folder…" calls
  `workspaces.importFolder` then `workspaces.open`), Search (⌘K) and New task (C) actions.
- **Nav:** Home, Tasks, Projects, Notes, Calendar, Integrations, as `SidebarItem render={<Link
to=… />}` with `active` from `useMatchRoute` (a detail page keeps its section active).
- **Recents:** `recents.list({ limit: 5 })`; **Favorites:** `favorites.list({ limit: 5 })` with
  "More". Items open with `useOpenEntity`. Collapsed sidebar shows these as flyouts (`7167:14942`).
- **Footer:** `SyncStatus` (from `sync.status`, kept fresh by `sources.changed` and
  `sync.progress` events; Retry calls `sync.now`), Trash (`/app/trash`), Settings, and Help, drawn
  disabled until there is something behind it. The keyboard shortcuts dialog opens with `?` and
  from ⌘K.
- **Header:** each page renders its own `PageHeader` (breadcrumb, actions) through a small
  `usePageHeader(node)` slot, since `AppShell` takes `header` as a prop and the route below
  decides it. Breadcrumbs come from route `staticData.crumb` plus the entity title on detail pages.
- **Recording views:** detail routes call `recents.recordView({ id })` once per visit (an effect
  keyed on the id), as the IPC design expects.

### Global dialogs and commands

Mounted once in `/app`, opened from anywhere through a small store
(`src/renderer/app/dialogs.ts`, React context + reducer; no new state library):

- **Search ⌘K** (`7170:15331`): `CommandDialog`, `search.search` debounced 150ms with the type
  filter, grouped results with counts, "Recent" (from `recents.list`) and "Go to" commands on an
  empty query. Results' titles and bodies are core's escaped HTML with `<b>`; render them with the
  helper the untrusted-content doc names, never raw `innerHTML` from anywhere else.
- **Create task / subtask / project / event** dialogs (`7175:39512`, `7175:41654`, `7175:42128`,
  `7175:42495`) with "Create more". Defaults from settings (`tasks.defaultPriority`,
  `tasks.defaultDueDate`, `calendar.defaultEventDuration`) and from where it was opened (the
  project page passes `projectId`, a calendar slot its time).
- **Create workspace** dialog: the onboarding page's `CreateWorkspaceForm` in a `Dialog`.
- **Keyboard shortcuts** dialog (`?`, and from ⌘K), generated from the keymap.
- **Menu commands from main:** a new push event (A2) runs the app menu's New Task, New Note,
  Settings… and Find as commands from the registry below.

### Keyboard: commands, keymaps and Vim mode

The design has single keys (C, N, S, X, F, 1–3), chords (⌘K, ⌘⇧T), sequences (G H) and a
shortcuts sheet (`7426:43880`). A Vim mode is coming (Figma mock `7702:55372`–`7714:56845`): modes
(Normal, Insert, Visual, a `:` command line), counts (`3j`), operators (`dd`), `gg`/`G`, `f` hints,
and `u` to undo. A `useHotkeys(key, fn)` per component, or a library like tinykeys, handles the
first set and not the second. So the layer is three parts of our own (in
`src/renderer/keyboard/`), and Vim mode adds a keymap and a mode machine to them, not a rewrite.

**1. Commands** are what the app can do, independent of keys:

```ts
type Command = {
  id: string;                       // 'nav.tasks', 'task.setStatus', 'list.down', 'search.open'
  title: string;                    // shown in ⌘K, the shortcuts sheet and later the `:` line
  scope: Scope;                     // where it applies (below)
  run: (ctx: CommandContext, args: { count?: number }) => void | Undoable | Promise<…>;
  enabled?: (ctx: CommandContext) => boolean;
};
```

App-wide commands (navigation, create, search, toggle sidebar) are registered once in `/app`.
Pages and regions register theirs with `useCommands([...])` while mounted, bound to what they show
(the tasks page's `task.setStatus` acts on the focused or selected rows). ⌘K's "Go to" and actions
list, the shortcuts sheet, the menu's push events (A2) and later Vim's `:` line all read this one
registry, so a command can't exist in one and be missing from another.

**2. Scopes** say which commands are live. A `<KeyScope name="list">` wraps a region and is active
while focus is inside it. The active scopes form a stack: `global`, then `page`, then `list` /
`board` / `calendar` / `sheet`, then `dialog` (modal, blocks everything under it), then `editor`.
The innermost binding wins, so `j` can mean "next row" in a list and nothing in a dialog.

**3. Keymaps and the dispatcher.** A keymap is data: `{ scope, mode, keys, command, args }`
entries, e.g. `{ scope: 'global', keys: 'g t', command: 'nav.tasks' }`, `{ scope: 'list', keys:
's', command: 'row.openStatusMenu' }`, `{ scope: 'global', keys: 'mod+k', command: 'search.open'
}` (`mod` is ⌘ or Ctrl from the platform; `formatKeys` already draws it). One `keydown` listener on
the window (capture phase) does the rest:

- It normalises the key and buffers **sequences** (`g t`, later `d d`, `g g`) with a 1s timeout.
- It parses a **count** prefix when the keymap allows one (Vim only).
- It tracks a **mode**. The default keymap has one implicit mode; Vim adds `normal`, `insert`,
  `visual` and `command`, with the mode shown in the status area.
- It skips typing targets (inputs, `contenteditable`, IME composition) unless the binding opts in,
  as `mod+k` does.
- It picks the innermost active scope's binding.

The shortcuts sheet and menu hints render from the active keymap, so the keys shown never drift
from the keys that work.

**What this means now, before Vim:**

- Ship the default keymap: ⌘K, C, N, G H / G T / G P / G N / G C, ⌘\ (already in `AppShell`;
  move it into the keymap), `?`, and the list keys.
- **Move the list keys into the keymap.** `TaskRow` handles S, X and ↵ in its own `onKeyDown`
  today, and `TaskList` handles selection. Vim needs to remap those (`j`/`k` to move, `v` to select
  a range), so their behaviour becomes commands (`list.down`, `list.toggleSelect`,
  `row.openStatusMenu`, `row.open`). The components expose the actions (focus next and previous,
  toggle selection, open the status menu) through props or a ref, and stop binding keys themselves.
  This is a design-system change, so it lands with the component, its stories and its guide, per
  `CLAUDE.md`.
- **Commands that can be undone return an `Undoable`** (`{ label, undo }`): moving to trash returns
  "restore it". One app undo stack holds them. The toast's Undo button pops it now, and Vim's `u`
  pops it later.
- **Leave room for hints.** `f` labels everything clickable on screen. Rows, pills and buttons that
  should be reachable register through `useHintTarget(ref, action)`. The hook can be a no-op until
  Vim mode exists, but adding it while building the pages is cheaper than retrofitting.
- **The editor keeps its keys.** TipTap handles typing and its own shortcuts (⌘B, ⌘K link, `/`).
  The dispatcher only takes bindings marked `allowInEditor` there (⌘K search, ⌘⇧F open full view).
  Vim's Normal mode inside the editor will be a ProseMirror plugin, not the dispatcher.
- **A setting** chooses the keymap: `general.keyboardMode: 'default' | 'vim'` (S5), off by default,
  as Figma's mock shows (`7704:60566`).

## Pages and flows

Each page below lists its route, the Figma frames, the components (from the `Screens/*` story that
already composes them), the IPC calls, and the states to handle. Every list has a loading skeleton
(`TaskRowSkeleton`, `NoteCardSkeleton`), an empty state, a "no results for this filter" state with
"Clear filters" (`7175:36459`), and an error state with Retry (`7426:44078`).

### Splash (`/`)

Covered under Router setup. Figma `7175:19848`: logomark, "Opening ‹name›…", version from
`app.version`.

### Onboarding (`/onboarding/*`)

Layout: `OnboardingScreen` with the window bar (traffic lights or the Windows menu button) and no
sidebar.

- **Welcome** (`/onboarding`, `7175:19898`; with workspaces `7285:53770`): with no workspaces,
  "Create Workspace" → `new_workspace`, "Open Existing Folder…" → `workspaces.importFolder` then
  `workspaces.open`, "What's a workspace?" drawn disabled (no help yet). With workspaces, the
  "Recent workspaces" card: the list sorted by `lastOpenedAt` (client side), each opening with
  `workspaces.open`, then the same two buttons. The splash overlay covers the open; on
  `workspace.changed` the root navigates to the landing page.
- **Create workspace** (`/onboarding/new_workspace`, `7175:20087`): `CreateWorkspaceForm` (name
  `Input`, `SwatchPicker`, live `WorkspaceTile` preview) on the onboarding card. Submit:
  `workspaces.create`, then `workspaces.open` with its id. "← Back" to Welcome. Inside the app the
  same form is the Create workspace dialog.
- **Why a dialog inside the app** (Figma `7760:61527`), rather than the onboarding page or a page
  of its own:
  - **It's a short form.** A name and a colour, the same size as the other create dialogs (the
    Create project dialog already has a name and a colour), so it follows their pattern.
  - **Cancel loses nothing.** Esc or Cancel leaves you exactly where you were. A page would push a
    history entry and need Back to return.
  - **There is no "after" to show.** Creating opens the new workspace under the splash, which
    replaces the whole window anyway, so a page has no follow-up content to justify it.
  - **No routing exceptions.** A route inside `/app` (`/app/workspaces/new`) would draw the old
    workspace's sidebar around a form for a different workspace. Reusing `/onboarding` from the app
    needs the `?from=app` exception.

  The dialog says up front that the new workspace opens once it's created, since that closes what
  you're looking at.

- **Choose workspace** (`/onboarding/choose_workspace`): the full `WorkspaceList` (all workspaces,
  `workspaces.list` paged), for when the Welcome card shows only recent ones. Same open flow.
- **Errors** (`7423:37060`–`7423:37281`) from `importFolder`/`open`, shown inline on Welcome by
  code: `workspace_import`, by its `data.reason` (`not_a_workspace`; `already_added`, which names
  the workspace already listed so the error can offer "Open it"), `workspace_too_new` (needs a
  newer DevBrain), `workspace_data_missing` (folder missing, with "Remove from list").

### Home (`/app/home`)

Figma `7254:8102` and its variants; composition in `screens/Home/HomeScreens.tsx`.

- **Greeting** by time of day, **without a name**: "Good morning", "Good afternoon", "Good evening";
  "Welcome to ‹workspace name›" in a new workspace. Nothing in DevBrain knows the user's name, and
  each way of getting one costs more than the word is worth:
  - The OS user name (`os.userInfo().username`) is an account name ("mgeorge", "mitchellmarkgeorge"),
    not a name to greet with. The full name lives in different places on each OS and is often blank.
  - A connected account's name (Linear, Google) only exists after connecting, and differs between
    accounts.
  - Asking for it adds a step to onboarding, for a local, single-user app that never shows the name
    anywhere else.

  The summary line under the greeting carries Home's content; the name added nothing to it. The
  design-system README and the Figma Home frames change their copy to match when Home is built.

- **Summary and section choice** are computed in `pages/home/summary.ts`, a pure function over:
  today's and tomorrow's events (`events.listForCalendar` for now → end of tomorrow), open tasks
  due by end of today (`tasks.list({ filter: { dueBefore, excludeClosed } })`), projects due in the
  next 7 days (`projects.list`), and recent notes (`recents.list({ entityType: 'notes' })`). It
  follows the README's rules: one section, the soonest trigger wins, "Get started" in an empty
  workspace.
- **Keeping it current costs no polling.** Home's queries refetch only when their data changes:
  the query invalidator refetches mounted queries when a mutation or `db.changes` (sync) reports
  their entities, and React Query refetches stale ones when Home mounts. The one timer,
  `useNow(60_000)`, only re-renders: `summary.ts` recomputes from the cached data with the new
  `now`, so "In 12 min" counts down, the Join button appears, and finished meetings drop off, with
  no IPC call. The only time-driven fetch is at midnight, when "today" moves and the queries'
  date range (and so their key) changes. Turn off React Query's `refetchOnWindowFocus` on the
  `queryClient` too: main already reports every change, and main runs a sync on window focus
  (`runtime/lifecycle.ts`) whose writes arrive as `db.changes`.
- **CaptureBox**: Task / Note / Event. Parse the text for a date (`parseNaturalDate`) and
  `#project` (matched against `projects.list`), shown as highlights and pickers. Enter creates with
  `tasks.create` / `notes.create` (then opens the note) / `events.create`.
- **Footer**: "Press ⌘K to search"; "Google Calendar paused · Reconnect" when an integration is
  `needs_reauth` (Reconnect goes to `/app/integrations`).
- **Get started** rows: Connect Google Calendar / Connect Linear (to `/app/integrations` with the
  connect dialog open), Start a project (create project dialog).

### Tasks (`/app/tasks`)

Figma `7155:5231` (list), `7158:9538` (group), `7158:14338` (board), `7424:38163` (selection);
composition in `screens/Tasks`.

- **Toolbar** (`PageToolbar`): Filter (status, priority, project, due, source as one
  `DropdownMenu` with submenus; the button shows the active value), Sort, view `ToggleGroup`, New
  Task. Changes write search params with `replace`.
- **List**: `TaskList` over the infinite query, top-level tasks only (`excludeSubtasks`), with
  subtasks shown as designed (`subtask` rows under expanded parents through `tasks.subtasks`).
  Row: status click → `tasks.updateStatus` (optimistic); ↵ / click → `/app/tasks/$taskId`; right
  click → the row menu (`7175:24999`): Open, Status ›, Priority ›, Start date ›, Due date ›,
  Favorite, Open parent task, Open project, Move to trash.
- **Group**: `GroupHeading` per group with done/total and "Add task" (opens `QuickAddRow` in the
  group, creating with the group's project or status). Collapsed state per group in
  `localStorage`.
- **Board**: a `BoardColumn` per status (Not started, In progress, Completed; Cancelled hidden
  unless filtered), `BoardCard`s, dashed "Add task". Clicking a card sets `?open=tsk_…`, showing
  the **task sheet** (`7175:31599`) docked beside the board (floating in compact windows, as
  `SheetPage` in `App.tsx` does with `shell.sheetContainer`); its ⤢ goes to `/app/tasks/$taskId`.
  Drag between columns → `tasks.updateStatus` (optimistic). No manual order within a column (core
  has no position; see T4).
- **Selection bar**: Status, Priority, Due date, Move (project), more (Move to trash). Until bulk
  routes exist (T2), run the mutations one after another and report a partial failure.
- **Synced tasks**: `SourcePill`; read-only fields show the provider's labels; editing a mirrored
  field fails with `external_read_only`, so the UI disables those controls up front.

### Task page (`/app/tasks/$taskId`)

Figma `7158:6266` and variants (`7158:7794` subtask, `7158:8195` note, `7158:8645` event,
`7447:79190` PR, `7447:79636` empty, `7175:32210` synced, `7447:80695` detached); composition in
`screens/TaskDetail`.

- `DocumentPage` (720px centred). Title (inline edit → `tasks.update`), `PropertyRow`: Status,
  Priority, `DateRange` (DatePicker/DateRangePicker → `tasks.update`), Project
  (`ProjectPicker` → `tasks.updateProject`), Event or Note (→ `tasks.updateLinks`), Pull request,
  "+ Add" (`TASK_ADD_ITEMS`). Description in `RichTextEditor` (markdown in `description`), saved
  debounced.
- **Subtasks** `DetailSection` with `TaskList subtasks` and "+ Add" (`tasks.createSubtask`);
  promote/demote from the row menu.
- **Task note** card (`TaskNoteCard`) → the **task note dialog** (`7412:37391`): a
  `RichTextEditor` over the note's content (needs N1), "Open full view" → `/app/notes/$noteId`.
  With no note: "+ Add note" creates one linked to the task.
- **Header**: `PageFavoriteButton` (`tasks.setFavorite`), `PageMenuButton` with the README's order:
  Convert to project (C1), Link to ›, Make subtask of › (`tasks.demote`, picker `7424:38759`),
  Duplicate (C2), Copy as Markdown (C3), and for a Linear task Open in Linear
  (`workspace.openUrl`), Copy Linear URL, Detach (`tasks.detach`, dialog `7175:32683`) or Reattach;
  then Move to trash (`archive.archiveTask`, then navigate back with the Undo toast).
- A subtask shows its parent pill; an archived task (opened from Trash) shows a "In trash ·
  Restore" banner and is read-only.

### Projects (`/app/projects`) and project page (`/app/projects/$projectId`)

Figma `7158:15157` (list), `7158:15487` (cards), `7159:12540` / `7159:13218` / `7159:13886`
(page tabs), `7424:39896` (status menu), `7424:40578` (menu), `7424:41240` (no tasks).

- **List / cards**: `ProjectRow` / `ProjectCard` (in `CardGrid`, 3 columns, 2 in compact). Progress
  needs each project's task counts: `projects.stats` per visible project today (N+1), one list call
  after P1.
- **Page**: `ProjectHeader` (title, status menu → `projects.updateStatus`, dates, progress,
  description in `RichTextEditor`), `Tabs` Overview / Tasks / Notes in `?tab`:
  - Overview: task groups by status (`GroupHeading` + `TaskList`, collapsible), "+ Add task".
  - Tasks: the tasks list scoped with `projectId` (reuse the tasks page's list component with a
    fixed filter).
  - Notes: `notes.list({ filter: { projectId } })` as cards.
- Menu: New task, New note (both prefilled with the project), Change colour › (`ColourMenu` →
  `projects.update`), Copy as Markdown (C3), Move to trash. A synced (Linear) project is read-only
  where mirrored.

### Notes (`/app/notes`) and note page (`/app/notes/$noteId`)

Figma `7158:11693` (list), `7158:12276` (cards), `7158:16387` / `7158:16863` (editor, linked
tasks), `7158:17380`, `7158:17899`, `7421:36683`, `7527:51820` (menu), `7175:41157` (new empty).

- **List / cards**: `NoteRow` / `NoteCard`; rows have a right-click menu (Open, Favorite, Change
  link ›, Change project ›, Copy as Markdown, Move to trash). "+ New Note" (and the sidebar
  compose, and N) → `notes.create` then navigate to it with the title focused.
- **Page**: `DocumentPage` with `EditorTitle` (→ `notes.update` title), "Edited …", pills (project,
  linked event/task), then `RichTextEditor` with `useWorkspaceEditorHost`, `useEntityResolver` and
  `useOpenEntity`. The loader reads content with `notes.readContent` (N1, done).
- **Saving**: `onChange` → `notes.updateContent` debounced 500ms and flushed on route leave
  (`useBlocker` without a prompt, or the route's `onLeave`) and on window blur. Core serializes
  saves and the last wins; the page ignores the content refetch its own save triggers (the editor
  already ignores a `value` equal to what it last sent).
- **Tasks section** (`DetailSection` "Tasks"): `tasks.list({ filter: { noteId } })`, "Link Task"
  (picker → `tasks.updateLinks`), "+ New Task" (create dialog with `linkedNoteId`). Slash menu
  "Task" creates a linked task too.
- Menu: Link to ›, Change project ›, Duplicate (C2), Show in Finder (C4), Copy as Markdown (C3),
  Move to trash.

### Calendar (`/app/calendar`)

Figma `7158:13273` (week), `7158:13856` (day), `7158:18439` (month), `7175:30140` (event sheet),
`7410:34948` (event note in sheet), `7424:43188` (recurring change), `7424:43411` (delete),
`7424:43620` (Google RSVP), `7424:45312` (focus/tentative/OOO); composition in
`screens/Calendar/CalendarScreen.tsx` (rebuild on `AppShell`, not its own frame).

- **FullCalendar, drawn as the design system.** Add `@fullcalendar/react`, `@fullcalendar/core`,
  `@fullcalendar/timegrid`, `@fullcalendar/daygrid`, `@fullcalendar/interaction`,
  `@fullcalendar/rrule` and `@fullcalendar/luxon3` (named time zones, which the adapter spec's
  `DTSTART;TZID=…` lines need; confirm per the spec's "To confirm" list). Pin exact versions.
  FullCalendar v6 injects its own CSS from JavaScript, which the CSP's `style-src 'unsafe-inline'`
  allows.
- **A design-system component wraps it**: `components/calendar/CalendarView`, with a guide and
  stories, per `CLAUDE.md`. It stays presentational. It takes FullCalendar event sources and
  callbacks, and holds all the theming:
  - FullCalendar's CSS variables and class overrides, set from tokens to match the `TimeGrid` and
    `MonthGrid` guides: 48px hours, the 60px gutter, the red now line and today disc, `border` lines.
  - `eventContent` rendering `EventBlock` (compact under 40px) or `AllDayEvent`.
  - `dayHeaderContent`, `nowIndicatorContent` and `moreLinkContent` ("+2 more").
  - `firstDay` from `firstDayOfWeek`, and `slotLabelFormat`/`eventTimeFormat` from `timeFormat`.

  Once it matches them, `TimeGrid` and `MonthGrid` are retired. Their guides fold into
  `CalendarView.md`, and their stories become `CalendarView` stories with the same fixtures, so
  only one implementation is left to drift. `EventBlock`, `AllDayEvent`, the mini
  calendar (`ui/Calendar`) and `CalendarAgenda` stay as they are.

- **Header**: month title, Filter (calendar visibility menu over `calendars.list` →
  `calendars.setVisible`), view `ToggleGroup`, ‹ Today ›, New Event. The page drives FullCalendar
  from the URL: `view` → `timeGridWeek` / `timeGridDay` / `dayGridMonth`, `date` →
  `initialDate`/`gotoDate`; FullCalendar's own header toolbar is off. `datesSet` doesn't write the
  URL back, so the two can't loop.
- **Data**: one FullCalendar event source per visible calendar (coloured by the calendar, as the
  spec says), whose `events(info)` function calls
  `queryClient.fetchQuery(trpc.events.listForCalendar.queryOptions({ start, end, calendarIds }))`
  and maps with `toEventInput`. Reading through React Query keeps the invalidator in charge: when
  core reports `event` or `calendar` changes, a `refetchEvents()` follows from a
  `queryClient.getQueryCache().subscribe` on those keys. The read may fetch older Google history
  first; FullCalendar's `loading` callback shows the skeleton.
- **Right panel** (wide windows only, per the README): mini `Calendar` (sets `date`) and
  `CalendarAgenda` for today and tomorrow, mixing events (`occurrencesBetween`) and tasks due
  (`tasks.list` with `dueOn`).
- **Event sheet** (`?open=evt_…`, from `eventClick`; for an expanded occurrence `occurrence` is its
  start): date, time, repeats, calendar, location, meeting link (Join → `workspace.openUrl`),
  description, event note (inline `RichTextEditor` in the sheet, "Open full view" → the note page),
  linked tasks. Edits → `events.update`, or for a series the "This event / This and following / All
  events" dialog → the routes in the adapter spec's table. Google events are read-only
  (`editable: false`) with the RSVP shown (`response`). Events have no page of their own: the sheet
  is the event's detail view.
- **Task sheet** (`?open=tsk_…` from the agenda): the same task sheet as the board.
- **Creating**: New Event dialog; `select` on an empty slot (`interaction` plugin) opens it with
  that range, or `defaultEventDuration` for a click. Dragging and resizing events is not in the
  design; leave `editable` off for now. FullCalendar supports it and the spec covers the
  occurrence rules for a drag, so it can come later.

### Trash (`/app/trash`)

Figma `7159:11875`, `7175:29207` (row menu), `7285:53046` (delete confirm), `7426:43525`
(restored toast), `7175:36899` (empty).

- Tabs (`ToggleGroup`) in `?tab` → `archive.listArchived({ entityType })`, infinite.
- `TrashRow` with Restore (`archive.restore*` + "Restored" toast with "Open") and Delete
  (`ConfirmDialog` when `confirmBeforeDeleting`, saying what happens to linked items, then
  `tasks.delete` / `projects.delete` / `notes.delete`). Clicking a row opens the item's page
  read-only.
- "Empty trash" calls `archive.emptyTrash` (E1), after the confirm when `general.confirmBeforeDeleting` is on.

### Integrations (`/app/integrations`)

Figma `7164:13117`, `7165:13363` (connect menu), `7165:13724` (connect Linear), `7165:14142`
(empty), `7175:34407` (choose calendars), `7175:34542` (Google waiting), `7426:42811` (syncing),
`7426:43169` (key rejected), `7175:34304` (disconnect confirm).

- `IntegrationCard` per `integrations.list` entry, `SourceRow` per source (`sources.setEnabled`),
  account switch (`integrations.setEnabled`), Choose Calendars dialog (`calendars.list` +
  `calendars.setSelected`), Disconnect (`integrations.previewDisconnect` for the counts, then
  `integrations.disconnect` with "keep local copies").
- Connect menu: Linear (API key dialog → `integrations.connect` `{ auth: 'api_key' }`), Google
  Calendar (OAuth → the waiting state with Cancel → `integrations.cancelConnect`). GitHub "Coming
  later". The provider list is hard-coded until A3.
- Live status from `integrations.changed`, `sources.changed` and `sync.progress` (no polling).
- Lock the account's toggles while a connect or reconnect runs (follow-up "A reconnect overwrites
  a disable made while it runs").

### Settings (`/app/settings`)

Figma `7158:10515` (general), `7158:10842` (tasks), `7158:11133` (calendar), `7158:11416` (data &
storage), `7423:37352` (delete workspace), `7423:37433` (import summary), `7423:37520` (export
toast). `DocumentPage` at 720px, `Tabs` in `?tab`, `SettingsSection` / `SettingsGroup` /
`SettingsRow`.

- **General**: Workspace name and colour (`workspaces.update`), Appearance (theme, optimistic, as
  `FramePage` does now), Start page, Reopen last page, Launch at login, Time format, the two
  confirmations, Danger zone: Delete workspace (`workspaces.delete` after a typed confirmation;
  then the root lands on `/onboarding`).
- **Tasks**: default sort, priority, due date, view, show completed.
- **Calendar**: week starts on, default event length, default view, Hide weekends (S3).
- **Data & storage**: data folder path with Show in Finder (`settings.showDataFolder`); Import
  tasks / notes (`transfer.importTasks` / `importNotes`, then the import summary dialog from the
  returned summary, with "View Tasks"); Export tasks CSV/JSON and notes (toast with the result).
  `devBrainPath` is not shown as editable: nothing applies it.
- Every write sends the whole settings object (`settings.update` replaces it): build it from the
  cached `settings.get` plus the one change, optimistically, until S1.

## Main-process changes

Grouped by area, each with the page that needs it. **Blocking** means a page can't be built
without it; the rest have a renderer-side workaround noted above. Each follows `docs/ipc/design.md`
§ Adding a route and `CLAUDE.md` (synchronous queries, `onChange` from the service,
`ENTITIES_READ_BY_ROUTE`, an `attachRouter` test).

### Notes

- **N1 (done, [MitchellMarkGeorge/devbrain#110](https://github.com/MitchellMarkGeorge/devbrain/pull/110)): `notes.readContent({ id })`** → `NoteService.readContent`. The note page, the task
  note dialog and the event note in the sheet can't load a note without it. Give it its own line
  in the reads table, `'notes.readContent': ['note']`: the `notes` router's line also lists task,
  project, event and calendar, which would refetch an open note's content on every sync page.
  Also accept `content` in `notes.create` (core already
  does), so "Turn into note" and the capture box can create with a body.
- **N2: `Show in Finder` for a note**: `notes.showInFolder({ id })` through `ctx.desktop`, with the
  path from core (never from the renderer).

### Tasks

- **T1: tasks for a board or group in one call.** `tasks.list` returns one flat, paged list with
  one value per filter. The board needs three lists (one per status), and "group by project" needs
  one per project. So today each column or group runs its own `tasks.list` with its own filter
  (`status: 2`, or `projectId: prj_…`) and pages it to the end: 3 queries for the board, one per
  project for the group view. That works, but a workspace with 20 projects opens 20 queries, and
  the group headings' done/total need the whole group loaded. The fix is
  `tasks.listGrouped({ groupBy: 'status' | 'project' | 'priority', filter })`, returning each group's
  key, its counts, and its first page, in one call. **Not needed for the first version**: the
  per-group queries work with today's routes and are fast on a local database. Add it if a
  workspace with many projects makes the group view slow to open, or the headings' counts need
  loading every page.
- **T2: bulk updates** for the selection bar: `tasks.updateMany({ ids, patch })` and
  `archive.archiveTasks({ ids })` in one transaction with one change event, so a partial failure
  can't happen and the list refetches once.
- **T3: multi-value filters.** Core filters by **one** value per field: `status: 2`, not
  "In progress or Not started"; `priority: 3`, not "High or Medium". So the filter menu can offer
  "Priority: High" but not "High and Medium" ticked together. Accepting arrays (`status: [1, 2]`,
  becoming `IN (…)` in SQL) allows that, and a `query` field would filter by title. **Not needed
  for the first version**: the designed filter menu (`7175:25639`) picks one value at a time, which
  is what core supports. Add it only if the menu changes to allow several.
- **T4: manual order** within a board column or group (a `position` column, a migration per
  `CLAUDE.md`'s three steps). Only if the board should keep a drag order; the design doesn't
  show one, so leave it out for now.
- **T5: clearing fields.** `tasks.update` (and `projects.update`) take no nulls, so a due date,
  start date, description or PR link can't be removed; `DatePicker` has an `onClear`. Accept
  `null` for the nullable fields. **Needed for the date pickers.**
- **T6: optional due date on create.** `tasks.create` requires `dueDate`, while due dates are
  nullable in the model and the create dialog's due date is optional ("only required fields",
  `7447:79636`). Make it optional in the route (and `projects.create`). Until then the dialog fills
  it from `tasks.defaultDueDate`.

### Projects

- **P1: progress on the list.** `projects.list` returns no task counts, so the list and cards call
  `projects.stats` per row. Return the stats with each list item (one grouped count query in
  `listProjects`), and the same for `favorites`/`recents` project entries if they show progress.
- **P2: health.** `ProjectHealth` is defined but computed nowhere, and `HealthIcon` exists.
  Compute it in core (from due date, progress and overdue tasks) if the design shows it; Figma's
  project rows show status and progress only, so this can wait.

### Create, duplicate, convert, copy

- **C1: convert task to project** (task menu). A core method that creates the project from the
  task, moves its subtasks over as tasks, and archives the task, in one transaction.
- **C2: duplicate** a task (with subtasks) and a note (with its content). Core methods; ⌘D in the
  menus.
- **C3: copy as Markdown** for tasks, projects and notes. A core `toMarkdown(id)` (core already has
  `shared/markdown.ts` and the export writers) returning a string; the renderer writes it with
  `navigator.clipboard`.
- **C4: create a project with its first tasks** (the create project dialog's inline task list,
  `7175:42128`) in one transaction: `projects.create` accepting `tasks: [{ title }]`. Otherwise
  the dialog creates them one by one after the project.

### Archive

- **E1 (done): empty trash** (follow-up "Empty trash"): a `Workspace`-level method that deletes every
  archived row of the three services in one transaction, then the note files; one change per
  service.
- **E2 (later): rename archive to trash in code** (follow-up). Independent of the UI, which says
  Trash already.

### Shared types

- **X1: move the DTO types and their enums to `src/common`.** `src/common/types.ts` exists and is
  empty; this fills it. A **DTO** here is anything a route takes or returns: `Task`,
  `TaskListItem`, `Project`, `ProjectStats`, `Note`, `NoteListItem`, `Event`, `Calendar`,
  `Integration`, `ExternalRef`, `SourceSyncStatus`, `WorkspaceInfo`, `ArchivedEntity`,
  `SearchResult`, the favorite and recent entries, `Page<T>`, the summaries (`TaskSummary`,
  `ProjectSummary`, …), `AppSettings` with `appSettingsSchema`, and the enums they use
  (`TaskStatus`, `TaskPriority`, `ProjectStatus`, `EventKind`, `EventStatus`, `EventResponse`).

  - **Layout:** one file per feature (`src/common/types/tasks.ts`, `projects.ts`, `notes.ts`,
    `events.ts`, `calendars.ts`, `integrations.ts`, `workspaces.ts`, `settings.ts`, `search.ts`,
    `archive.ts`, `shared.ts`), re-exported from `src/common/types/index.ts`.
  - **Core imports them from `@common`** with no re-export from the old files, so each type has one
    home. The renderer stops using `import type` from `@main` for data, and keeps it only for
    `AppRouter`.
  - **Rule for `src/common`:** it imports only other `src/common` files and `zod`. No
    `drizzle-orm`, no `node:*`, nothing from `src/main`. Add an ESLint rule for `src/common/**`
    so it stays that way, since the renderer bundles it.
  - **What has to be split,** because these files mix DTOs with core-only code:
    - `tasks/types.ts` imports the Drizzle schema for its database row type. The row type stays in
      core; `Task` and `TaskListItem` move.
    - `shared/summaries.ts` holds both the summary types and the queries that load them. The types
      move; the queries stay.
    - `integrations/types.ts` mixes `Integration`/`ExternalRef` with the provider shapes
      (`ExternalTask`, …) used only by sync. Only the first move.
    - `workspace/types.ts` mixes `WorkspaceInfo` with core's wiring (the provider registry, the
      cipher). Only `WorkspaceInfo` moves.
  - **What stays in core:** database row types, sync cursors and provider shapes, service options,
    and anything that names a Node or Drizzle type.
  - **Inputs** (what `tasks.create` takes) are Zod schemas in `src/main/ipc/routers`. Moving them
    too would let the create dialogs validate with the same schema. Optional; do it per form as
    the dialogs are built.

  A mechanical change (moving types, updating imports), with no behaviour change, so one PR with
  `npm run typecheck` as its test. **Needed before milestone 3**, since the entity components are
  written against these types.

### Settings and app state

- **S1: partial settings update.** `settings.update` replaces the whole object, so two quick edits
  can race. Add `settings.set({ path, value })` over core's dot-path `set` (with the value checked
  against the path's schema), and `settings.reset`.
- **S2 (needed for "Reopen last page"): `settings.lastPage` / `settings.setLastPage({ href })`**
  over `state.lastPage`, which exists in the schema but is read and written nowhere. Include
  `lastPage` in the initial load context, so boot doesn't wait for a query. Validate it as an
  `/app` path string of bounded length; the renderer parses it before navigating. Writing a
  `state.*` key emits no `SettingsChange` (`SettingsService.set` only emits for `settings.*`), so
  saving the page refetches nothing.
- **S3: `calendar.hideWeekends`** (default `false`) in `appSettingsSchema`, shown in Settings ›
  Calendar as **Hide weekends** (Figma's "Show weekends" at `7158:11133` is renamed). FullCalendar
  takes it as `weekends: !hideWeekends`, in the week and month views.
  - **Existing settings files.** electron-store fills in defaults only at the top level, so a file
    written before this has a `settings.calendar` without `hideWeekends`, and `settings.get` would
    return it missing. Read the settings through `appSettingsSchema` with
    `.default(false)` on the new key (or deep-merge the defaults when the file opens), so every
    new setting has this path, not just this one.
  - **The design system's rule changes.** The README says the week view always keeps seven days,
    because hiding days could hide events. With the setting, that becomes "seven days unless
    Hide weekends is on". When it's on and the visible week has weekend events, the header says so
    ("2 events on the weekend"), with a link that shows the weekend. Update the README with the
    change.
- **S4 (dropped): the user's name.** Home greets without a name: "Good morning", and "Welcome to
  ‹workspace name›" in a new workspace. See Home for why. If a name is wanted later, an optional
  `general.displayName` in Settings › General is the way: the greeting adds it when it's set.
- **S5 (with Vim mode): `general.keyboardMode: 'default' | 'vim'`** in `appSettingsSchema`, off by
  default. Not needed until Vim mode is built.

### App, menu and windows

- **A1 (later): open a URL without a workspace.** `workspace.openUrl` needs an open workspace. There
  is no help link yet (Help and "What's a workspace?" are drawn disabled), so nothing needs this
  now. When help exists, add `app.openUrl` on `publicProcedure` with the same `safeUrlSchema`.
- **A2: menu commands to the renderer.** The app menu runs import, export and sync in main, and has
  no New Task, New Note, Settings… (⌘,) or Find (⌘K). Add those items, and a push event
  `app.command` (`{ command: 'newTask' | 'newNote' | 'openSettings' | 'search' | 'navigate', to? }`)
  in `AppEvents`, which `/app` turns into a dialog or a navigation. Import/export from the menu
  should also report its summary (`transfer.completed` event) so the renderer can show the same
  dialog and toast as the Settings buttons.
- **A3: provider catalogue.** The "Connect Account" menu (`7165:13363`) lists what can be connected:
  Linear (API key or OAuth, syncs tasks), Google Calendar (OAuth, syncs events), GitHub (coming
  later). Nothing in IPC says that. `integrations.list` returns accounts already connected, not the
  providers available. So the renderer would hard-code the menu, and duplicate facts main owns.
  One of them is variable: OAuth needs a client id built into the app, and when it's missing,
  `integrations.connect` fails with `oauth_unavailable` only after the user clicks. A
  `integrations.providers` query returning `{ provider, authTypes, sourceTypes, oauthAvailable }`
  for each lets the menu show only what works, and a new provider appears without a renderer
  change. Optional: hard-coding two providers is fine to start.
- **A4: workspace list order.** `workspaces.list` sorts by `createdAt`; "Recent workspaces" wants
  `lastOpenedAt`. Fine client-side while the list is one page; add a `sort` input if it grows.

### Search and editor

- **R1: status and colour in search results** (follow-up, fix 2): `SearchService.search` adds a
  task's `status` and a project's or event's `color`, so ⌘K and the "@" menu draw real glyphs.
- **R2 (later): `entities.summaries(ids)`** batch route if notes with many pills make per-pill
  `get` queries noticeable.

### Calendar

- **K1: calendar changes without a sync** (follow-up "Calendar changes wait for a sync run").

  **The short version:** DevBrain keeps its own copy of your Google calendars and their events, and
  only talks to Google during a sync run. Ticking or unticking a calendar, and learning about new
  calendars, all wait for the next run. Until it happens, DevBrain shows the old state.

  | Time            | You do                                | DevBrain's database                                        | What you see                           |
  | --------------- | ------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
  | 9:00            | Untick "Holidays" in Choose Calendars | `selected = false`; the 14 holiday events are still stored | The holidays, still on the week view   |
  | 9:00 + 1s       | (a sync run starts by itself)         | The run reaches its first page and deletes the 14 events   | The holidays disappear                 |
  | Offline instead | (the run fails before its first page) | Still `selected = false` with 14 events                    | The holidays stay until a run succeeds |

  **Background.** A connected Google account has several calendars ("Work", "Personal",
  "Holidays in Canada"). Each has two switches in DevBrain:
  - **Selected** (Choose Calendars, `7175:34407`): whether DevBrain syncs it at all. Unselecting
    should delete its events from the workspace.
  - **Visible** (the calendar page's Filter menu): whether its synced events are drawn. Nothing is
    deleted.

  Visibility is a plain database flag and takes effect at once. Selection, and the list of
  calendars itself, only change inside a sync run (`EventSyncer`), the same job that pulls events.
  Three examples of what that means in the UI:

  1. **A new Google calendar is missing from Choose Calendars.** You create "Gym" in Google
     Calendar at 9:00. At 9:05 you open Choose Calendars in DevBrain. The list is the one stored by
     the last run, so "Gym" isn't there. It appears after the next run (on a schedule, on window
     focus, or Sync Now), and that run also pulls every selected calendar's events. There's no
     "just refresh this list" request.
  2. **An unticked calendar's events stay on screen.** You untick "Holidays in Canada".
     `calendars.setSelected` flips the flag and starts a run in the background. Until that run
     writes its first page, usually a second or two, the holidays are still drawn on the week view.
     The calendar read (`EventService.readRange`) filters on `visible`, not `selected`, and the
     events are still in the database.
  3. **Offline, they stay indefinitely.** You untick "Holidays in Canada" on a plane, or while the
     account says "Needs reconnect". The run fails before its first page, or is skipped, so it
     never deletes them. The holidays stay on the calendar until a run succeeds.

  The follow-up proposes two operations beside the run:
  - `refreshCalendars(sourceId)` asks Google for the calendar list only (one request) and stores
    it. Choose Calendars calls it when it opens, which fixes example 1.
  - `deselectCalendar(sourceId, calendarId)` unticks, deletes the calendar's events and drops its
    sync cursor entry in one transaction, with no network. That fixes examples 2 and 3.

  **A smaller first step** fixes what the user sees in examples 2 and 3: make `readRange` also
  skip events of synced calendars that aren't selected (`selected OR sourceId IS NULL`). That's a
  one-line core change. Unticked calendars then vanish from the view at once, and the run deletes
  the rows when it can. Recommended with the calendar page (milestone 7); the full K1 stays
  optional.

### Summary

| Id                                     | Change                                                   | Needed by                                    | Blocking                   |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | -------------------------- |
| N1                                     | `notes.readContent`, `content` in `notes.create`         | Note page, task note, event note             | Done (#110)                |
| X1                                     | DTO types and enums to `src/common`                      | Entity components (milestone 3)              | **Yes** for the components |
| T5                                     | Nullable fields in `tasks.update`/`projects.update`      | Date pickers, clearing links                 | **Yes** for clearing       |
| S2                                     | `lastPage` read/write + in initial load context          | Reopen last page                             | For that setting           |
| T6                                     | Optional `dueDate` on create                             | Create dialogs                               | No (default from settings) |
| P1                                     | Stats on `projects.list`                                 | Projects list/cards                          | No (N+1)                   |
| T2                                     | Bulk task updates                                        | Selection bar                                | No (sequential)            |
| S1                                     | Partial settings update, reset                           | Settings                                     | No (whole object)          |
| A2                                     | Menu commands event, menu items                          | Menu                                         | No                         |
| C1–C4                                  | Convert, duplicate, copy as Markdown, project with tasks | Detail menus, create project                 | No (hide items)            |
| N2                                     | Note Show in Finder                                      | Note menu                                    | No (hide item)             |
| E1                                     | Empty trash                                              | Trash                                        | No (hide action)           |
| R1                                     | Status/colour in search                                  | ⌘K, "@" menu                                 | No                         |
| K0                                     | `readRange` skips unselected synced calendars            | Calendar (unticked calendars vanish at once) | No, but cheap              |
| T1, T3, T4, P2, A1, A3, A4, K1, R2, E2 | See above                                                |                                              | No                         |
| S5                                     | `keyboardMode` setting                                   | Vim mode                                     | Later                      |
| S3                                     | `calendar.hideWeekends`                                  | Settings, Calendar                           | No                         |

## Milestones and PR breakdown

Each milestone ends with the app runnable (`npm run dev`) and the checks passing (`npm run
typecheck`, `npm run lint`, `npm test`). Main-process changes land as their own PRs ahead of the
page that needs them.

1. **Router foundation.** Install the router and plugin; `router.tsx`, root route with
   `ToastProvider` and the switch-splash overlay; `/` boot; `/onboarding` and `/app` layouts with
   guards; `/app` renders `AppShell` with the real sidebar (nav, workspace menu) and placeholder
   pages; back/forward wired; `App.tsx` removed; `refetchOnWindowFocus` off. _Main:_ S2 (last
   page).
2. **Onboarding.** Welcome, Create workspace (the shared form, also as the in-app dialog), Choose
   workspace, error states.
3. **Shared app pieces.** Entity components moved to core's shapes, with `FormatProvider`
   (luxon), after X1 moves the shared types; `TaskList`, `BoardColumn` and `CardGrid` virtualized; `useOpenEntity`; error
   toast and `useConfirm`; Recents/Favorites/SyncStatus in the sidebar; page header slot and
   breadcrumbs; the keyboard layer (command registry, scopes, keymap dispatcher, undo stack) with
   the default keymap, and the list keys moved out of `TaskRow`/`TaskList` into it; the shortcuts
   dialog. _Main:_ X1 first.
4. **Tasks.** List view with filters/sort in search params, row menu, selection bar; group view;
   board with the task sheet; create task and subtask dialogs; task page. _Main:_ T5, T6 (then T2,
   C1–C3 as they land).
5. **Notes.** List and cards, note page with the editor and autosave, linked tasks, task note
   dialog on the task page, `useEntityResolver`. _Main:_ N1 (before this milestone), N2.
6. **Projects.** List and cards, project page with tabs, create project dialog. _Main:_ P1, C4.
7. **Calendar.** Add FullCalendar; `CalendarView` themed to the `TimeGrid`/`MonthGrid` guides,
   with its guide and stories, then retire those two; `toEventInput` and `occurrencesBetween` with
   tests (settle the adapter spec's `TZID` checks first); week/day/month from the URL; right panel
   and agenda; event sheet with occurrence editing; create event dialog; visibility filter. _Main:_
   K0.
8. **Home.** Summary/section logic with tests over fixed `now`s, capture box with parsing, the
   time-aware rows.
9. **Search (⌘K)** with recents and Go to commands. _Main:_ R1.
10. **Trash, Integrations, Settings.** _Main:_ E1, S1, A3, K1.
11. **Menu commands and polish.** _Main:_ A2. Compact-window behaviour checks against the
    responsive frames (`7602:42368`), light theme checks, empty/loading/error states on every
    list, accessibility pass (focus order, labels, the sheet and dialogs' focus traps).

Milestones 4–7 are independent after 3 and can run in parallel.

## Testing

- **Unit (Vitest, node):** search schemas (defaults, `.catch` on bad values, round trip through
  `Link`), `landingPage`, the `FormatProvider` formats over luxon (pinned `now`, both time formats),
  `isOverdue`, `resolveColor` on bad input, `toEventInput` against the adapter spec's examples, `occurrencesBetween` agreeing with
  FullCalendar's expansion (series, EXDATEs, occurrence rows, all-day, DST change), Home's summary
  and section choice, the capture box parser, and the key dispatcher (sequences, scopes, typing
  targets, `mod` per platform).
- **Routing (Vitest, happy-dom):** a memory-history router over the real route tree with a fake
  `ipc` (the link already takes a `bridge`): boot redirects (no workspace → onboarding; workspace →
  landing page; `openToLastPage`), the `/app` guard, not-found for a missing task, `open` param
  opening and Back closing the sheet.
- **Pages:** a smoke test per page that renders with fixture data through the fake bridge and
  checks its main states (loading, empty, data). Keep them few; the components' stories already
  cover how they look.
- **End to end:** later, Playwright's Electron support (`_electron.launch`) over a temporary
  DevBrain folder seeded with `npm run seed:dev`: create workspace → create task → open it →
  trash and restore.

## Open questions

Settled in review (Nov 6 2026): the route is `/app/trash`; events have no page of their own (the
sheet is their detail view); the calendar uses FullCalendar; new workspaces from inside the app use
a dialog; Help stays disabled until there is help; paths and param values use snake case; Hide
weekends is a calendar setting; the shared types move to `src/common`; Home greets without a name.

None. Every question raised in review is settled, including dropping the user's name from Home (S4).

## Out of scope

- Multiple windows (the router and invalidator already work per window; nothing opens a second).
- Vim keyboard mode itself (its keymap, the mode line, hints, the `:` line, Normal mode in the
  editor). The keyboard layer is built so it slots in; see Keyboard.
- Drag and drop in the calendar; manual ordering on the board (T4).
- Notifications and reminders (none designed).
- Syncing the Claude design-system page and Figma with the code (separate, per `CLAUDE.md`).
