# Routing and workspaces

How the renderer's router and the open workspace fit together. The rules a new route must follow are
in `CLAUDE.md` ("Routing"); the plan the pages are built from is
[implementation-plan.md](implementation-plan.md).

## The model

**The URL says which workspace the window shows.** Every page in a workspace is under
`/app/<its id>/…` (`/app/wsp_…/tasks`); `/onboarding/*` is for when none is open, and
`/workspaces/new` (Create workspace) names none either way: see [Create workspace](#create-workspace). The renderer
knows nothing about "the last workspace": its job is to render the workspace its route names, and
to open it when it isn't open.

- **Main picks the window's first URL** (`initialRoute`, `src/main/runtime/last-page.ts`): the open
  workspace's when one is open (a window made again on macOS), else the workspace open last time
  (`state.lastWorkspaceId`), at `/app/<id>`, or straight on its last page when "Reopen last page"
  (`general.openToLastPage`) is on and its manifest has one. With none, a deleted one, or no
  DevBrain, `/onboarding`. Main opens nothing at startup.
- **`/app/$workspaceId` opens the workspace** its URL names when it isn't the open one
  (`openWorkspaceOf`, `src/renderer/app/workspace-route.ts`) in its `beforeLoad`, so every
  loader below runs against it, with the splash as its pending component. When it is open (a reload, a navigation
  within it), nothing.
- **`/app/$workspaceId/` (the index)** is the workspace's link: it redirects to the workspace's last
  page (setting on, and the page is that workspace's) or `/app/<id>/<defaultLandingPage>`
  (`landingHref`, `src/renderer/shared/lib/workspace/landing.ts`).
- **Switching is navigating** to the workspace's link: the sidebar's workspace menu, onboarding's
  lists, Create workspace (create, then navigate, replacing the form in the history), Open
  Existing Folder (add, then navigate).
- **Back and Forward stay within a workspace.** On a workspace's page the window bar's arrows, and
  a detail page's Back, count only the history entries of the workspace shown
  (`useHistoryPosition`, from which workspace each entry shows, recorded by its
  `HistoryPositionProvider` around the router in `AppWindow`). So after a switch Back is off until
  you move within the new workspace, and it never reopens the old one. The history itself can't be
  cleared, so the entries before the switch are still there: a traversal that reaches one anyway
  opens that workspace again, as any navigation to its link does. A failed open's "Back to ‹name›"
  leaves the workspace on purpose and counts every entry (`acrossWorkspaces`). After a reload the
  entries before it aren't known, and don't count.
- **One router**, made once in `main.tsx` with hash history and never made again: not at startup,
  during a switch, or on onboarding. Hash history because the page loads from `file://`, and
  because main reads the page from the window's URL.

`workspaces.openLast` is gone: nothing in the renderer decides which workspace to open on its own.

## The pieces

| Piece                                 | Where                                                     | Role                                                                            |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `createAppRouter`                     | `src/renderer/app/router.tsx`                             | The router, its options and context                                             |
| `followOutsideChanges`                | `src/renderer/app/router.tsx`                             | A delete or an open elsewhere moves the window                                  |
| `openWorkspaceOf`                     | `src/renderer/app/workspace-route.ts`                     | `/app/$workspaceId`'s beforeLoad: skips preloads, opens (taking 600ms at least) |
| `Splash`, `SPLASH_DELAY_MS`           | `src/renderer/app/Splash.tsx`                             | `/app/$workspaceId`'s pending component, and when it shows                      |
| `AppWindow`                           | `src/renderer/app/AppWindow.tsx`                          | The router, or the DevBrain-unavailable screen in its place                     |
| `RootLayout`, `useSwitchingWorkspace` | `src/renderer/app/Root.tsx`, `use-switching-workspace.ts` | Toasts, dialogs and the page; dialogs dropped as a switch starts                |
| `initialRoute`, `saveLastPageOnClose` | `src/main/runtime/last-page.ts`                           | The window's first route; the last page of each workspace, saved as it closes   |

There is no state of the renderer's own about which workspace is open: it is `workspaces.current`
in React Query's cache, seeded from the initial load context, set by an open's answer, and marked
stale by `workspace.changed` (the query invalidator).

Routes (`src/renderer/routes`, file-based, generated into `src/renderer/routeTree.gen.ts`, which is
checked in; `npm run routes` regenerates it without a build):

```
__root                         toasts, dialogs, not found
├── /                          redirect: the open workspace, or onboarding
├── /onboarding                layout; with a workspace open, redirects to it
│   ├── /                      Welcome
│   └── /choose_workspace      Choose workspace (all, paged)
├── /workspaces/new            Create workspace: from Welcome, and from the app over the open one
└── /app/$workspaceId          opens the workspace, under the splash (its pending component);
    │                          WorkspaceShell + sidebar; its error is the open's
    ├── /                      redirect: last page or landing page
    ├── /home, /tasks, /projects, /notes, /calendar, /trash
    ├── /integrations          redirect: /settings/integrations (an older link)
    └── /settings              the settings' sidebar in place of the app's (AppLayout)
        ├── /                  redirect: /general, or an older ?tab's section
        └── /general, /integrations, /import-export      the open workspace's
            /preferences, /tasks, /calendar, /data-storage   every workspace's
```

**Settings is a mode of the workspace layout.** While a page under `/settings` is shown,
`AppLayout` gives the shell `SettingsSidebar` instead of `AppSidebar`: Back to app, then a page
per section, the open workspace's (Current workspace: what its database and accounts hold) apart
from every workspace's (All workspaces: what the DevBrain folder's settings file holds). Back to
app goes to the last page shown outside the settings (`resolvedLocation`, so a `/settings` that
is about to redirect isn't taken for one), or Home. The pages are ordinary routes, so Back and
Forward, links and "Reopen last page" work per section.

## How a switch flows

From Work's tasks page, the menu picks Home:

1. `navigate({ to: '/app/$workspaceId', params: { workspaceId: home } })`. The router moves the URL
   to `#/app/<home>` at once, then loads.
2. The URL's workspace (`state.location`) is no longer the one the router last finished on
   (`state.resolvedLocation`), so `RootLayout` drops any dialog (`useSwitchingWorkspace`): it
   belonged to Work.
3. `/app/$workspaceId` loads again for Home's id. Its `beforeLoad`, `openWorkspaceOf`, reads
   `workspaces.current` (Work), so it calls `workspaces.open({ id: home })`, and waits for it and
   for 600ms together (`Promise.all`). **The splash**, the route's pending component, shows
   `SPLASH_DELAY_MS` (50ms) in, so for 550ms at least. Work's page stays mounted under it, hidden
   by React, and is never drawn again; its queries don't refetch, as the query invalidator removes
   their data (`removeQueries`) rather than marking it stale. Main sends `workspace.changed` three
   times before answering (`{work, home}`, `{null, home}`, `{home, null}`), and the answer, Home's
   `WorkspaceInfo`, is put in `workspaces.current`'s cache: the next page's loaders fetch from Home.
4. The index route redirects to Home's last page or landing page; that page's loaders prime its
   queries.
5. The navigation resolves: the splash goes (once shown, it stays until Home's page has loaded,
   however slow its loader), and Home's page is drawn with its data.

Going to a workspace that's already open from a page outside it (Back from Create workspace, Back
after a failed open, an open made elsewhere) opens nothing, so it's done well inside
`SPLASH_DELAY_MS` and the splash never shows.

If the open fails, `/app/$workspaceId`'s error component says why, by core's error code
(`WorkspaceOpenError`): a missing folder, an unknown workspace, a database from a newer DevBrain, a
failed migration. The route asks main which workspace is open before it throws, so the page knows:
when the open failed before anything closed (a missing folder), the workspace open before still
is, and "Back to ‹name›" returns to it; otherwise "Choose a Workspace" goes to onboarding.

**Rapid Back and Forward.** Each navigation supersedes the last (the router aborts its wait), but
the opens it started still run in main, one at a time and in order (`WorkspaceService` serialises
them), so the last navigation's workspace ends up open. Opens aren't merged: the same workspace can
be opened twice in a row.

**Changes that come from no navigation** arrive as `workspace.changed` while the router is idle
(`followOutsideChanges`): the open workspace deleted or closed (the window goes to `/onboarding`),
or another workspace opened elsewhere (the window goes to its link, which finds it open). Events
while the router loads belong to this window's own open, whose route shows how it ended.

**Preloads never open a workspace.** With `defaultPreload: 'intent'`, hovering a link runs its
route's `beforeLoad` and loaders. A preload into a workspace that isn't open throws `PreloadSkipped`
from `/app/$workspaceId`'s `beforeLoad`, which ends it before any loader of its pages runs: they
would read whichever workspace is open now. Preloads within the open workspace prime its pages as
usual. (During a switch nothing can be hovered: the splash is all the window shows.)

**Startup** is the same flow on the first load: the window opens on `#/app/<id>`, nothing is open,
so the route opens it under the splash. The router draws nothing of its own until the splash
comes up, so the window is empty for those 50ms, then the splash is all it holds. On a reload the
initial load context says the workspace is open already: nothing reopens, and there is no splash.
Nor is there one when the window starts on onboarding or Create workspace, which open nothing.

**DevBrain unavailable.** When DevBrain couldn't open its data folder, the initial load context
says so (`devBrainAvailable: false`), and `AppWindow` draws that screen in place of the router,
which is never mounted: no route's `beforeLoad` or loader runs. The window can't recover without
reopening DevBrain, so it needs no route of its own. The root has no `beforeLoad`, which is what
lets `/app/$workspaceId`'s pending component show on the first load (see the table below).

## Create workspace

Create workspace is a page of its own, `/workspaces/new`: the form on its card in an `AppShell`
(no sidebar), reached
from Welcome's "Create Workspace" and from the workspace menu's "New workspace…". Its URL names no
workspace, so going there opens and closes nothing: from the app, the workspace stays open behind
it until the new one is created. Creating navigates to the new workspace's link with `replace`, so
the form isn't in the history after it, and that link opens it under the splash as any switch does.
The card's Back (and Esc) goes back in the history, or, with no entry
before it, to the open workspace's link or `/onboarding`.

Why a page rather than the dialog it was: the form gets the whole window, as the step it is (the
workspace you're in is about to close), the same page serves onboarding and the app, and it is a
location like any other, with Back and Forward.

- **Going back is no switch.** Back to the workspace still open opens nothing, so it ends before
  `SPLASH_DELAY_MS` and no splash shows.
- **Outside changes** are left alone: `followOutsideChanges` reads the URL only, and Create
  workspace's names none. Nothing realistic closes the workspace behind the form; if something
  does, Back finds it gone and its route shows the error, as for any page.
- **Last page:** main keeps pages under `/app/<id>` only, so the window never reopens on the form.
- **Not a page in the workspace:** `/app/$workspaceId/…` would draw the old workspace's sidebar
  around a form for another workspace, save the form as its last page, and need a pathless layout
  to drop the sidebar; and `/onboarding` redirects to the open workspace, so it can't host it.

## Remembering the page

Each workspace keeps the last page shown in it in its folder's manifest (`workspace.json`,
`WorkspaceInfo.lastPage`), e.g. `/app/wsp_…/tasks?view=board`. The page names its workspace, and
`WorkspaceService.setLastPage` refuses another workspace's.

Main follows the window's navigations (`did-navigate`, `did-navigate-in-page`) and keeps **the last
page seen in each workspace**, then saves the closing workspace's own page when it closes (on a
switch, a delete, quit). It must be kept per workspace: the URL moves to the next workspace's page as
a switch starts, before the old one closes. Main reads it back for the window's first route, and the
index route reads it from the opened workspace's info. Nothing goes over IPC as the user navigates.

## Scrolling

Pages scroll inside `WorkspaceShell`, never the window, and each page has one scroller
(`docs/design-system/components/Page.md`): a Home or document page's `PageContent`, a list, the
board, a project's Overview. The rule: **a page is a place, and is as it was left however it is
gone back to.** Back, a sidebar link, a key (G T) and a search result never disagree about how a
page is shown, because none of them is asked: its state is kept under the page's path, not under
the history entry or the way taken to it.

- **Where it scrolled** is the router's scroll restoration, keyed by path (and the visit, below)
  (`getScrollRestorationKey` in `app/router.tsx`), not by history entry (its default, which only
  Back and Forward return to). A sheet opened over a page, a filter and a sort change the search,
  not the path, so the page stays where it is.
- **A page starts at the top the first time it is shown, never at the last page's place.** After
  a navigation the router copies the last key's positions to a key with none, for each element at
  the same place in the DOM (it names an element by its `nth-child` steps, not by what it is), so
  what stays (the sidebar) stays where it was; a page's scroller would take the last page's, the
  Notes grid opening as far down as the task list was. The page's scroller
  (`PAGE_SCROLLER_SELECTOR`, the first `ScrollArea` in the `Page`) is the router's
  `scrollToTopSelectors`, which spares it the copy and scrolls it to the top unless the router
  restored a place of its own for it.
- **Two scrollers at the same place are named apart.** The router puts a saved place back on
  whatever is at that place in the DOM. The Tasks list and the grouped list draw their scroller at
  the same place, under the one path, so the grouped list would open as far down as the list was;
  each `TaskList` in `TaskListFrame` carries its own `data-scroll-restoration-id` (`task-list`,
  `grouped-task-list`), which the router keeps a place under instead. Name a new view's scroller
  the same way when it takes another's place in the DOM. (The board, the cards, and a project's
  tabs draw theirs elsewhere. The calendar's week and day grids share one, which keeps the same
  hours in view.)
- **Its view and filters** are its search as it was last shown, without what opens a sheet
  (`open`, `occurrence`, `sheet`): the root layout keeps them by path (`app/page-searches.tsx`),
  and `AppSidebar`'s links and the keys that go to a page use it (`search` as a function on the
  links, read as the link is followed, so never a step behind the page drawn).

Both last until another workspace is shown: one switched back to starts afresh, its pages at
their tops and in their own views. The router's saved places can't be dropped, so the scroll key
carries which visit to a workspace this is (`visit`, which goes up as a navigation crosses into
another workspace, after the router has saved the last page under the old one), and the old keys
are never asked for again; the root layout drops the searches it kept. Two limits:

- The router restores a place once, as the page renders. A page whose content arrives later is
  shorter then, and stops short of where it was: a list changed to from the board.
- A history entry keeps its own URL, so Back to an older entry of a section shows the filters it
  had then, not its latest.

`e2e/flows/scrolling.spec.ts` checks it in the built app; jsdom doesn't scroll.

## TanStack Router behaviours relied on

Checked against `@tanstack/react-router` 1.170.46 in `src/renderer/tests/routing/tanstack-behaviour.test.ts`;
when one fails after an upgrade, revisit the part of the design that names it.

| Behaviour                                                                                                                | Documented                        | Relied on for                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| `router.navigate()` resolves once the target's loaders are done and its page has rendered                                | Partly (it returns a promise)     | Tests that await a navigation                                                |
| The root's `beforeLoad` runs on every navigation, Back and Forward included                                              | Yes (beforeLoad runs per load)    | Nothing now (the DevBrain-unavailable check moved out of the router)         |
| On the first load nothing is drawn until loaders finish, unless the root has a `pendingComponent` **and** a `beforeLoad` | No                                | Nothing now (the root has neither)                                           |
| On the first load a child route's `pendingComponent` shows, unless the root has a `beforeLoad`                           | No                                | The splash at startup: why the root has no `beforeLoad`                      |
| With `pendingMs: 0` a new match's `pendingComponent` shows even when its load is instant                                 | No                                | Why `SPLASH_DELAY_MS` is 50, not 0: Back from Create workspace never flashes |
| A `beforeLoad` that throws during a preload stops it: no loader below runs, nothing is logged                            | No (preload errors are swallowed) | Preloads never opening a workspace                                           |
| `onResolved` fires for the last of several navigations only, and once after a redirect                                   | No                                | Nothing now (the first version settled its splash on it)                     |
| `state.location` moves as a navigation starts, `state.resolvedLocation` once it has loaded                               | Partly                            | `useSwitchingWorkspace`: dropping dialogs as a switch starts                 |
| A route whose params change loads again with its `pendingComponent`; the old page stays mounted, hidden, and is reused   | Partly                            | The splash on a switch, over the old page; `remountDeps` against the reuse   |
| The URL moves before the target's `beforeLoad` runs                                                                      | No                                | Main keeping the last page per workspace                                     |
| `redirect({ href })` to an in-app path keeps its search params                                                           | Yes                               | The index route's redirect to the last page                                  |
| A slow sibling's `pendingComponent` shows after `pendingMs`, React hiding the old page under it                          | Partly                            | Pending UI for slow pages (`PagePending`, `defaultPendingMs: 150`)           |
| Each history entry has its index (`__TSR_index`); `history.length` counts the entries after it until a new navigation    | Typed, not described              | `useHistoryPosition`: the window bar's arrows, a detail page's Back          |
| A preload's location has no history index (`__TSR_index`)                                                                | No                                | Nothing yet: don't read the history index in a preload                       |
| Memory history runs no blockers on Back and Forward                                                                      | No                                | Nothing yet: test a navigation blocker with hash history, not memory history |
| Scroll restoration names an element by its DOM path, or by its `data-scroll-restoration-id`                              | No                                | Naming the task lists apart (`TaskListFrame`)                                |
| It copies the last key's positions to a key with none, but not to `scrollToTopSelectors`'s elements                      | No                                | A page first shown never at the last one's place                             |
| It restores what it saved for a key (`getScrollRestorationKey`) before scrolling `scrollToTopSelectors`'s to the top     | No                                | A page gone back to by any way being where it was left                       |
| A `Link`'s `search` function is called as the link is followed (and preloaded), not only as it renders                   | Partly (functional `search`)      | The sidebar's links reading each page's last search as it is now             |

The scroll restoration rows need a browser that scrolls, so `e2e/flows/scrolling.spec.ts` checks
them in the built app instead; jsdom doesn't scroll.

An earlier exploration (1.170.46 too) saw a sibling's pending component never show; with the
router's `defaultPendingComponent` it does here, so no pending bar of our own was needed.

## Tests

- **Main:** `src/main/tests/runtime/start.test.ts` (`initialRoute`) and `last-page.test.ts` (pages
  per workspace, saved at close), `src/main/core/tests/workspace` (`setLastPage`).
- **Renderer:** `src/renderer/tests/routing` runs the real route tree, IPC client, cache and
  invalidator over a fake main (`fake-main.ts`, which opens workspaces with core's events) and
  memory history: startup (setting on and off, no workspace, a reload, no initial load context,
  DevBrain unavailable), switches (the old page never shown and never refetching, watched with a
  `MutationObserver`; the splash held until a slow page is ready, and for 600ms), the menu, onboarding, Create workspace (from
  Welcome and from the app: Back and Esc with no splash, the history after creating) and Open Folder with each error dialog, failed opens before and after the old workspace closed, deleting
  the open workspace, Back and Forward, rapid navigation, and preloads.
  `src/renderer/tests/workspace` unit-tests the helpers, and
  `src/renderer/tests/ipc/query-invalidator.test.ts` the dropping of a workspace's data.

## Not handled: two windows

Two windows on different workspaces would fight: main has one workspace open at a time, so each
window's route would keep reopening its own. Today there is one window. A second one needs either
one workspace per window in main, or windows that follow the open workspace rather than open their
own.
