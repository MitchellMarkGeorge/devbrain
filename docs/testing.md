# Testing

DevBrain's tests come in layers, from fast and narrow to slow and whole. Each change is tested at the
lowest layer that can see it; the end-to-end tests cover only what needs every part running at once.

| Layer        | Where                                                        | Runs on                                   | Command       |
| ------------ | ------------------------------------------------------------ | ----------------------------------------- | ------------- |
| Core         | `src/main/core/tests`                                        | Vitest, on Electron's Node, real SQLite   | `npm test`    |
| Main and IPC | `src/main/tests` (`ipc/`, `runtime/`)                        | Vitest, with an Electron mock             | `npm test`    |
| Migrations   | `src/main/core/tests/db/migrations.test.ts`                  | Vitest: a database seeded at an older one | `npm test`    |
| Renderer     | `src/renderer/tests` (`routing/`, `features/`, `editor/`, …) | Vitest and happy-dom, with a fake main    | `npm test`    |
| End to end   | `e2e/flows`                                                  | Playwright, the built app under Electron  | `npm run e2e` |

`npm test` runs Vitest on Electron's Node (`scripts/vitest.mts`), so core's tests load the same
better-sqlite3 build as the app. Each test runs in the environment its code runs in, as two Vitest
projects (`vitest.config.ts`): `node` for `src/main` and `src/common`, and `renderer` for
`src/renderer`, in happy-dom (a DOM in Node, so nothing needs a browser). `npm test -- --project
renderer` runs one. The renderer's route tests (`src/renderer/tests/routing`) run the
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
| `note-file`   | a note's file written as another app would: opening it leaves the file as it is, and an edit rewrites only the block that changed                                         |
| `workspaces`  | create a second workspace, switch, switch back: each keeps its own data and last page                                                                                     |
| `persistence` | over a `seed:dev` folder: quit and relaunch reopens the last workspace on its last page, with every row                                                                   |
| `search`      | ⌘K finds the task and the note, and opens one                                                                                                                             |
| `settings`    | time format and Hide weekends, kept across a relaunch (and the week view drops the weekend)                                                                               |
| `transfer`    | export tasks to JSON, import them into another workspace                                                                                                                  |
| `scrolling`   | in a short window, one scroller per page: at the top when first shown, where it was left by Back, the sidebar or search, kept when a sheet opens; a section's view kept   |

Most end by quitting the app and reading the folder back (the database, the manifests,
`settings.json`), so a test checks what was written as well as what was shown.

### The harness

`e2e/support`:

- `fixtures.ts`: the `devbrain` fixture. `devbrain.launch()` starts the app (scaffolding an empty
  DevBrain folder first, as the packaged app does on its first run), `devbrain.quit()` quits it as
  the user does (main holds the quit while the workspace closes and saves its last page),
  `devbrain.relaunch()` does both. Prepare the folder before the first launch: `devbrain.seed()`
  fills it with one workspace from `seed:dev`'s code (Linear is never connected), and
  `devbrain.useFolder(path)` copies one in. `devbrain.state` reads it back: `settings()`,
  `registry()`, `manifest(id)`, `workspaceNamed(name)`, `query(id, sql, …params)` (read-only, with
  `node:sqlite`).
- `app.ts`: starts the built app. Main runs unpackaged, so it reads the folder from `DEV_PATH` and
  the migrations from `DB_MIGRATIONS_PATH`; the harness sets both, and empties every other
  variable main reads from `.env` (`VITE_DEV_SERVER_URL`, `DEV_LINEAR_API_KEY`), so a developer's
  `.env` never reaches a test. `TZ` is `UTC` (`E2E_TZ` to change it).
- `dialogs.ts`: answers the system's file dialogs in advance. A test can't click in a native
  dialog, so it replaces `dialog.showSaveDialog` or `showOpenDialog` in the main process, the way
  main's own tests hand `createElectronDesktop` a fake `dialog`.
- `ui.ts`: steps several flows share (go to a page, create a workspace, project or task, switch
  workspace, search).

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

### In CI

The GitHub Actions `e2e` job (`.github/workflows/ci.yml`) runs `npm run e2e` on `ubuntu-latest`,
under Xvfb. It makes Electron's `chrome-sandbox` setuid root first, as Chromium's sandbox needs
when it runs as a non-root user. It runs two tests at a time, and uploads `test-results/e2e` as
an artifact only when a test fails: the traces, screenshots, logs and folders above.

The tests run against the built app, not the packaged one. Once packaging is in CI they can run
against `release/linux-unpacked` instead: `launchApp` (`e2e/support/app.ts`) is the one place that
says how the app starts, and a packaged app reads the folder from `DEVBRAIN_PATH`.
