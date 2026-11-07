# Exploration: the router, the splash and workspace switching

How the renderer handles routing, the splash and workspace switches, with a working prototype
on the local branch `explore/router-splash` (not pushed). Built from `main` at `eb8286c` only.

**Result:** one `WorkspaceSession` object follows main's `workspace.changed` event and makes every
navigation the workspace lifecycle needs. The root route draws the splash in place of the whole
route tree while the session is busy, and its `beforeLoad` keeps every location inside the open
workspace's pages. 21 tests pass (14 scenarios, 7 library checks); main needs no changes.

## Contents

- [The problem in one paragraph](#the-problem-in-one-paragraph)
- [Approaches considered](#approaches-considered)
- [The chosen design](#the-chosen-design)
- [How it meets each requirement](#how-it-meets-each-requirement)
- [TanStack Router behaviour relied on](#tanstack-router-behaviour-relied-on)
- [Tests and results](#tests-and-results)
- [Main-process changes](#main-process-changes)
- [Open questions and risks](#open-questions-and-risks)
- [Files on the branch](#files-on-the-branch)

## The problem in one paragraph

Main saves a workspace's last page from the window URL **at the moment it emits `closed`**
(`last-page.ts` keeps the latest `/app…` hash it has seen, writes it on `closed`, then forgets it).
A switch sends `{ id: A, opening: B }` → `{ id: null, opening: B }` (A closed) →
`{ id: B, opening: null }`. So:

- The URL must stay on A's page until A has closed. Any navigation before that saves the wrong
  page, or none: `/onboarding` or `/` resets main's page to `null`.
- A's page must leave the screen as soon as `opening` arrives. If it stays mounted, the query
  invalidator's reset at `opened` refetches its queries with B's data, which means drawing B's rows
  in A's route.
- B's page must not appear until its loaders are done, and not within 600 ms of the splash
  appearing.
- History entries from before the switch are A's. Back must not reach them as pages of B.

## Approaches considered

### 1. Session + gate in the root (chosen)

A small object outside React (`WorkspaceSession`) follows `workspace.changed`. When a workspace is
open it navigates to the landing page, and when none is open it navigates to onboarding. It is
`busy` from `opening` until that navigation's promise resolves. The root route renders the splash
**instead of** its children while busy (the minimum time is held with the existing `useHeldFor`),
and its `beforeLoad` sends any location that doesn't belong to what is open to its first page.

| Requirement                    | Verdict                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1 splash in root route         | ✓ the root's `shellComponent`                                                                         |
| 2 waits for loader, 600 ms min | ✓ busy until `navigate()` resolves (after loaders), and `useHeldFor`                                  |
| 3 one router                   | ✓                                                                                                     |
| 4 never unmounted              | ✓ the router and the root match persist; only the tree under the shell swaps                          |
| 5 switch, last page, startup…  | ✓ the URL is untouched until `opened`; the page is unmounted at `opening`                             |
| 6 maintainable                 | ✓ one object, one guard, one gate; documented APIs except two internal details, both covered by tests |
| 7 onboarding                   | ✓ in the router, guarded by the same check                                                            |

### 2. Router-native: the root's `beforeLoad` awaits the open, with `pendingComponent` as the splash

On `opening`, call `router.invalidate()`. The root's `beforeLoad` awaits "the workspace has
settled", and the root's `pendingComponent` (with `pendingMinMs: 600`) is the splash.

- ✗ **5 (never draw A's page).** During a navigation the router keeps rendering the old matches
  until `pendingMs` passes. Even then a root that suspends hides its children under Suspense
  (React keeps them mounted with `display: none`), so A's page stays mounted. Its queries are
  still observed, and the reset at `opened` refetches them with B's data inside A's route.
- ✗ **5 (last page).** The landing page isn't known until B is open, so the root would have to
  redirect after its own await and tell a switch load from an ordinary one. That needs a flag on
  every load.
- ✗ **6.** It relies on how the root match goes pending when its `beforeLoad` runs again, and on
  Suspense keeping old children mounted. Both are internals, and 1.170's loading engine has been
  rewritten (`load-client.js`).

### 3. The plan's overlay: the splash over an always-mounted `<Outlet/>`

This is the implementation plan's current design (root renders `<Outlet/>` and the splash on top,
and `workspace.changed` navigates).

- ✗ **5.** A's page stays mounted under the overlay through the switch, so its queries refetch with
  B's data (the invalidator resets and refetches _active_ queries). Keying the outlet on the
  workspace id only remounts A's _route_ with B's data. The overlay hides this from view, but the
  page is drawn, and a MutationObserver sees it.
- ✗ **1/2 at startup.** The plan's `/` boot route draws its own splash, so there are two splash
  owners (a route and the root overlay), and on the first load the root renders nothing until the
  loaders are done (see [Behaviour 7](#tanstack-router-behaviour-relied-on)).

### Also rejected

- **The workspace id in the URL** (`/w/$workspaceId/app/…`). It makes history entries
  self-describing, but Back across the boundary would have to _switch workspaces_, it changes the
  `lastPage` format in manifests, and every link carries the id.
- **A history blocker for Back across the boundary** (`router.history.block` / `useBlocker`).
  Memory history never runs blockers on Back or Forward (tested). Browser history runs them only
  in its `popstate` handler, after the URL has already changed, then reverts it, so main would see
  the URL flicker. `useBlocker` hands its callback a location without history state, so it can't
  see the entry index. A blocker also prevents `beforeunload` unless `enableBeforeUnload: false` is
  set, which would block closing the window.

## The chosen design

### Pieces

| Piece                 | File                             | One job                                                                                                                        |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `WorkspaceSession`    | `src/renderer/router/session.ts` | follows `workspace.changed`; makes the lifecycle's navigations; says `busy`; decides whether a location belongs to what's open |
| `landingPage()`       | same                             | last page (setting on and parses) or `/app/${defaultLandingPage}`                                                              |
| root `shellComponent` | `src/renderer/router/routes.tsx` | the splash in place of the tree while busy, held ≥ 600 ms (`useHeldFor`)                                                       |
| root `beforeLoad`     | same                             | `session.guard(location)`: a location that doesn't belong redirects to the open workspace's first page                         |
| `main.tsx`            |                                  | builds the session and the one router (hash history) once, calls `session.start(router)`                                       |

There are no `/app` or `/onboarding` guards of their own: one check in the root covers `/`,
`/onboarding/*` and `/app/*` alike.

### Session state

```ts
interface SessionState {
  phase: 'opening' | 'open' | 'none'; // starting or switching | a workspace is open | onboarding
  busy: boolean; // the splash shows
  workspace: WorkspaceInfo | null;
  home: string; // where the guard sends a location that doesn't belong
  firstIndex: number; // history index of the open workspace's first entry
  failed: WorkspaceId | null; // for onboarding to say which open failed
}
```

### A switch, A → B

```
main                                   session                         window
────                                   ───────                         ──────
opening B ─► {id:A, opening:B} ──────► phase opening, busy             shell: splash replaces the tree
                                                                        → A's page unmounted (queries inactive)
                                                                        URL still A's page
close A: last-page.ts saves the URL ──────────────────────────────────  A.lastPage = A's page ✓
         ─► {id:null, opening:B} ────► (still opening)                  invalidator drops workspace data
open B   ─► {id:B, opening:null} ────► land(B):
                                         fetch workspaces.current, settings.get
                                         to = landingPage(settings, B)
                                         await invalidator.workspaceOpened(B)
                                         phase open, home = to, firstIndex = index + 1
                                         await router.navigate({ href: to,  ──► root beforeLoad: belongs ✓
                                                 state: { workspaceId: B } })   B's loaders run (splash stays)
                                                                                 matches committed (not shown)
                                         busy = false ─────────────────────────► useHeldFor: splash until ≥ 600 ms,
                                                                                 then B's page, drawn once with its data
                                                                                 main tracks B's URL
```

Startup, reload, failure and close all use the same `land()`:

- **Cold start** (`initial.current === null`). The splash shows from the first render, and
  `workspaces.openLast` is called. Main's events drive `land(B)`. The mutation's own answer is used
  only when no event came (nothing to reopen → `land(null)` → onboarding; a failure before
  `opening` → onboarding).
- **Reload** (`initial.current` set). Phase is `open`, and `firstIndex` is the current entry's
  index. If the URL is an `/app` page, `router.load()` loads it and `busy` clears when it's done.
  Otherwise it lands on the landing page. Nothing is reopened, and no events are sent.
- **Failed open.** `{id:null, opening:null}` arrives after `opening` → `land(null)`, with
  `failed = B` → onboarding says so. A's last page was saved at `closed`, as in any switch.
- **A workspace closing** (delete, or close). `{id:null, opening:null}` → `land(null)`. The splash
  replaces A's page at once, then onboarding shows.

### Back and Forward

Each workspace's pages start at the history entry it landed on (`firstIndex`). The landing
navigation always pushes: its `state.workspaceId` makes it a different location even when the href
is the same, so the router never reuses the current entry. A push also truncates whatever Forward
entries were there. So entries below `firstIndex` belong to what was open before, and there are
none above it from another workspace.

- The shell's Back is disabled at `firstIndex` (`session.canGoBack(location)`). In Electron every
  Back goes through the app's own code: mouse buttons and swipes aren't wired up to navigate unless
  the app does it, so this is the normal path.
- **Safety net.** If history reaches an older entry anyway (`history.back()` from any code), the
  root's `beforeLoad` redirects it, with `replace`, to the workspace's first page, marked with
  `state.workspaceId`. The marker lets that rewritten entry belong from then on, without a redirect
  loop.

```ts
// session.ts
guard(location: ParsedLocation): void {
  const { phase, home, workspace } = this.state;
  if (phase === 'opening' || this.belongs(location)) return;
  throw redirect({ href: home, replace: true, state: { workspaceId: workspace?.id ?? null } });
}

private belongs(location: ParsedLocation): boolean {
  const { phase, workspace, firstIndex } = this.state;
  if (phase === 'none') return location.pathname.startsWith('/onboarding');
  if (!isAppPath(location.pathname)) return false;
  return location.state.__TSR_index >= firstIndex || location.state.workspaceId === workspace?.id;
}
```

### The root route

```tsx
const rootRoute = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ context, location }) => context.session.guard(location),
  shellComponent: SplashGate,
  // the router's first load renders nothing, shell included, unless the root has pending UI:
  // this empty one lets the shell draw the splash during a slow reload
  pendingComponent: () => null,
  pendingMs: 0,
});

function SplashGate({ children }: { children: ReactNode }) {
  const { session, splashMinimumMs } = useRouter().options.context;
  const busy = useSyncExternalStore(session.subscribe, () => session.getState().busy);
  const splash = useHeldFor(busy, splashMinimumMs);
  return splash ? <Splash /> : children;
}
```

Why the **shell** and not the root's `component`: on the router's first load the tree isn't
rendered until the loaders are done. A splash in the root component would not show during a
reload onto a slow page. The root's `pendingComponent` would show then, but it would be a second
splash element (the pulse would restart, and two minimum timers would stack: the first prototype
drew `splash, splash, page`). The shell renders outside the root's own Suspense boundary, so a
single splash covers every case.

## How it meets each requirement

1. **The splash shows while a workspace is opening, in the root route.** It's the root route's
   `shellComponent`, driven by `session.busy`, which is true from `opening`. Covered by the switch
   tests.
2. **It waits for the loader of the page about to appear, for 600 ms at least.** `busy` clears only
   when `router.navigate()` resolves, which happens after the target's loaders have run and its
   matches have rendered (Behaviour 1). `useHeldFor` keeps the splash for 600 ms at least. The
   tests check a loader held for 900 ms+ (splash stays, no page), and a fast switch (page drawn
   ≥ 595 ms after the splash).
   - On a reload whose data arrives before React's first render, the page is drawn directly, with
     no splash and no flicker. A slow reload shows the splash until the page is ready.
3. **Exactly one router.** `createAppRouter` is called once, in `main.tsx`.
4. **Always present.** `RouterProvider` is rendered once and never keyed. The root match persists,
   and the shell mounts once across startup, switches and onboarding (the harness counts it: 1).
   What the shell swaps for the splash is the route tree below it. The root route's own children,
   pages and layouts remount after a splash, so app-wide hosts (toasts, dialogs) should sit in the
   shell, beside the gate, if they must survive a switch.
5. **Switches and the last page.**
   - A's page leaves the DOM in the render for `opening` (the test asserts no page right after).
   - The URL isn't touched until `opened`, so A's saved last page is exact (asserted in the
     switch, failed-switch and close tests).
   - B lands on its last page with the setting on, and on the default page with it off.
   - Startup, reload, failed open and close: one test each, plus a slow reload.
6. **Maintainable.**
   - One object, about 200 lines with comments, with a single `land()` for every outcome. One guard
     in one `beforeLoad`, and one gate component.
   - Every TanStack API used is a public option (`beforeLoad`, `redirect`, `navigate`, `load`,
     `shellComponent`, `pendingComponent`, `createHashHistory`). Two behaviours are internal and
     each has a test (see below).
7. **Onboarding is in the router.** `/onboarding/*` routes are needed regardless: requirement 4
   keeps the router mounted during onboarding, so onboarding outside it would still sit under the
   same root. Making it routes gives:
   - Back and Forward between Welcome and Create workspace, for free.
   - The same splash and guard (`phase 'none'` ⇒ only `/onboarding` belongs).
   - A meaningful URL for devtools and reloads.

   Main's `lastPageOf` already ignores non-`/app` URLs, so onboarding never becomes a last page.

## TanStack Router behaviour relied on

Version **1.170.46** (`@tanstack/history` 1.162.5, `@tanstack/router-core` 1.171.39), the release
of Oct 22 2026. tanstack.com was not reachable from this session (the network blocks it), so
"documented" below means the public API and its JSDoc as shipped in the package, plus what I know
of the docs. Each behaviour is verified by a test in `library-behaviour.test.ts` or by the scenario
tests.

| #   | Behaviour                                                                                                                                                                                                                                                                                                  | Status                                                                                                                                             | Verified by                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `router.navigate()` resolves only after the target's loaders are done and its matches are rendered. A superseded navigation's promise resolves with the one that replaced it (source: `_commitPromise` chaining).                                                                                          | Documented (navigation returns a promise for completion); the details read from source                                                             | "navigate() resolves only once…"; the slow-loader switch test                                                                    |
| 2   | The root route's `beforeLoad` runs on every navigation, including Back and Forward.                                                                                                                                                                                                                        | Documented                                                                                                                                         | "the root route's beforeLoad runs on every navigation…"                                                                          |
| 3   | A push gets the next `__TSR_index`; `redirect({ replace: true, state })` keeps the index and sets the state.                                                                                                                                                                                               | `__TSR_index` is in the public `ParsedHistoryState` type but not in the guides; `redirect`'s `state` and `replace` are documented                  | "a push gets the next \_\_TSR_index…"; the Back/Forward tests                                                                    |
| 4   | `router.load()` called before `RouterProvider` mounts isn't repeated by the provider (Transitioner skips when the location has resolved, or a load is in flight).                                                                                                                                          | Internal                                                                                                                                           | "router.load() before RouterProvider mounts…"; the reload tests                                                                  |
| 5   | Hash history writes the location into `location.hash` (`#/two?view=board`), which main's `lastPageOf` reads, and the entry's index sits in `window.history.state`, so it survives a reload.                                                                                                                | Documented (hash history); the state layout is internal                                                                                            | "hash history writes the location into the URL's hash…"                                                                          |
| 6   | Memory history runs no blocker on Back or Forward (blockers run for push and replace, or in the browser's `popstate`).                                                                                                                                                                                     | Internal; the reason blockers were rejected                                                                                                        | "memory history runs no blocker on Back…"                                                                                        |
| 7   | On the first load the router renders nothing until its loaders are done, unless the root has pending UI. The root's pending UI is offered only while the root itself is still loading, so the root needs a `beforeLoad` (the guard). The `shellComponent` then renders during the load and never remounts. | `shellComponent` and `pendingComponent` are documented; the first-load rule is internal (`load-client.js`, the `!router._committed.length` branch) | "a root shellComponent renders during the first load only when…"; "with a slow loader, shows the splash until the page is ready" |
| 8   | The root match persists across navigations, so its shell doesn't remount.                                                                                                                                                                                                                                  | Documented (matches are kept by id)                                                                                                                | the mount counts in both test files                                                                                              |

If 7 changed, a slow reload would show a blank window instead of the splash until the page is
ready. That's a benign degradation, and the test would catch it. If 4 changed, a reload would run
its loaders twice, which React Query absorbs.

## Tests and results

`npm test -- src/renderer/tests/router`: **21 passed** (about 11 s, real timers). The whole suite:
**2343 passed, 6 skipped, 0 failed**. The router tests passed in 3 repeat runs. `npm run typecheck`,
`eslint src/renderer` and `npm run format:check` are clean, and `npm run build:renderer` builds.

The harness (`tests/router/harness.ts`) mounts the real IPC client (`ipcLink` over a fake bridge),
query cache, invalidator, session and route tree, with memory history. `FakeMain`
(`tests/router/fake-main.ts`) mirrors three things from main:

- `WorkspaceService`'s order of events (opening, closed, opened or openFailed).
- The `ChangeTracker`'s `{ id, opening }` payloads.
- `last-page.ts`: it follows the URL through `history.subscribe` and saves it on `closed`.

A MutationObserver records every page or splash inserted, and every change inside a page.

| Scenario                                                    | What it asserts                                                                                                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch to a page whose loader is slow                       | No page right after `opening`; A.lastPage = `/app/notes`; at 900 ms the splash is still up with no page; after the loader: only `splash`, then `/app/tasks` with B's rows, drawn once; shell mounted once |
| Minimum splash time                                         | Page drawn ≥ 595 ms after the splash                                                                                                                                                                      |
| Switch with "Reopen last page" off                          | B lands on `defaultLandingPage` (`/app/notes`), not its last page                                                                                                                                         |
| Startup, setting on                                         | Lands on `/app/tasks?limit=50` (A's last page); drawn: `splash`, then the page; Back disabled                                                                                                             |
| Startup, setting off                                        | Lands on `/app/notes` (the default)                                                                                                                                                                       |
| Startup, nothing to reopen                                  | Onboarding, listing the workspaces                                                                                                                                                                        |
| Reload                                                      | Same page; no events, nothing reopened; drawn directly                                                                                                                                                    |
| Reload onto a slow page                                     | Splash until the loader is done, then the page                                                                                                                                                            |
| Failed switch                                               | Onboarding with `failed = B`; A's last page saved; drawn: `splash`, then onboarding                                                                                                                       |
| Failed reopen at startup                                    | Onboarding                                                                                                                                                                                                |
| Workspace closing                                           | Page replaced by the splash, then onboarding; last page saved                                                                                                                                             |
| Back at B's first page                                      | Button disabled; clicking does nothing; within B, Back works                                                                                                                                              |
| `history.back()` / `go(-1)` / `forward()` past the boundary | Always B's `/app/home`; nothing new drawn; nothing with A's rows                                                                                                                                          |
| Back pressed during the switch                              | Nothing drawn but the splash and B's landing page                                                                                                                                                         |

## Main-process changes

**None needed.** The design works with `workspace.changed` as it is and with `last-page.ts` as it
is, because the renderer leaves the URL alone until `opened`. Two optional changes:

- **Carry the opened workspace's info in the event** (`{ id, opening, workspace: WorkspaceInfo |
null }`). This would save `land()` its `workspaces.current` fetch, and the check that the answer
  is still the workspace the event named. It's a small saving; the fetch works.
- **Say why an open failed in the event** (`failed: { id, code }`). Today the session knows _which_
  workspace failed (the one that was opening) but not _why_. The `workspaces.open` caller gets the
  error, but a switch from the menu or another window has no caller in this window.

The plan's `/app` and `/onboarding` guards and its `/` boot route are replaced by the one root
guard and the session. The plan's sections "Root route", "Boot", "Guards" and "Back and forward"
would need rewriting if this design is adopted.

## Open questions and risks

- **Back before a reload.** After a reload, `firstIndex` is the current entry, so Back stops there
  even if the entries before it were the same workspace's. It's conservative and simple. Keeping
  `firstIndex` in `sessionStorage` per workspace would lift it, at the cost of one more piece.
- **Navigation during the splash.** A raw `history.back()` while a workspace is opening (only
  devtools or future code can do it, since the UI is covered) moves the URL before A has closed,
  so main would save that page as A's last. Nothing wrong is drawn (tested). If it matters, the
  app's own back/forward helper should refuse while `busy` (`canGoBack` already does).
- **Toasts and dialogs across a switch.** The splash replaces the whole route tree. App-wide
  hosts that must survive a switch (an error toast for the failed open, say) belong in the shell,
  next to the gate, not in the root's component.
- **Internal behaviours 4 and 7.** Both are covered by tests that fail loudly on an upgrade. Pin
  the router version, and read these two tests when upgrading.
- **Not built here:**
  - File-based routes. The plugin is not installed; the prototype's tree is code-based in
    `routes.tsx`. The root, the guard and the session carry over unchanged.
  - The real `AppShell`. `/app`'s layout is a placeholder with a Back button.
  - `devBrainAvailable: false` (the root should render the error screen instead of the tree;
    that's a branch in the shell).
  - `ensureOrNotFound` on detail pages.
- **`App.tsx` is now unused.** `main.tsx` renders the router. The test bench is left in place for
  reference; delete it when `/app` renders the real shell.
- **Unreachable docs.** tanstack.com is blocked in this session's network, so the "documented"
  column comes from the package's public types and JSDoc. Check it against the live docs before
  relying on it.

## Files on the branch

- `package.json` / `package-lock.json`: `@tanstack/react-router` 1.170.46, exact. Prettier is
  unchanged at 3.8.4; the plugin isn't installed.
- `src/renderer/router/session.ts`: `WorkspaceSession`, `landingPage`.
- `src/renderer/router/routes.tsx`: the route tree, the root route (guard, shell, splash) and
  placeholder pages; `createAppRouter`.
- `src/renderer/main.tsx`: builds the session and the hash-history router, and renders
  `RouterProvider`.
- `src/renderer/tests/router/fake-main.ts`, `harness.ts`, `workspace-session.test.ts`,
  `library-behaviour.test.ts`.
