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

- `docs/design-system/tokens.json`: every token (generated into `src/renderer/styles/tokens.css`
  with `npm run tokens`; never edit the CSS).
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
with markdown in and out. `docs/editor.md` says what it reads and writes, what a save changes, and
how to add an element. A new element needs a round trip case in
`src/renderer/tests/editor/markdown.test.ts`.

## Dialogs

A page shows a dialog with `useModals().open((props) => <MyDialog {...props} />)`
(`src/renderer/modals.tsx`), not with open state of its own or a callback passed up to whoever
renders it. The dialog spreads `props` onto `Dialog` or `AlertDialog`, closes with
`props.onOpenChange(false)`, and is removed once its closing animation ends. The root layout holds
them, inside the router and the query client, and drops them all when a workspace switch starts.
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

## Routing

The renderer routes with TanStack Router: file routes in `src/renderer/routes`, generated into
`src/renderer/routeTree.gen.ts` (checked in; `npm run routes` regenerates it), pages in
`src/renderer/pages`. `docs/renderer/routing.md` is the design note.

- **The URL names the workspace.** Every page in a workspace is under `/app/$workspaceId/…`; add new
  pages there (`routes/app/$workspaceId/<page>.tsx`; a folder's layout is its `route.tsx`), never
  at `/app/<page>`. Link with
  `params: { workspaceId }`.
- **Only `/app/$workspaceId` opens a workspace** (its `beforeLoad`, `openWorkspaceOf`). Nothing else
  calls `workspaces.open`: to switch, navigate to the workspace's link (`/app/<id>`). The renderer
  never chooses a workspace on its own; main picks the window's first URL (`initialRoute`).
- **Loaders read the open workspace.** A page's loader only primes React Query
  (`queryClient.query({ ...options, staleTime: 'static' })`; `ensureQueryData` and `fetchQuery`
  are deprecated) and runs after the workspace is open; it never opens one, and needs no check
  of its own: a preload into another workspace is stopped before it runs.
- **One router**, made once in `main.tsx` (`createAppRouter`), never made again or unmounted. Tests
  make one per test over memory history and the fake main (`src/renderer/tests/routing`).
- **One splash**, around the router (`WithSplash`), while a workspace loads
  (`useWorkspaceLoading`); the root draws no page meanwhile. Don't add a second loading screen for
  a switch, and don't keep a page mounted across one.
- **A saved page names its workspace** (`lastPageSchema`); main keeps one per workspace. Don't send
  the location over IPC.
- Route files stay thin (`params`, `validateSearch`, `beforeLoad`, `loader`, a page component).
  `src/renderer/components` stays the design system: no router, no IPC.
- When a TanStack upgrade fails `src/renderer/tests/routing/tanstack-behaviour.test.ts`, the
  routing note says which part of the design relied on it.
