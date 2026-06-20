# Electron + Vite + React Template

The modern but simple Electron template

## Prerequisites

| Requirement                   | Minimum version             |
| ----------------------------- | --------------------------- |
| [Node.js](https://nodejs.org) | 24.0.0 (`.nvmrc` pins `24`) |
| npm                           | bundled with Node.js        |

If you use nvm, run `nvm use` inside the project root to switch to the pinned version automatically.

## Getting started

```bash
git clone <repo-url> my-electron-app
cd my-electron-app
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and launches Electron. The app window opens with hot-module replacement active in the renderer.

## Key dependency versions

| Package                                                             | Version  |
| ------------------------------------------------------------------- | -------- |
| [electron](https://www.electronjs.org)                              | ^42.4.0  |
| [vite](https://vite.dev)                                            | ^8.0.16  |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | ^6.0.2   |
| [react](https://react.dev)                                          | ^18.3.1  |
| [react-dom](https://react.dev)                                      | ^18.3.1  |
| [typescript](https://www.typescriptlang.org)                        | ^5.6.3   |
| [electron-builder](https://www.electron.build)                      | ^26.15.3 |
| [eslint](https://eslint.org)                                        | ^9.39.4  |
| [typescript-eslint](https://typescript-eslint.io)                   | ^8.61.1  |
| [prettier](https://prettier.io)                                     | ^3.8.4   |
| [husky](https://typicode.github.io/husky)                           | ^9.1.7   |
| [lint-staged](https://github.com/lint-staged/lint-staged)           | ^17.0.7  |
| [tsx](https://tsx.is)                                               | ^4.22.4  |

## Project structure

```
src/
  main/index.ts        Electron entry — app lifecycle, BrowserWindow, IPC handlers
  preload/index.ts     contextBridge.exposeInMainWorld — explicit, hand-written bridge
  renderer/
    main.tsx           React entry point
    App.tsx            Root component
    index.html         Shell HTML loaded by Electron
    env.d.ts           Ambient types (imports Api from preload, types window.api)

scripts/
  dev.mts              Dev orchestrator: starts Vite server, watches main/preload, restarts Electron

vite.renderer.config.ts   Renderer (React) build — outputs ESM to dist/renderer/
vite.main.config.ts       Main process build — outputs ESM to dist/main/
vite.preload.config.ts    Preload build — outputs CJS to dist/preload/ (required for sandbox: true)

electron-builder.yml      Packaging config (macOS DMG, Windows NSIS, Linux AppImage)
```

## Available commands

```bash
npm run dev            # Start Vite dev server + Electron (HMR in renderer, auto-restart on main/preload changes)
npm run build          # Build main, preload, and renderer into dist/
npm run compile        # build + package with electron-builder into release/
npm run typecheck      # Type-check all source files without emitting (tsc --noEmit)
npm run lint           # Lint all TypeScript/JavaScript files
npm run lint:fix       # Lint and auto-fix
npm run format         # Format all files with Prettier
npm run format:check   # Check formatting without writing
```

## Architecture

### Three processes, one IPC bridge

The app follows Electron's standard three-process model:

- **Main process** (`src/main/index.ts`) — Node.js. Controls the app lifecycle, creates `BrowserWindow` instances, and registers `ipcMain` handlers.
- **Preload script** (`src/preload/index.ts`) — runs in a privileged context before the renderer page loads. Uses `contextBridge.exposeInMainWorld` to expose a typed `api` object to the renderer.
- **Renderer** (`src/renderer/`) — a plain React app. Has no direct access to Node.js APIs; it communicates with the main process exclusively through `window.api`.

### Why the preload is CommonJS

The preload is built to `index.cjs` (CommonJS) so Electron's `sandbox: true` can remain enabled. Sandboxed preloads cannot be ESM. The main process and renderer are still ESM; only the preload is CJS, which is a well-supported combination.

If you ever need ES module imports directly in the preload, change its Vite config to `format: "es"` and set `sandbox: false` on the `BrowserWindow` — but this gives up the sandbox, so only do it for windows loading fully trusted local content.

### Security defaults

```
contextIsolation: true   (renderer JS cannot access the preload's scope)
sandbox:          true   (preload runs in a restricted environment)
nodeIntegration:  false  (renderer has no direct access to Node.js)
```

### Dev watch behaviour

| What changed  | What happens                                      |
| ------------- | ------------------------------------------------- |
| Renderer file | Vite HMR — instant, no reload                     |
| Preload file  | Preload rebuilds → full renderer reload           |
| Main file     | Main rebuilds → Electron is killed and relaunched |

### Production loading

In development the renderer is served from `VITE_DEV_SERVER_URL` (Vite's local server). In production, Electron calls `win.loadFile(dist/renderer/index.html)` from the packaged bundle.

## Extending the IPC bridge

The bridge between the renderer and main process is explicit and type-safe. To add a new method:

**1. Register the handler in `src/main/index.ts`:**

```ts
ipcMain.handle('dialog:open', () => {
  // Node.js / Electron APIs here
});
```

**2. Expose it in `src/preload/index.ts`:**

```ts
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openDialog: (): Promise<void> => ipcRenderer.invoke('dialog:open'), // add this
};
```

**3. Use it in the renderer:**

```ts
// window.api is already typed via src/renderer/env.d.ts — no extra steps needed
await window.api.openDialog();
```

The `Api` type is exported from the preload and imported in `env.d.ts`, so `window.api` stays fully typed without any code generation step.

## Packaging and distribution

`npm run compile` builds all three bundles and then runs `electron-builder` using `electron-builder.yml`:

| Platform | Output format  | Output directory |
| -------- | -------------- | ---------------- |
| macOS    | `.dmg`         | `release/`       |
| Windows  | NSIS installer | `release/`       |
| Linux    | `.AppImage`    | `release/`       |

The packaged build includes `dist/**` and `package.json`. Configure the app ID, product name, and build assets in `electron-builder.yml`.

## Code quality

A pre-commit hook (Husky + lint-staged) runs automatically on every commit:

- `*.ts` / `*.tsx` — ESLint (with auto-fix) then Prettier
- `*.js` / `*.mts` / `*.json` / `*.md` — Prettier

To run checks manually without committing:

```bash
npm run typecheck && npm run lint && npm run format:check
```
