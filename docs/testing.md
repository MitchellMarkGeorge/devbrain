# Testing

DevBrain's tests come in layers, from fast and narrow to slow and whole. Each change is tested at the
lowest layer that can see it; the end-to-end tests cover only what needs every part running at once.

| Layer        | Where                                                        | Runs on                                   | Command       |
| ------------ | ------------------------------------------------------------ | ----------------------------------------- | ------------- |
| Core         | `src/main/core/tests`                                        | Vitest, on Electron's Node, real SQLite   | `npm test`    |
| Main and IPC | `src/main/tests` (`ipc/`, `runtime/`)                        | Vitest, with an Electron mock             | `npm test`    |
| Migrations   | `src/main/core/tests/db/migrations.test.ts`                  | Vitest: a database seeded at an older one | `npm test`    |
| Renderer     | `src/renderer/tests` (`routing/`, `features/`, `editor/`, …) | Vitest and happy-dom, with a fake main    | `npm test`    |
| End to end   | `e2e/flows`, `e2e/upgrade`                                   | Playwright, the built app under Electron  | `npm run e2e` |

`npm test` runs Vitest on Electron's Node (`scripts/vitest.mts`), so core's tests load the same
better-sqlite3 build as the app. The renderer's route tests (`src/renderer/tests/routing`) run the
real route tree over a fake main; [routing.md](renderer/routing.md) says what they cover.

## End to end

The end-to-end tests start the real app, built by `npm run build` and run as `electron .`, on a
DevBrain folder of their own in the system's temporary directory, and drive its window with
[Playwright's Electron support](https://playwright.dev/docs/api/class-electron). Nothing is faked:
main, core, SQLite, the note files and the renderer all run as they do for a user. They never touch
a developer's own folder (`.dev`, `~/.devbrain`), and each test gets its own Electron user data
directory, so a DevBrain you have open doesn't stop them (its single-instance lock is per directory).

```sh
npm run e2e                                  # build, then run every test
npm run e2e -- --no-build                    # run against the app already in dist/
npm run e2e -- --no-build e2e/flows/tasks.spec.ts
npm run e2e -- --no-build -g "first run"     # by title
npm run e2e -- --no-build --trace on         # keep a trace of every test, not only failures
npm run e2e -- --no-build --repeat-each=5    # hunt for a flaky test
```

On Linux without a display (CI, a container) the script runs Playwright under Xvfb (`xvfb-run`). On
macOS and on a Linux desktop the app's window opens on your screen while the tests run.

### The flows

`e2e/flows` holds one test per flow a user goes through:

| Test          | What it does                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-run`   | Welcome → Create workspace → Home, on an empty folder                                                                                                                     |
| `tasks`       | create a task with a due date and project, change its status from the list, open it, edit the description, add a subtask, trash, Undo, trash again and restore from Trash |
| `notes`       | create a note, type in it, leave and come back (autosave kept it), link a task                                                                                            |
| `workspaces`  | create a second workspace, switch, switch back: each keeps its own data and last page                                                                                     |
| `persistence` | over a `seed:dev` folder: quit and relaunch reopens the last workspace on its last page, with every row                                                                   |
| `search`      | ⌘K finds the task and the note, and opens one                                                                                                                             |
| `settings`    | time format and Hide weekends, kept across a relaunch (and the week view drops the weekend)                                                                               |
| `transfer`    | export tasks to JSON, import them into another workspace                                                                                                                  |

Most end by quitting the app and reading the folder back (the database, the manifests,
`settings.json`), so a test checks what was written as well as what was shown.

### The harness

`e2e/support`:

- `fixtures.ts`: the `devbrain` fixture. `devbrain.launch()` starts the app (scaffolding an empty
  DevBrain folder first, as the packaged app does on its first run), `devbrain.quit()` quits it as
  the user does (main holds the quit while the workspace closes and saves its last page),
  `devbrain.relaunch()` does both. Prepare the folder before the first launch: `devbrain.seed()`
  fills it with one workspace from `seed:dev`'s code (Linear is never connected),
  `devbrain.useUpgradeFixture(name)` builds an upgrade fixture there (below), and
  `devbrain.useFolder(path)` copies one in. `devbrain.state` reads it back: `settings()`,
  `registry()`, `manifest(id)`, `workspaceNamed(name)`, `query(id, sql, …params)` (read-only, with
  `node:sqlite`), `rowCounts(id, tables)` and `appliedMigrations(id)`.
- `app.ts`: starts the built app. Main runs unpackaged, so it reads the folder from `DEV_PATH` and
  the migrations from `DB_MIGRATIONS_PATH`; the harness sets both, and empties every other
  variable main reads from `.env` (`VITE_DEV_SERVER_URL`, `DEV_LINEAR_API_KEY`), so a developer's
  `.env` never reaches a test. `TZ` is `UTC` (`E2E_TZ` to change it).
- `dialogs.ts`: answers the system's file dialogs in advance. A test can't click in a native
  dialog, so it replaces `dialog.showSaveDialog` or `showOpenDialog` in the main process, the way
  main's own tests hand `createElectronDesktop` a fake `dialog`.
- `ui.ts`: steps several flows share (go to a page, create a workspace, project or task, switch
  workspace, search).
- `migrations.ts`: the app's migration journal, and a copy of the migrations with one more
  (`migrationsWithExtra`), to open a workspace with (`devbrain.launch({ migrationsPath })`).

### Writing a test

- Find things as the user does: by role and accessible name (`getByRole('button', { name: 'New
Task' })`). Every control the flows use has one; if one doesn't, give the component an
  `aria-label` rather than reaching for a CSS class.
- Wait for what the user sees, never for time: `await expect(locator).toBeVisible()`,
  `toHaveText`, `toHaveURL`. Playwright retries these until they pass. No `waitForTimeout`.
- A popover (a date picker, a menu) is drawn outside the dialog that opened it, so find its items
  from `window`, not from the dialog.
- A long list is virtualized: a row scrolled out of view isn't in the page. Open a far-off item
  through ⌘K search, as `persistence` does.
- Read the folder back after `devbrain.quit()`: the app holds the database open, and its last page
  and settings are written as it closes.

### When a test fails

The test's folder under `test-results/e2e/` keeps:

- `trace.zip`: Playwright's trace of the window, every action with a DOM snapshot before and after.
  Open it with `npx playwright show-trace test-results/e2e/<test>/trace.zip`.
- the window's screenshot as it failed, and `error-context.md`, its accessibility tree;
- `main-N.log`, what main printed in the Nth launch (its IPC calls and errors, the renderer's
  errors);
- `devbrain-folder/`, a copy of the test's DevBrain folder as the app left it.

Locally, `playwright-report/` holds an HTML report: `npx playwright show-report`. To watch a test
run, run it on a machine with a display (with `DISPLAY` set the script doesn't use Xvfb) and add
`await devbrain.app.window.pause()` where you want to stop: Playwright's inspector opens there.

### Upgrade tests

`e2e/upgrade/upgrade.spec.ts` opens DevBrain folders that earlier versions of the app left with
today's app, and checks that the migrations run, every row survives, and the pages show them.
Core's migration tests (`src/main/core/tests/db/migrations.test.ts`) check one migration against a
few rows; these check a whole folder, as a user upgrading has it, through the app.

**main as of `b0bb3767` (2026-11-18, migration 0027) is ground zero**: DevBrain had not shipped
before it, so no folder older than it needs to open. Every fixture is that version or a later one.

| Fixture          | Written by                     | What it holds                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0027-baseline`  | main at `b0bb3767`             | two workspaces. Home lab, open last on its last page (the Trash): a project trashed with its tasks, a task and a note, in `archived_at`. Work: Linear and Google Calendar synced items with their external links, a Google weekly series with a cancelled and a moved occurrence, a local series, an all-day event, notes |
| `newer-than-app` | a DevBrain newer than this one | today's schema plus a migration this app doesn't have: opening it must fail with `workspace_too_new` and write nothing                                                                                                                                                                                                    |

The integrations are waiting for sign-in, so nothing syncs in a test. Besides opening each, the
tests check that a migration which fails restores the database from the backup taken when the
workspace opened (a migration that commits but leaves a broken reference, added to a copy of the
migrations), and that the app then opens it with its own.

#### How a fixture is made

A fixture is a folder in `e2e/upgrade/fixtures/<name>/`, laid out as the DevBrain folder was then:
`settings.json`, `workspaces.json`, `workspaces/<id>/` with its `workspace.json` and
`notes/*.md`, plus:

- `fixture.json`: `migration`, the index of the last migration that version shipped, a
  `description` naming the commit it stands for, and optionally `newerMigration`;
- `workspaces/<id>/db.sql`: the rows, written in that migration's schema, the way that version's
  services wrote them (its ids, timestamps in milliseconds, note file paths, the search index).

`scripts/build_upgrade_fixtures.mts` turns it into a DevBrain folder: each `db.sql` becomes a
`db.sqlite` made by drizzle's migrator, as the app runs it, over the migration set as it stood at
`migration` (this repository's migrations with the journal cut there: a merged migration never
changes, so that is the set the version shipped), then the rows. `${DEVBRAIN}` in any file becomes
the folder's path, as the app writes absolute paths. Nothing binary is committed; the harness
builds a fixture into each test's own folder (`devbrain.useUpgradeFixture(name)`, about a
second). To look at one: `npm run e2e:fixture -- 0027-baseline /tmp/fixture`, then open it with
`sqlite3`, or point the app at it (`DEV_PATH=/tmp/fixture npm run dev`). The fixtures are left out
of Prettier, so their files stay as the app wrote them.

The rows are written by hand, not by running the old version's code: an old checkout would need
its own `npm ci` and Electron, which is slow and breaks as dependencies move. To get them right,
read that version's schema (apply the migrations up to it) and its services with
`git show <commit>:<path>`, and write what they wrote.

#### Adding a fixture when a migration lands

When a migration changes existing rows or the folder's layout:

1. Copy the newest fixture to `e2e/upgrade/fixtures/<NNNN>-before-<change>/`, where `NNNN` is the
   last migration before yours; set `migration` and the `description` (the commit it stands for).
   Until a version ships, the newest fixture can be `0027-baseline` itself: change only what your
   migration converts.
2. Make its rows exercise your change: rows your data migration converts, and rows it must leave
   alone. Build it (`npm run e2e:fixture`) to check the SQL is valid for that schema.
3. Add a test in `upgrade.spec.ts`: open it, check the pages show the rows, then quit and check the
   database (`devbrain.state.query`, `appliedMigrations`, `rowCounts`) holds what your migration
   should have made.
4. Leave the older fixtures' rows as they are: they are the versions users upgrade from. Update
   their assertions only where your change means the app shows or stores something new.

The archive→trash rename is the next: `0027-baseline` already holds trashed rows in every table,
so the rename adds its assertions there (the trashed rows' new column, the queries that read
`archived_at` today) and a new fixture only for the change after it.

### In CI

The CircleCI `e2e` job runs `npm run e2e` on `cimg/node:24.0-browsers`, under Xvfb. It makes
Electron's `chrome-sandbox` setuid root first, as Chromium's sandbox needs when it runs as a
non-root user in Docker. It runs two tests at a time, and stores `test-results/e2e` as artifacts
only when a test fails: the traces, screenshots, logs and folders above. Test results go to
CircleCI's Tests tab.

The tests run against the built app, not the packaged one. Once packaging is in CI they can run
against `release/linux-unpacked` instead: `launchApp` (`e2e/support/app.ts`) is the one place that
says how the app starts, and a packaged app reads the folder from `DEVBRAIN_PATH`.
