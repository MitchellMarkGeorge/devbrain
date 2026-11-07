# Routing and workspaces

How the renderer's router and the open workspace fit together. The rules a new route must follow are
in `CLAUDE.md` ("Routing"); the plan the pages are built from is
[implementation-plan.md](implementation-plan.md).

## The model

**The URL says which workspace the window shows.** Every page in a workspace is under
`/app/<its id>/…` (`/app/wsp_…/tasks`); `/onboarding/*` is for when none is open. The renderer
knows nothing about "the last workspace": its job is to render the workspace its route names, and
to open it when it isn't open.

- **Main picks the window's first URL** (`initialRoute`, `src/main/runtime/last-page.ts`): the open
  workspace's when one is open (a window made again on macOS), else the workspace open last time
  (`state.lastWorkspaceId`), at `/app/<id>`, or straight on its last page when "Reopen last page"
  (`general.openToLastPage`) is on and its manifest has one. With none, a deleted one, or no
  DevBrain, `/onboarding`. Main opens nothing at startup.
- **`/app/$workspaceId` opens the workspace** its URL names when it isn't the open one
  (`openWorkspaceOf`, `src/renderer/pages/app/workspace-route.ts`), under the splash, in its
  `beforeLoad`, so every loader below runs against it. When it is open (a reload, a navigation
  within it), nothing.
- **`/app/$workspaceId/` (the index)** is the workspace's link: it redirects to the workspace's last
  page (setting on, and the page is that workspace's) or `/app/<id>/<defaultLandingPage>`
  (`landingHref`, `src/renderer/workspace/landing.ts`).
- **Switching is navigating** to the workspace's link: the sidebar's workspace menu, onboarding's
  lists, Create (create, then navigate), Open Existing Folder (add, then navigate). Back and Forward
  to another workspace's page just open that workspace again.
- **One router**, made once in `main.tsx` with hash history and never made again: not at startup,
  during a switch, or on onboarding. Hash history because the page loads from `file://`, and
  because main reads the page from the window's URL.

`workspaces.openLast` is gone: nothing in the renderer decides which workspace to open on its own.

## The pieces

| Piece                                 | Where                                        | Role                                                                                 |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `createAppRouter`                     | `src/renderer/router.tsx`                    | The router, its options and context                                                  |
| `ensureWorkspaceOpen`, `isSettledOn`  | `src/renderer/workspace/open.ts`             | Which workspace main has open, as `workspace.changed` says; opening one              |
| `openWorkspaceOf`                     | `src/renderer/pages/app/workspace-route.ts`  | `/app/$workspaceId`'s beforeLoad: skips preloads, opens the workspace                |
| `SplashProvider`                      | `src/renderer/pages/root/SplashProvider.tsx` | The one splash, around the router in `main.tsx`; says whether it is up               |
| `useSwitchingWorkspace`, `useHeldFor` | `src/renderer/pages/root/use-splash.ts`      | Whether the router is on its way to another workspace; the 600ms hold                |
| `RootLayout`                          | `src/renderer/pages/root/Root.tsx`           | Toasts; the page, none while the splash is up; outside changes; DevBrain unavailable |
| `initialRoute`, `saveLastPageOnClose` | `src/main/runtime/last-page.ts`              | The window's first route; the last page of each workspace, saved as it closes        |

Routes (`src/renderer/routes`, file-based, generated into `src/renderer/routeTree.gen.ts`, which is
checked in; `npm run routes` regenerates it without a build):

```
__root                         toasts, splash, DevBrain unavailable, not found
├── /                          redirect: the open workspace, or onboarding
├── /onboarding                layout; with a workspace open, redirects to it
│   ├── /                      Welcome
│   ├── /new_workspace         Create workspace
│   └── /choose_workspace      Choose workspace (all, paged)
└── /app/$workspaceId          opens the workspace; AppShell + sidebar; its error is the open's
    ├── /                      redirect: last page or landing page
    └── /home, /tasks, /projects, /notes, /calendar, /integrations, /trash, /settings
```

## How a switch flows

From Work's tasks page, the menu picks Home:

1. `navigate({ to: '/app/$workspaceId', params: { workspaceId: home } })`. The router moves the URL
   to `#/app/<home>` at once, then loads.
2. The router turns pending with a location in another workspace than the one on screen
   (`useSwitchingWorkspace`). `SplashProvider`, around the router, puts up **the splash**, and the
   root, reading that it is up (`useSplashVisible`), **draws no page**. Work's page is unmounted,
   so it is never drawn again, and its queries, no longer mounted, never refetch. The splash is all
   the window holds: nothing behind it for focus or a screen reader to reach. (React renders this as the router's state changes, well before main's first event
   comes back; that ordering isn't enforced in code, and the "never draws the old page" test
   checks it.)
3. The root's `beforeLoad` runs (it runs on every navigation), then `/app/$workspaceId`'s:
   `ensureWorkspaceOpen(home)` sees Work open and calls `workspaces.open({ id: home })`. Main sends
   `workspace.changed` three times before answering (`{work, home}`, `{null, home}`,
   `{home, null}`); `open.ts` follows them, and the query invalidator drops Work's cached data. The
   answer is Home's `WorkspaceInfo`, put in `workspaces.current`'s cache.
4. The index route redirects to Home's last page or landing page; that page's loaders prime its
   queries.
5. The router turns idle once the last navigation has resolved. Once the splash has also shown for
   600ms it goes, and in the same render the root draws Home's page, with its data. At startup the
   router draws nothing until its first load is done; the splash, outside it, is there from the
   first frame. A reload is no switch (the workspace is open as the page loads): no splash.

Going to a workspace that's already open from another's page (Back after a failed open, an open
made elsewhere) counts as a switch too, and shows the splash briefly; nothing reopens.

If the open fails, `/app/$workspaceId`'s error component says why, by core's error code
(`WorkspaceOpenError`): a missing folder, an unknown workspace, a database from a newer DevBrain, a
failed migration. When it failed before anything closed (a missing folder), the workspace open
before still is, and "Back to ‹name›" returns to it; otherwise "Choose a Workspace" goes to
onboarding.

**Rapid Back and Forward.** Each navigation supersedes the last (the router aborts its wait), but
the opens it started still run in main, one at a time (`WorkspaceService` serialises them).
`ensureWorkspaceOpen` joins an open under way for the same workspace and queues one for another, even one
that was open a moment ago, so the last navigation's workspace ends up open.

**Changes that come from no navigation** reach `RootLayout` as `workspace.changed` outside any open
of its own: the open workspace deleted or closed (the window goes to `/onboarding`), or another
workspace opened elsewhere (the window goes to its link, which finds it open).

**Preloads never open a workspace.** With `defaultPreload: 'intent'`, hovering a link runs its
route's `beforeLoad` and loaders. A preload into a workspace that isn't settled open (or while one
opens) throws `PreloadSkipped` from `/app/$workspaceId`'s `beforeLoad`, which ends it before any
loader of its pages runs: they would read whichever workspace is open now. Preloads within the open
workspace prime its pages as usual.

**Startup** is the same flow on the first load: the window opens on `#/app/<id>`, nothing is open,
so the route opens it under the splash. On a reload the initial load context says it is open
already: no open, no splash.

## Remembering the page

Each workspace keeps the last page shown in it in its folder's manifest (`workspace.json`,
`WorkspaceInfo.lastPage`), e.g. `/app/wsp_…/tasks?view=board`. The page names its workspace, and
`WorkspaceService.setLastPage` refuses another workspace's.

Main follows the window's navigations (`did-navigate`, `did-navigate-in-page`) and keeps **the last
page seen in each workspace**, then saves the closing workspace's own page when it closes (on a
switch, a delete, quit; the window hears nothing of the quit's close). It must be kept per workspace: the URL moves to the next workspace's page as
a switch starts, before the old one closes. Main reads it back for the window's first route, and the
index route reads it from the opened workspace's info. Nothing goes over IPC as the user navigates.

## TanStack Router behaviours relied on

Checked against `@tanstack/react-router` 1.170.46 in `src/renderer/tests/routing/tanstack-behaviour.test.ts`;
when one fails after an upgrade, revisit the part of the design that names it.

| Behaviour                                                                                                                | Documented                        | Relied on for                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| `router.navigate()` resolves once the target's loaders are done and its page has rendered                                | Partly (it returns a promise)     | Tests that await a navigation                                                |
| The root's `beforeLoad` runs on every navigation, Back and Forward included                                              | Yes (beforeLoad runs per load)    | The DevBrain-unavailable guard                                               |
| On the first load nothing is drawn until loaders finish, unless the root has a `pendingComponent` **and** a `beforeLoad` | No                                | Why the splash is outside the router: it covers the first load               |
| A `beforeLoad` that throws during a preload stops it: no loader below runs, nothing is logged                            | No (preload errors are swallowed) | Preloads never opening a workspace                                           |
| `onResolved` fires for the last of several navigations only, and once after a redirect                                   | No                                | Settling the splash                                                          |
| The URL moves before the target's `beforeLoad` runs                                                                      | No                                | Main keeping the last page per workspace                                     |
| `redirect({ href })` to an in-app path keeps its search params                                                           | Yes                               | The index route's redirect to the last page                                  |
| A slow sibling's `pendingComponent` shows after `pendingMs`, React hiding the old page under it                          | Partly                            | Pending UI for slow pages (`PagePending`, `defaultPendingMs: 150`)           |
| A preload's location has no history index (`__TSR_index`)                                                                | No                                | Nothing yet: don't read the history index in a preload                       |
| Memory history runs no blockers on Back and Forward                                                                      | No                                | Nothing yet: test a navigation blocker with hash history, not memory history |

An earlier exploration (1.170.46 too) saw a sibling's pending component never show; with the
router's `defaultPendingComponent` it does here, so no pending bar of our own was needed.

## Tests

- **Main:** `src/main/tests/runtime/start.test.ts` (`initialRoute`) and `last-page.test.ts` (pages
  per workspace, saved at close), `src/main/core/tests/workspace` (`setLastPage`).
- **Renderer:** `src/renderer/tests/routing` runs the real route tree, IPC client, cache and
  invalidator over a fake main (`fake-main.ts`, which opens workspaces with core's events) and
  memory history: startup (setting on and off, no workspace, a reload, no initial load context,
  DevBrain unavailable), switches (the old page never drawn, watched with a `MutationObserver`; the
  splash held until a slow page is ready, and for 600ms), the menu, onboarding, Create and Open
  Folder with each error dialog, failed opens before and after the old workspace closed, deleting
  the open workspace, Back and Forward, rapid navigation, and preloads.
  `src/renderer/tests/workspace` unit-tests `open.ts` and the helpers.

## Not handled: two windows

Two windows on different workspaces would fight: main has one workspace open at a time, so each
window's route would keep reopening its own. Today there is one window. A second one needs either
one workspace per window in main, or windows that follow the open workspace rather than open their
own.
