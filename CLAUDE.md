# DevBrain

## Database migrations

Migrations live in `src/main/db/migrations` and are generated from the schema in
`src/main/db/schema` with `npm run db:generate-migrations` (drizzle-kit). drizzle-kit only diffs
schemas: it knows nothing about the data already in a table.

**Rule: a generated migration is never edited by hand. Data changes go in their own custom
migration.** Split a schema change that drizzle-kit cannot carry out on its own into steps,
generating each from an intermediate schema:

1. **Add** (generated): new tables, renamed columns, and new columns without a foreign key or a
   CHECK. drizzle-kit emits plain `ALTER TABLE … ADD`/`RENAME COLUMN`, which keeps every row.
2. **Data** (custom, `npm run db:generate-migrations -- --custom --name=<what it does>`): seed rows,
   fill and convert values, so every row satisfies the constraints added next. SQL only, no schema
   changes.
3. **Constrain** (generated, from the final schema): foreign keys, CHECKs, and other changes
   SQLite can only make by rebuilding the table. Every column already exists, so drizzle-kit's
   copy of the rows into the rebuilt table is correct as generated.

Skip the steps a change does not need. Why: SQLite cannot add a foreign key or a CHECK to an
existing table, so drizzle-kit rebuilds it, and the rebuild copies every column of the new table
from the old one, failing on columns the old table does not have. It also cannot know how to fill
a new column from existing data. 0019–0021 (calendars and the event model) are an example.

Other points:

- Give each migration a name saying what it does (`--name=…`).
- drizzle-kit asks whether a new column is created or renamed, and needs a TTY to ask. Answer
  "rename" only for a real rename.
- After generating, run `npm run db:generate-migrations` again: it must report no schema changes.
- An unmerged branch's own migrations can be deleted (the `.sql`, its snapshot and its
  `_journal.json` entry) and generated again; a merged migration is never changed.
- Cover a migration that changes existing rows in `src/main/core/tests/db/migrations.test.ts`,
  seeding a database at the migration before it.

## Database access

better-sqlite3 is synchronous: every query runs on the main process and returns when it is done.
Awaiting one blocks just as long, and only opens a gap where other work can run between a check
and the write after it.

- End every Drizzle query with `.all()`, `.get()` or `.run()`; never `await` one. Put writes that
  must commit together in a `db.transaction`, which is synchronous too.
- A method returns a Promise only when it does real async work: file I/O (note files), the network
  (providers, OAuth) or encryption. One that only reads or writes rows is synchronous.

## Change events

A service in `src/main/core` that tells other code what it changed does so through
`ChangeListeners` (`src/main/core/shared/changes.ts`), not a listener set or callback option of its
own:

- Expose `onChange(listener)` (or a name saying what is sent, like `onProgress`) returning
  `this.changes.add(listener)`, and send with `this.changes.emit(change)` once the change has
  happened (after the commit, or as a transaction's last step when a listener's writes must commit
  with it).
- Make the change a discriminated union with a `type`, carrying ids and rows, never credentials.
- Wire services together by subscribing where they are built (`Workspace`,
  `createIntegrationServices`), not by passing hooks into constructors.
- A listener that throws is logged by its error class only and never fails the call. Pass
  `{ logger }` to send that line to the service's logger, or `{ report }` to replace it with one
  that adds context such as the id the change was about (see `SyncEngine`).

## Design system

**The code is the design system's single source of truth.** That is, in this repo:

- `docs/design-system/tokens.json`: every token (generated into `src/renderer/styles/tokens.css`,
  and its spacing and sizes as pixel numbers into `src/renderer/styles/tokens.ts`, with
  `npm run tokens`; never edit either).
- `src/renderer/components/`: the components (conventions in its `README.md`), with their
  Storybook stories as the browsable catalogue (`npm run storybook`; `Screens/*` rebuild the
  designed screens).
- `docs/design-system/README.md` and `docs/design-system/components/<Name>.md`: the rules and each
  component's guide, describing what the code does.

A design change lands in all three in the same change: the component, its stories and its guide
(and `tokens.json` for a token). Everything else follows the code and is not authoritative:

- The Figma file (key `w9WtYAUXkkzqKIMAzFo08I`) is where new designs start. Once built, the code
  wins; where they disagree, update Figma, not the code (unless the change is a deliberate redesign,
  which then lands in the code and its guide).
- The Claude design-system page (https://claude.ai/artifact/9ZGwb8KzWqLyDsnPnoTLav) is a published
  copy, to be synced from the code. It currently predates the Figma audit (Nov 2026) and is out of
  date.
- `docs/design-system/reference/` (the stand-in bundle behind that page) is superseded by the
  components and Storybook and out of date; don't build from it.
- `docs/design-system/archive/` holds superseded systems; don't build from them.

## Rich text

Every place the user writes or reads markdown uses `RichTextEditor` (`src/renderer/editor`), TipTap
with markdown in and out; a page renders it as `WorkspaceRichTextEditor`
(`src/renderer/shared/components`), which gives it the app's actions. `docs/editor.md` says what it reads and writes, what a save changes, and
how to add an element. A new element needs a round trip case in
`src/renderer/tests/editor/markdown.test.ts`.

## Loading data in components

A component draws something. Never write one that renders nothing (or only its children) to load
data or run an effect, and passes what it got up through a callback or an effect: the parent then
holds a copy of the data that lags the cache by a render, and draws a frame without it.

- Load data with hooks in the component that draws it: `useQuery`, `useInfiniteQuery`, or a
  custom hook wrapping them.
- For a list of queries whose length varies (one per group, per column), use `useQueries` in the
  parent. It has no infinite form: page by giving each query the number of pages to load (as
  the tasks page's `groupTasksQuery` does), not by mounting a component per query.
- An effect tied to something drawn (a heading coming into view) goes in the component that draws
  it, not in a wrapper around it.

## Dialogs

A page shows a dialog with `useModals().open((props) => <MyDialog {...props} />)`
(`src/renderer/app/modals.tsx`), not with open state of its own or a callback passed up to whoever
renders it. The dialog spreads `props` onto `Dialog` or `AlertDialog`, closes with
`props.onOpenChange(false)`, and is removed once its closing animation ends. The root layout holds
them, inside the router and the query client, and drops them all when a workspace switch starts.
Opening one closes the sidebar's drawer (`useModalShown`, in `AppLayout`).
Components in `src/renderer/components` stay controlled (`open`, `onOpenChange`); `useModals` is
for pages.

## IPC

The renderer reaches core through the typed tRPC router in `src/main/ipc`, run over Electron IPC.
`docs/ipc/design.md` describes it and ends with a checklist for adding a route.

- Core never imports from `src/main/ipc`: the IPC layer depends on core, not the other way round.
- The renderer imports from `src/main` as a type only (`import type { AppRouter }`); ESLint
  rejects a value import. Runtime values both sides need (enums, error codes, schemas) live in
  `src/common`.
- What a route takes or returns (`Task`, `Page<T>`, `AppSettings`, …) and the enums it uses are
  defined once, in `src/common/types`, and imported from `@common/types` by core and the renderer
  alike. Database rows, service options and sync's provider shapes stay in core. `src/common`
  never imports `src/main`, Drizzle, Electron or Node (ESLint enforces it).
- Handlers return core's data as it is: one call to a service, with an input schema, and no
  reshaping or extra lookups.
- A write the renderer must hear about is announced by its service through `onChange`, never by a
  route: the `ChangeTracker` (`src/main/ipc/changes.ts`) only hears core's events.
- A new core change type must be mapped to its `ChangedEntity` list in the `ChangeTracker`, and a
  new router added to `ENTITIES_READ_BY_ROUTE` (`src/renderer/ipc/query-invalidator.ts`).

## Renderer layout

`src/renderer` is organised by feature, with code used by several features in `shared`:

- `app/`: what starts the window and holds every page: the router (`router.tsx`), the root
  layout, splash and error pages, `theme.tsx`, `modals.tsx`, `workspace-route.ts`.
- `layouts/workspace/`: the shell around a workspace's pages (`AppLayout`, the sidebar, the
  workspace menu, the app-wide commands).
- `features/<feature>/`: one per area (tasks, notes, projects, calendar, home, search, settings,
  integrations, trash, onboarding, workspaces), each split the same way:
  - `api/`: `queries.ts` (query options and keys), `loaders.ts`, `search.ts` (search params),
    `route-api.ts`;
  - `page/`: the page components a route renders (`TasksPage`, `TaskPage`), and a style module
    only they use;
  - `hooks/`: its `use-*` hooks;
  - `components/`: the pieces of its pages: dialogs, sheets, menus and views, in subfolders by
    part (`create/`, `detail/`, `menus/`, `sheet/`, `views/`);
  - `lib/`: plain functions with no React (grouping, ranges, parsing).
    A feature may import another's `api`, `hooks` or `components` (tasks' menus are used across
    pages); when something is used by many, move it to `shared` instead.
- `shared/`: `hooks/`, `lib/` (including `workspace/` and `calendar/`), `components/` (app
  components that need IPC or the router; plain UI goes in `src/renderer/components`) and `api/`.
- `components/`, `editor/`, `keyboard/`, `ipc/`, `routes/`, `styles/`, `assets/`: as described in
  their own sections.
- `tests/`: mirrors the folders above (`tests/features/<feature>`, `tests/shared`, `tests/app`);
  `tests/routing` holds the route tests and their fake main.

Import across folders with the `@renderer/*` alias (`@renderer/shared/hooks/use-confirm`); within
one feature (or within `shared`, `app`, a layout) import relatively.

## Routing

The renderer routes with TanStack Router: file routes in `src/renderer/routes`, generated into
`src/renderer/routeTree.gen.ts` (checked in; `npm run routes` regenerates it), pages in
`src/renderer/features` (see "Renderer layout"). `docs/renderer/routing.md` is the design note.

- **The URL names the workspace.** Every page in a workspace is under `/app/$workspaceId/…`; add new
  pages there (`routes/app/$workspaceId/<page>.tsx`; a folder's layout is its `route.tsx`), never
  at `/app/<page>`. Link with
  `params: { workspaceId }`. The only pages outside one are onboarding (`/onboarding/*`) and Create
  workspace (`/workspaces/new`), drawn in an `AppShell`; inside a workspace it is a `WorkspaceShell`.
- **Only `/app/$workspaceId` opens a workspace** (its `beforeLoad`, `openWorkspaceOf`). Nothing else
  calls `workspaces.open`: to switch, navigate to the workspace's link (`/app/<id>`). The renderer
  never chooses a workspace on its own; main picks the window's first URL (`initialRoute`).
- **Loaders read the open workspace.** A page's loader only primes React Query
  (`queryClient.query({ ...options, staleTime: 'static' })`; `ensureQueryData` and `fetchQuery`
  are deprecated) and runs after the workspace is open; it never opens one, and needs no check
  of its own: a preload into another workspace is stopped before it runs.
- **One router**, made once in `main.tsx` (`createAppRouter`), never made again or unmounted. Tests
  make one per test over memory history and the fake main (`src/renderer/tests/routing`).
- **One splash**: `/app/$workspaceId`'s pending component, shown while it opens a workspace
  (`SPLASH_DELAY_MS` in, so a load that opens nothing never flashes it). The old workspace's page
  stays mounted under it, hidden, and the route remounts on a new workspace (`remountDeps`). Don't
  add a second loading screen for a switch, and keep the root free of a `beforeLoad`: one there
  stops the splash showing at startup.
- **A saved page names its workspace** (`lastPageSchema`); main keeps one per workspace. Don't send
  the location over IPC.
- **Each page declares its own title and actions.** A page component renders a `Page`
  (`src/renderer/components`) with its `title` ("Tasks", the task's title), shown in the title
  bar's search field and as the window's title, and its `actions` (a detail page's star and "…"),
  or none. There are no breadcrumbs. The workspace layout holds nothing of the page's; `Page` itself puts both in the
  window's title bar (`WorkspaceShell`'s `locationContainer` and `titleBarContainer`), so a page
  never fills a slot of its own.
- **Settings has its own sidebar.** Under `/app/$workspaceId/settings/…` the workspace layout gives
  the shell `SettingsSidebar` (Back to app, then a page per section) in place of `AppSidebar`. List
  a new setting under **Current workspace** when the workspace stores it (its database, its
  accounts) and under **All workspaces** when the settings file does, so it is clear which one it
  changes.
- Route files stay thin (`params`, `validateSearch`, `beforeLoad`, `loader`, a page component).
  `src/renderer/components` stays the design system: no router, no IPC.
- When a TanStack upgrade fails `src/renderer/tests/routing/tanstack-behaviour.test.ts`, the
  routing note says which part of the design relied on it.

## Website

`website/` is the public site (home, download, changelog, user docs, privacy policy, terms, 404): Astro
with Starlight, its own npm package and lockfile, hosted as a static site. `website/README.md`
covers building, hosting and how releases reach it.

- It imports the app's `tokens.css` and logomark rather than copying them: style it with the
  theme variables, and a token change reaches it through `tokens.json` like any other.
- Installers stay on GitHub Releases; the site reads them when it's built. A change to
  `artifactName` in `electron-builder.yml` needs one in `website/src/lib/releases.ts`.
- Its docs are for users (what the app does, in the UI's words); `docs/` stays the design notes for
  building DevBrain.
- Its screenshots of the app are taken from the built app by `npm run website:screenshots`, over
  the hand-written showcase workspace (`scripts/setup_showcase_workspace.mts`), never by hand.

### Voice

Copy on the site (and in the app's own words to users) follows what DevBrain is: **a local-first,
personal second brain for developers.**

- **Personal, not collaborative.** It's one developer's tool for their own work: "your tasks",
  "your notes". Never teams, sharing or collaboration.
- **What it's for:** a clear picture of what you're working on and when, and being able to pick
  your work back up ("If you woke up tomorrow with no memory of your work, could you ramp back
  up?"). Easy to put things in, easier to find them and to take them out.
- **Quiet and direct,** like the app: short sentences, plain words, no hype or exclamation marks.
  Say what it does, then stop.
- **Its ideas, not their jargon.** It draws on Getting Things Done and the second-brain method;
  "second brain" is ours to use, but don't lean on GTD terms (contexts, inboxes, PARA).
- **Privacy is a fact, not a slogan:** local, offline, plain Markdown on disk, no account, no
  server. Never imply sync or backup DevBrain doesn't do, or integrations it doesn't have (Linear
  and Google Calendar today, not "all your dev tools").
- **No AI claims.** DevBrain surfaces things from the connections you make (Home, Up next, a
  project's health); don't describe that as AI.

### Keeping it in step with the app

The site describes the app, so a change users can see lands with its website changes **in the same
pull request**, as a design change lands with its stories and guide. Before finishing an app change,
go through this list:

- **UI on a page the screenshots show** (`PAGES` in `e2e/screenshots/website.screens.ts`: the pages
  the home page and the docs show, from Home and the task list to search, settings and integrations): run
  `npm run website:screenshots`, look at the new captures and commit them. Check that the home page's
  close-ups (`crop` in `website/src/pages/index.astro`) still frame what their text describes, and
  move a crop that doesn't. If the change needs data the showcase workspace lacks, or makes it look
  wrong, change the showcase workspace, not the capture.
- **A feature added, changed or removed, or its UI text renamed:** update the user docs
  (`website/src/content/docs/docs/`) and any copy on the home page that describes it (the tour, the
  close-ups, the feature cards and the integrations card's drawn rows). The site never claims what
  the app doesn't do: check a claim against the code.
- **What the app sends over the network or stores** (a new integration, an OAuth scope, a host it
  contacts, telemetry, crash reports, update checks, remote content): update the privacy policy
  (`website/src/pages/privacy.md`) and its `updated` date before the change ships. A Google scope
  goes in its table of permissions and must keep to Google's Limited Use rules. A new third-party
  service also goes in the terms (`website/src/pages/terms.md`).
- **An integration's logo or the app's brand assets:** two of the site's marks are copies of the
  app's in `src/renderer/components/entities/ProviderLogo/marks.tsx`: Google Calendar's logo
  (`website/src/assets/brand/google-calendar.svg`) and GitHub's mark
  (`website/src/components/GitHubMark.astro`); change both. The home page's drawn rows also copy two app glyphs: the in-progress circle
  (`website/src/components/InProgressIcon.astro`, from `CoreCircle`) and the priority gauge
  (`website/src/components/PriorityIcon.astro`, from `PriorityIcon`); change those with the app's too. The logomark and Linear's mark are read
  from the app. Other icons are Lucide's, from `@lucide/astro` at the app's `lucide-react` version:
  upgrade the two together.
- **Platforms, installers or how DevBrain is installed and updated:** update the download page, the
  install docs and `releases.ts`.

Then run `npm run check` and `npm run build` in `website/`. After a release, rebuild the site by
hand (`website/README.md`).
