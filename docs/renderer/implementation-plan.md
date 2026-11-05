# Renderer: implementation plan

The design system (`src/renderer/components`, with every designed screen rebuilt in Storybook under
`Screens/*`) and the main process (core services, the typed IPC router, change propagation) are
done. This plan turns the renderer from the test bench in `src/renderer/App.tsx` into the app:
routing with TanStack Router, a page per route wired to the IPC router, and the flows between them.
It also lists what main has to add or change for those pages (§ Main-process changes).

Sources: the Figma file (`w9WtYAUXkkzqKIMAzFo08I`, page "v2 Screens", node ids cited as `7158:6266`),
the `Screens/*` stories, `docs/design-system/README.md`, `docs/ipc/design.md` and
`docs/follow-ups.md`. Where Figma and the code disagree, the code wins (see `CLAUDE.md`).

> **Status:** plan only; nothing here is built yet.

## Contents

1. [Decisions](#decisions)
2. [Where things stand](#where-things-stand)
3. [Route tree](#route-tree)
4. [Router setup](#router-setup)
5. [Search params](#search-params)
6. [Data: queries, loaders, view models](#data-queries-loaders-view-models)
7. [App-wide pieces](#app-wide-pieces)
8. [Pages and flows](#pages-and-flows)
9. [Main-process changes](#main-process-changes)
10. [Milestones and PR breakdown](#milestones-and-pr-breakdown)
11. [Testing](#testing)
12. [Open questions](#open-questions)
13. [Out of scope](#out-of-scope)

## Decisions

| Area | Decision |
| --- | --- |
| Router | `@tanstack/react-router` with file-based routes (`@tanstack/router-plugin/vite`) in `src/renderer/routes`, generating `src/renderer/routeTree.gen.ts`, which is checked in, formatted and linted as generated. No automatic code splitting: the bundle loads from disk, so splitting only adds work. |
| History | **Hash history** (`createHashHistory`). The production page loads from `file://`, where browser history paths don't resolve on reload; the hash keeps the location across a reload (⌘R, a crash restore) and in devtools. Memory history would lose it. |
| Paths | As specified, with the spelling fixed: `/onboarding`, `/onboarding/new_workspace`, `/onboarding/choose_workspace`, `/app/...`. Path params use the entity's prefixed id (`tsk_…`, `prj_…`, `nte_…`), validated with the same prefixes `zId` checks. |
| Search params | Validated per route with Zod v4 (already a dependency; TanStack Router accepts Standard Schema), each field with `.catch()` so a stale or hand-edited URL falls back instead of failing. A param left out means "the setting's default" (e.g. `tasks.defaultView`), so a default is never written into the URL, and a changed setting applies to every URL without one. |
| Data | React Query stays the cache, through `trpc.*.queryOptions()` as today. Route loaders only *prime* that cache (`queryClient.ensureQueryData`), so a page renders with its data on the first frame and a missing entity becomes the route's not-found. The router keeps no cache of its own (`defaultPreloadStaleTime: 0`). Freshness stays with the query invalidator: nothing in a route invalidates by hand. |
| Router context | `{ queryClient, trpc, ipc }`, typed with `createRootRouteWithContext`. |
| View models | Components take display props (`Task` with `date: "Today"`, `project: "Auth Overhaul"`), not core rows. Mappers in `src/renderer/view-models/` turn router outputs (`inferRouterOutputs<AppRouter>`, type-only) into them, and are the only place that formats dates, derives `overdue`, maps numeric statuses and parses colours. |
| Detail presentation | As designed: tasks, projects and notes are pages; a task opened from the board and an event opened from the calendar show in the docked `Sheet` over their list, addressed by an `open` search param so Back closes them. The task note opens as a dialog (local state). |
| Splash | `/` is the boot route and draws the splash while the last workspace reopens, then redirects. A workspace *switch* draws the same splash as an overlay from the root route, driven by `workspace.changed` (as `App.tsx` does today), and does not navigate to `/`: a switch can start from the menu or another window, and the URL should land on the new workspace's landing page, not on `/`. |
| Not in the route list but designed | `/app/integrations` (in the sidebar nav, Figma `7164:13117`). Help is the keyboard-shortcuts dialog (`7426:43880`) and ⌘K is a dialog; neither is a route. |
| Archive vs Trash | The route stays `/app/archive` as specified, but every label says **Trash**, as the design and `docs/deleting.md` do. Renaming the route to `/app/trash` would match the UI; see Open questions. |
| Calendar rendering | Use the design system's own `TimeGrid` and `MonthGrid`, and expand recurring series in the renderer with `rrule` (already a dependency), following the DTSTART/EXDATE rules in `docs/calendar/fullcalendar-adapter.md`. FullCalendar is not added; the adapter spec becomes "the expansion spec" (see Open questions). |

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
    ├── /archive            ?tab=all|projects|tasks|notes
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
app.archive.tsx
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
  defaultPreload: 'intent',          // hover a row: its page's loader primes the cache
  defaultPreloadStaleTime: 0,        // React Query decides freshness
  defaultPendingMs: 150,             // pending UI only when IPC is slow (a provider fetch)
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
  scrollRestoration: true,
});
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
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
- `/onboarding` `beforeLoad`: if a workspace is open, redirect to `/app` — except while the user is
  choosing to *switch* (the sidebar's "New workspace…" goes to `/onboarding/new_workspace?from=app`,
  which skips the redirect and shows "← Back" to the app).
- A `no_workspace_open` error from any call (a workspace closed under the page) redirects to
  `/onboarding` from a `QueryCache`/`MutationCache` `onError` set on `queryClient`.

### Remembering the page

`/app`'s component subscribes to `router.subscribe('onResolved')` and, debounced (1s), saves the
location's `href` with `settings.setLastPage` (S2). Detail pages for a deleted entity resolve to
not-found, and a not-found location is not saved.

### Back and forward

`AppShell` gets `onBack={() => router.history.back()}`, `onForward`, and `canGoBack` from
`useCanGoBack()`; `canGoForward` needs a small hook over `router.history` (index vs length, both
on `history.location.state.__TSR_index`). Search-param changes that only reflect UI state (a
toolbar value, the calendar's date) navigate with `replace: true`, so Back goes to the previous
*page*, not the previous filter; opening a sheet (`open=…`) pushes, so Back closes it.

## Search params

Schemas live beside each route's page in `src/renderer/pages/<feature>/search.ts`, so a `<Link>`
elsewhere imports the type. Every field is optional and `.catch(undefined)`.

### `/app/tasks`

| Param | Values | Notes |
| --- | --- | --- |
| `view` | `list` (default) \| `group` \| `board` | default from `settings.tasks.defaultView` |
| `groupBy` | `project` (default) \| `status` \| `priority` \| `due` | `group` view only ("Group by: Project", `7158:9538`) |
| `sort` | `priority` \| `dueDate` \| `status` \| `createdAt` \| `updatedAt` | default `settings.tasks.defaultSort` |
| `dir` | `asc` \| `desc` | |
| `status` | `open` (default) \| `all` \| `not_started` \| `in_progress` \| `completed` \| `cancelled` | "Filter: Open" → `excludeClosed`; `showCompletedTasks` decides the default between `open` and `all` |
| `priority` | `low` \| `medium` \| `high` | single value, as core filters |
| `project` | `prj_…` \| `none` | "Filter by project" menu (`7175:25639`) |
| `due` | `overdue` \| `today` \| `week` \| `none` | mapped to `dueBefore`/`dueOn`/`dueAfter` at the call |
| `source` | `local` \| `external` | core's `origin` |
| `open` | `tsk_…` | the task sheet over the board (`7175:31599`) |

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

| Param | Values | Notes |
| --- | --- | --- |
| `view` | `week` (default) \| `month` \| `day` | default from `settings.calendar.defaultView` |
| `date` | `YYYY-MM-DD` | the anchor day, default today. The visible range is derived from `view` + `date` + `firstDayOfWeek`, so month, year and week all come from one param and can never disagree. "Today" removes it. |
| `open` | `evt_…` \| `tsk_…` | the item in the sheet. Ids are prefixed, so one param covers both the events and the tasks due that the agenda shows; the sheet picks its body from the prefix. |
| `occurrence` | ISO datetime | with `open=evt_…` of a series: which occurrence was clicked (its `originalStartAt`), needed to edit "this event" vs "all events" (`7424:43188`) |

**Calendar filters are not search params.** "Filter: All calendars" (`7424:42573`) toggles which
calendars show, and core already persists that per calendar (`calendars.setVisible`) and applies
it in `events.listForCalendar`. Storing it in the URL as well would give two sources of truth.

### `/app/archive`

`tab` (`all` default \| `projects` \| `tasks` \| `notes`), `sort` (`trashed` default; only one
sort exists in core, newest first).

### `/app/settings`

`tab` (`general` default \| `calendar` \| `tasks` \| `data_storage`). Figma orders the tabs
General / Tasks / Calendar / Data & storage.

## Data: queries, loaders, view models

### Queries

- Read with `useSuspenseQuery(trpc.x.y.queryOptions(input))` in pages whose loader primed the
  query, and `useQuery` for secondary data (counts, pills' hover cards), so a slow secondary read
  never blocks the page.
- Lists use `useSuspenseInfiniteQuery(trpc.x.list.infiniteQueryOptions(input, { getNextPageParam:
  (p) => p.nextCursor }))` and load the next page as the list scrolls near its end (an
  `IntersectionObserver` sentinel). Page size 100.
- The board and group views need every open task of a group, not a page: each column or group runs
  its own infinite query with that group's filter (`status` for the board, `projectId` for "group by
  project") and fetches pages until done. This works with today's routes; see T1 for the one-query
  version.

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

### View models (`src/renderer/view-models/`)

| File | Maps | To |
| --- | --- | --- |
| `task.ts` | `TaskListItem`, `Task` | `components` `Task` / `BoardTask`: status number → `'not-started'…`, `overdue` derived (due before today and not started/in progress), `date`/`dateTone`, `subtasks: [done, total]`, `project`/`projectColor`, `event`/`note` from `link`, `source`/`key` from `external` |
| `project.ts` | `Project` + stats | `ProjectRow`/`ProjectCard`/`ProjectHeader` props: progress, `due`, status |
| `note.ts` | `NoteListItem` | `NoteRow`/`NoteCard`: `edited` ("2h ago"), excerpt from `preview`, link pill |
| `event.ts` | `Event` + `Calendar` | `CalendarEvent` occurrences (with `expandEvents`, below), `EventRow`, `HomeRow` |
| `archive.ts` | `ArchivedEntity` | `TrashRow` item |
| `integration.ts` | `Integration`, `SourceSyncStatus` | `IntegrationCard`, `SourceRow`, `SyncStatus` state |
| `dates.ts` | | `formatDue`, `formatRelative`, `formatTime` (follows `general.timeFormat`), all with luxon in the system zone, as core does |
| `color.ts` | hex from core | `Swatch` or a CSS colour: parse with `hexColorSchema` first (untrusted, `docs/security/untrusted-content.md`), else the default |

Each mapper takes a `now` and the settings it needs, so tests pin both. `expandEvents(events,
range, now)` turns series masters into occurrences with `rrule` (DTSTART line from `startAt` in
`timeZone`, the series' `recurrenceRule`, an `EXDATE` per `exdates`), keeps occurrence rows as
their own items, and drops what falls outside the range.

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

- **Sidebar header:** `WorkspaceMenu` (moved from `App.tsx`; "New workspace…" goes to
  `/onboarding/new_workspace?from=app`; "Open folder…" calls `workspaces.importFolder` then
  `workspaces.open`), Search (⌘K) and New task (C) actions.
- **Nav:** Home, Tasks, Projects, Notes, Calendar, Integrations, as `SidebarItem render={<Link
  to=… />}` with `active` from `useMatchRoute` (a detail page keeps its section active).
- **Recents:** `recents.list({ limit: 5 })`; **Favorites:** `favorites.list({ limit: 5 })` with
  "More". Items open with `useOpenEntity`. Collapsed sidebar shows these as flyouts (`7167:14942`).
- **Footer:** `SyncStatus` (from `sync.status`, kept fresh by `sources.changed` and
  `sync.progress` events; Retry calls `sync.now`), Trash (`/app/archive`), Settings, Help (opens
  the shortcuts dialog).
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
- **Keyboard shortcuts** dialog (Help, `?`).
- **Hotkeys:** one `useHotkeys` layer in `/app` for the global keys in the shortcuts sheet: ⌘K,
  C (new task), N (new note), G H / G T / G P / G N / G C (go to), ⌘\ (sidebar; `AppShell` already
  handles it), ?. Ignored while focus is in an input or the editor. List keys (S, 1/2/3, X, ↵, F,
  ⌘⌫) belong to `TaskList`, which already handles selection and status keys; pages pass it the
  callbacks.
- **Menu commands from main:** a new push event (A2) lets the app menu's New Task, New Note,
  Settings… and Find run here.

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
  `workspaces.open`, "What's a workspace?" → external link (needs A1). With workspaces, the
  "Recent workspaces" card: the list sorted by `lastOpenedAt` (client side), each opening with
  `workspaces.open`, then the same two buttons. The splash overlay covers the open; on
  `workspace.changed` the root navigates to the landing page.
- **Create workspace** (`/onboarding/new_workspace`, `7175:20087`): name `Input`, `SwatchPicker`,
  live `WorkspaceTile` preview. Submit: `workspaces.create`, then `workspaces.open` with its id.
  "← Back" to Welcome (or to the app with `?from=app`).
- **Choose workspace** (`/onboarding/choose_workspace`): the full `WorkspaceList` (all workspaces,
  `workspaces.list` paged), for when the Welcome card shows only recent ones. Same open flow.
- **Errors** (`7423:37060`–`7423:37281`) from `importFolder`/`open`, shown inline on Welcome by
  code: `workspace_import`, by its `data.reason` (`not_a_workspace`; `already_added`, which names
  the workspace already listed so the error can offer "Open it"), `workspace_too_new` (needs a
  newer DevBrain), `workspace_data_missing` (folder missing, with "Remove from list").

### Home (`/app/home`)

Figma `7254:8102` and its variants; composition in `screens/Home/HomeScreens.tsx`.

- **Greeting** by time of day. The user's name has no source in core (see Open questions); until
  then, "Good morning".
- **Summary and section choice** are computed in `pages/home/summary.ts`, a pure function over:
  today's and tomorrow's events (`events.listForCalendar` for now → end of tomorrow), open tasks
  due by end of today (`tasks.list({ filter: { dueBefore, excludeClosed } })`), projects due in the
  next 7 days (`projects.list`), and recent notes (`recents.list({ entityType: 'notes' })`). It
  follows the README's rules: one section, the soonest trigger wins, "Get started" in an empty
  workspace. Re-evaluate every minute (a `useNow(60_000)`), so "In 12 min" and the Join button move.
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
  `useOpenEntity`. The loader reads content with `notes.content` (**N1, blocking**).
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

- **Header**: month title, Filter (calendar visibility menu over `calendars.list` →
  `calendars.setVisible`), view `ToggleGroup`, ‹ Today ›, New Event.
- **Grid**: `TimeGrid` (week: 7 days from `firstDayOfWeek`; day: 1) or `MonthGrid`. Data:
  `events.listForCalendar({ start, end })` for the visible range (it may fetch older Google history
  first; the 150ms pending threshold shows a skeleton for that), expanded with `expandEvents`.
  Prefetch the neighbouring range on hover of ‹ ›.
- **Right panel** (wide windows only, per the README): mini `Calendar` (sets `date`) and
  `CalendarAgenda` for today and tomorrow, mixing events and tasks due (`tasks.list` with
  `dueOn`).
- **Event sheet** (`?open=evt_…`): date, time, repeats, calendar, location, meeting link (Join →
  `workspace.openUrl`), description, event note (inline `RichTextEditor` in the sheet, "Open full
  view" → the note page), linked tasks. Edits → `events.update`, or for a series occurrence the
  "This event / All events" dialog → `events.updateOccurrence` with `scope`. Google events are
  read-only with the RSVP shown (`response`).
- **Task sheet** (`?open=tsk_…` from the agenda): the same task sheet as the board.
- **Creating**: New Event dialog; clicking an empty slot opens it with that time and
  `defaultEventDuration`. Dragging events is not in the design; leave it out.

### Archive / Trash (`/app/archive`)

Figma `7159:11875`, `7175:29207` (row menu), `7285:53046` (delete confirm), `7426:43525`
(restored toast), `7175:36899` (empty).

- Tabs (`ToggleGroup`) in `?tab` → `archive.listArchived({ entityType })`, infinite.
- `TrashRow` with Restore (`archive.restore*` + "Restored" toast with "Open") and Delete
  (`ConfirmDialog` when `confirmBeforeDeleting`, saying what happens to linked items, then
  `tasks.delete` / `projects.delete` / `notes.delete`). Clicking a row opens the item's page
  read-only.
- "Empty trash" waits for E1.

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
- **Calendar**: week starts on, default event length, default view. "Show weekends" is designed
  but has no setting, and the README says the week view always keeps seven days (S3).
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

- **N1 (blocking): `notes.content({ id })`** → `NoteService.readContent`. The note page, the task
  note dialog and the event note in the sheet can't load a note without it. Add `notes` to the
  reads table (it already is, by router). Also accept `content` in `notes.create` (core already
  does), so "Turn into note" and the capture box can create with a body.
- **N2: `Show in Finder` for a note**: `notes.showInFolder({ id })` through `ctx.desktop`, with the
  path from core (never from the renderer).

### Tasks

- **T1: tasks for a board or group in one call.** Today each column/group pages its own query.
  Either accept a list of values in `filter.status`/`filter.projectId` and let the renderer group,
  or add `tasks.listGrouped({ groupBy, filter })` returning groups with their counts. Not blocking.
- **T2: bulk updates** for the selection bar: `tasks.updateMany({ ids, patch })` and
  `archive.archiveTasks({ ids })` in one transaction with one change event, so a partial failure
  can't happen and the list refetches once.
- **T3: multi-value filters** (`status`, `priority` as arrays) and a title text filter, if the
  filter menu should allow several at once. Optional.
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

- **E1: empty trash** (follow-up "Empty trash"): a `Workspace`-level method that deletes every
  archived row of the three services in one transaction, then the note files; one change per
  service.
- **E2 (later): rename archive to trash in code** (follow-up). Independent of the UI, which says
  Trash already.

### Settings and app state

- **S1: partial settings update.** `settings.update` replaces the whole object, so two quick edits
  can race. Add `settings.set({ path, value })` over core's dot-path `set` (with the value checked
  against the path's schema), and `settings.reset`.
- **S2 (needed for "Reopen last page"): `settings.lastPage` / `settings.setLastPage({ href })`**
  over `state.lastPage`, which exists in the schema but is read and written nowhere. Include
  `lastPage` in the initial load context, so boot doesn't wait for a query. Validate it as an
  `/app` path string of bounded length; the renderer parses it before navigating.
- **S3: "Show weekends"** in calendar settings (`7158:11133`), if the README's "the week view keeps
  all seven days" is to change. Otherwise drop it from Figma. A design decision first.
- **S4: the user's name** for "Good morning, Mitchell": no setting holds it. Either a
  `general.displayName` setting (asked in onboarding or settings) or the OS user's name from main
  (`os.userInfo().username`, in the initial load context). A design decision.

### App, menu and windows

- **A1: open a URL without a workspace.** `workspace.openUrl` needs an open workspace, so links on
  Welcome ("What's a workspace?") and the about/help links can't open. Add `app.openUrl` on
  `publicProcedure` with the same `safeUrlSchema`.
- **A2: menu commands to the renderer.** The app menu runs import, export and sync in main, and has
  no New Task, New Note, Settings… (⌘,) or Find (⌘K). Add those items, and a push event
  `app.command` (`{ command: 'newTask' | 'newNote' | 'openSettings' | 'search' | 'navigate', to? }`)
  in `AppEvents`, which `/app` turns into a dialog or a navigation. Import/export from the menu
  should also report its summary (`transfer.completed` event) so the renderer can show the same
  dialog and toast as the Settings buttons.
- **A3: provider catalogue.** `integrations.providers` returning each provider's auth types, source
  types and whether OAuth is configured, so the connect menu doesn't hard-code them and
  `oauth_unavailable` isn't discovered only on connect. Optional.
- **A4: workspace list order.** `workspaces.list` sorts by `createdAt`; "Recent workspaces" wants
  `lastOpenedAt`. Fine client-side while the list is one page; add a `sort` input if it grows.

### Search and editor

- **R1: status and colour in search results** (follow-up, fix 2): `SearchService.search` adds a
  task's `status` and a project's or event's `color`, so ⌘K and the "@" menu draw real glyphs.
- **R2 (later): `entities.summaries(ids)`** batch route if notes with many pills make per-pill
  `get` queries noticeable.

### Calendar

- **K1: calendar list without a sync** (follow-up "Calendar changes wait for a sync run"): the
  Choose Calendars dialog needs `refreshCalendars` and an immediate `deselectCalendar`.

### Summary

| Id | Change | Needed by | Blocking |
| --- | --- | --- | --- |
| N1 | `notes.content`, `content` in `notes.create` | Note page, task note, event note | **Yes** |
| T5 | Nullable fields in `tasks.update`/`projects.update` | Date pickers, clearing links | **Yes** for clearing |
| S2 | `lastPage` read/write + in initial load context | Reopen last page | For that setting |
| T6 | Optional `dueDate` on create | Create dialogs | No (default from settings) |
| P1 | Stats on `projects.list` | Projects list/cards | No (N+1) |
| T2 | Bulk task updates | Selection bar | No (sequential) |
| S1 | Partial settings update, reset | Settings | No (whole object) |
| A1 | `app.openUrl` | Welcome | No (hide link) |
| A2 | Menu commands event, menu items | Menu | No |
| C1–C4 | Convert, duplicate, copy as Markdown, project with tasks | Detail menus, create project | No (hide items) |
| N2 | Note Show in Finder | Note menu | No (hide item) |
| E1 | Empty trash | Trash | No (hide action) |
| R1 | Status/colour in search | ⌘K, "@" menu | No |
| T1, T3, T4, P2, A3, A4, K1, R2, E2 | See above | | No |
| S3, S4 | Design decisions first | Settings, Home | No |

## Milestones and PR breakdown

Each milestone ends with the app runnable (`npm run dev`) and the checks passing (`npm run
typecheck`, `npm run lint`, `npm test`). Main-process changes land as their own PRs ahead of the
page that needs them.

1. **Router foundation.** Install the router and plugin; `router.tsx`, root route with
   `ToastProvider` and the switch-splash overlay; `/` boot; `/onboarding` and `/app` layouts with
   guards; `/app` renders `AppShell` with the real sidebar (nav, workspace menu) and placeholder
   pages; back/forward wired; `App.tsx` removed. *Main:* S2 (last page), A1.
2. **Onboarding.** Welcome, Create workspace, Choose workspace, error states.
3. **Shared app pieces.** View models and date/colour helpers with tests; `useOpenEntity`; error
   toast and `useConfirm`; Recents/Favorites/SyncStatus in the sidebar; page header slot and
   breadcrumbs; the hotkey layer; the shortcuts dialog.
4. **Tasks.** List view with filters/sort in search params, row menu, selection bar; group view;
   board with the task sheet; create task and subtask dialogs; task page. *Main:* T5, T6 (then T2,
   C1–C3 as they land).
5. **Notes.** List and cards, note page with the editor and autosave, linked tasks, task note
   dialog on the task page, `useEntityResolver`. *Main:* N1 (before this milestone), N2.
6. **Projects.** List and cards, project page with tabs, create project dialog. *Main:* P1, C4.
7. **Calendar.** `expandEvents` with tests, week/day/month, right panel and agenda, event sheet
   with occurrence editing, create event dialog, visibility filter.
8. **Home.** Summary/section logic with tests over fixed `now`s, capture box with parsing, the
   time-aware rows.
9. **Search (⌘K)** with recents and Go to commands. *Main:* R1.
10. **Trash, Integrations, Settings.** *Main:* E1, S1, A3, K1.
11. **Menu commands and polish.** *Main:* A2. Compact-window behaviour checks against the
    responsive frames (`7602:42368`), light theme checks, empty/loading/error states on every
    list, accessibility pass (focus order, labels, the sheet and dialogs' focus traps).

Milestones 4–7 are independent after 3 and can run in parallel.

## Testing

- **Unit (Vitest, node):** search schemas (defaults, `.catch` on bad values, round trip through
  `Link`), `landingPage`, every view-model mapper (pinned `now`, both time formats, colour
  parsing), `expandEvents` (series, EXDATEs, occurrence rows, all-day, DST change), Home's summary
  and section choice, the capture box parser.
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

1. **`/app/archive` or `/app/trash`?** The UI and docs say Trash everywhere; the route is the only
   place "archive" would show. Recommendation: `/app/trash`, with `/app/archive` redirecting.
2. **Event pages.** Figma's "Open full view" on an event note goes to the note. Is a full event
   page (`/app/calendar/events/$eventId`) wanted, or is the sheet enough? The plan assumes the
   sheet.
3. **FullCalendar.** The follow-ups expect FullCalendar; the design system already has `TimeGrid`
   and `MonthGrid`. The plan uses them with `rrule` expansion. Confirm, and the adapter spec gets
   rewritten as the expansion spec.
4. **The user's name** on Home (S4) and **Show weekends** (S3).
5. **Snake case in paths and params** (`new_workspace`, `data_storage`): kept as specified;
   TanStack has no preference. Kebab case (`new-workspace`) is the more common URL style if you'd
   rather switch before anything links to them.
6. **Vim mode** (Figma `7702:55372`): designed as an off-by-default setting. Out of scope here; the
   hotkey layer should be written so a modal layer can sit on it later.

## Out of scope

- Multiple windows (the router and invalidator already work per window; nothing opens a second).
- Vim keyboard mode.
- Drag and drop in the calendar; manual ordering on the board (T4).
- Notifications and reminders (none designed).
- Syncing the Claude design-system page and Figma with the code (separate, per `CLAUDE.md`).
