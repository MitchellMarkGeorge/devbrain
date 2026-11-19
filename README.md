# DevBrain

The second brain for developers: your tasks, projects, notes and calendar in one desktop app that
runs on your computer.

DevBrain organises your working life around four things (tasks, notes, projects and events) and
the links between them, so you always have a clear picture of what you're working on and when. It
is local first: each workspace is a folder on your computer, holding a SQLite database and your
notes as plain Markdown files. There is no account and no DevBrain server, and it works offline.

- **Tasks:** lists and boards grouped by status, with priorities, dates, subtasks and links to the
  projects, notes and events they belong to.
- **Projects:** an overview of each project's open and finished tasks, its notes, health and
  progress.
- **Notes:** a rich text editor that reads and writes Markdown, with checklists, tables, callouts
  and highlighted code.
- **Calendar:** your week on a time grid, with an agenda and the meeting up next.
- **Search:** ⌘K (Ctrl K on Windows and Linux) across everything.
- **Integrations:** Linear issues and Google Calendar events, mirrored in read-only.
- **Import and export:** tasks as CSV or JSON, notes as Markdown.

DevBrain hasn't been released yet. It runs on macOS, Windows and Linux.

## Developing

### Prerequisites

| Requirement                   | Version                        |
| ----------------------------- | ------------------------------ |
| [Node.js](https://nodejs.org) | 24 or later (`.nvmrc` pins it) |
| npm                           | bundled with Node.js           |

With nvm, `nvm use` in the repository switches to the pinned version.

### Getting started

```bash
git clone https://github.com/MitchellMarkGeorge/devbrain.git
cd devbrain
npm install        # also builds better-sqlite3 for Electron
npm run seed:dev   # makes a DevBrain folder (.dev) with a workspace full of sample data
npm run dev        # starts Vite and Electron, with hot reload
```

A development build opens the DevBrain folder in `.dev`, never your own `~/.devbrain`. It needs
one: `npm run seed:dev` makes it (`--reset` starts it again). `.env` is optional; copy
`.env.template` to set the Google OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for
Google Calendar, or `DEV_LINEAR_API_KEY` to connect Linear when seeding. Leave `DEV_PATH` unset to
keep the default `.dev`, which `.gitignore` covers.

### Commands

```bash
npm run dev                     # Vite + Electron: hot reload in the window, restart on main/preload changes
npm run seed:dev                # a DevBrain folder with a sample workspace (-- --reset to start again)
npm test                        # unit tests: Vitest on Electron's Node (-- <path> for some)
npm run test:watch              # the same, watching
npm run e2e                     # end-to-end tests: the built app, driven by Playwright
npm run typecheck               # tsc --build
npm run lint                    # ESLint (lint:fix to fix)
npm run format:check            # Prettier (format to write)
npm run storybook               # the design system's components, on localhost:6006
npm run build                   # main, preload and renderer into dist/
npm run compile                 # build, then package with electron-builder into release/
npm run routes                  # regenerate src/renderer/routeTree.gen.ts
npm run tokens                  # regenerate the styles from docs/design-system/tokens.json
npm run icons                   # draw build/icon.* from the logomark
npm run db:generate-migrations  # a migration from the schema (read CLAUDE.md first)
```

A pre-commit hook (Husky and lint-staged) runs ESLint and Prettier on staged files. Before
pushing, run `npm run typecheck && npm run lint && npm run format:check && npm test`.

## How it's built

An Electron app in three parts, written in TypeScript:

- **Main** (`src/main`): Node. `core/` is the app's logic, with no Electron in it: workspaces,
  their SQLite databases (better-sqlite3 and Drizzle, migrations in `db/`), note files, search,
  and syncing integrations. `ipc/` exposes core to the window as a typed tRPC router, and
  `runtime/` wires it to Electron: windows, menus, the keychain, logging.
- **Preload** (`src/preload`): carries tRPC between the window and main over Electron IPC. The
  window runs sandboxed, with context isolation and no Node.
- **Renderer** (`src/renderer`): React, with TanStack Router and Query. Pages are organised by
  feature (`features/`), on the design system in `components/` and a TipTap editor in `editor/`.
- **Common** (`src/common`): the types, enums and schemas both sides share.

```
src/
  main/        core/, db/, ipc/, runtime/, index.ts
  preload/     the IPC bridge
  renderer/    app/, features/, layouts/, shared/, components/, editor/, routes/, styles/
  common/      types and schemas shared by main and the renderer
e2e/           end-to-end tests (Playwright)
scripts/       dev, seeding, tests, code generation
vite/          the Vite builds for main, preload and renderer
docs/          design notes
build/         app icons for packaging
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md): the codebase's rules (migrations, database access, change events, the
  design system, IPC, the renderer's layout and routing). Read it before changing an area it
  covers.
- [`docs/ipc/design.md`](docs/ipc/design.md): how the window talks to core, with a checklist for
  adding a route.
- [`docs/renderer/routing.md`](docs/renderer/routing.md): routing and workspaces in the window.
- [`docs/design-system/README.md`](docs/design-system/README.md): the design system and its tokens.
- [`docs/editor.md`](docs/editor.md): what the note editor reads and writes.
- [`docs/integrations/tech-design.md`](docs/integrations/tech-design.md): Linear, Google Calendar
  and sync.
- [`docs/testing.md`](docs/testing.md): unit, route and end-to-end tests.
- [`docs/security/`](docs/security): untrusted content and dependencies.
- [`docs/releasing.md`](docs/releasing.md): versions, packaging each platform and signing.

## Logs

The main process and every window log to one file through electron-log
(`src/main/runtime/logging.ts`). Help › Show Log File opens it.

| Build       | Log file                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Packaged    | `~/Library/Logs/DevBrain/main.log` (macOS), `%APPDATA%\DevBrain\logs\main.log` (Windows), `~/.config/DevBrain/logs/main.log` (Linux) |
| Development | `.dev-logs/main.log` in the repository; also printed to the terminal                                                                 |

At 5 MB the file moves to `main.old.log` and a new one starts. Never log `process.env`,
credentials or auth headers.

## License

MIT.
