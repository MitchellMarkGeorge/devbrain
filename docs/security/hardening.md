# Hardening

What DevBrain sets in Electron so that its process, with access to the user's keychain and their
workspaces, runs only DevBrain's own code and shows only DevBrain's own page. It follows Electron's
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security) and
[fuses](https://www.electronjs.org/docs/latest/tutorial/fuses). What the renderer does with text
from outside is in [untrusted-content.md](untrusted-content.md).

`npm run check:package` (`scripts/check-package.mts`) checks a built package against this page:
its fuses, and what its asar holds. CircleCI's `package_linux` runs it on every build.

## Fuses

Flipped in the packaged binary by electron-builder (`electronFuses` in `electron-builder.yml`),
before signing. They are not set in development, where Electron runs from `node_modules`.

| Fuse                                    | Set to | Why                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunAsNode`                             | off    | `ELECTRON_RUN_AS_NODE` would make the signed DevBrain binary run any script as plain Node, under DevBrain's identity (on macOS, its keychain items). Nothing in the packaged app runs itself as Node; the tests do (`scripts/vitest.mts`), on the development Electron, which has no fuses set. |
| `EnableCookieEncryption`                | on     | Cookies are encrypted on disk with the OS key store, as `safeStorage` already uses for credentials. A one-way change: cookies written encrypted can't be read by a build with it off. DevBrain keeps few (OAuth runs in the system browser), so nothing is lost.                                |
| `EnableNodeOptionsEnvironmentVariable`  | off    | `NODE_OPTIONS=--require …` would load other code into main.                                                                                                                                                                                                                                     |
| `EnableNodeCliInspectArguments`         | off    | `--inspect` and friends would open a debugger that runs code in main.                                                                                                                                                                                                                           |
| `EnableEmbeddedAsarIntegrityValidation` | on     | macOS and Windows check `app.asar` against the hash electron-builder builds into the binary, so editing the asar breaks the app instead of running. Linux has no such check: the fuse is set but does nothing there.                                                                            |
| `OnlyLoadAppFromAsar`                   | on     | Electron loads the app only from `app.asar`, never from an `app` folder or `default_app.asar` put beside it. With the check above, the code that runs is the code that was signed.                                                                                                              |
| `LoadBrowserProcessSpecificV8Snapshot`  | off    | Electron's default. It only selects a separate V8 snapshot for main, for apps that build one; DevBrain doesn't.                                                                                                                                                                                 |
| `GrantFileProtocolExtraPrivileges`      | on     | Electron's default, left on: the window loads its page with `loadFile` (`file://`), which needs it. Turning it off means serving the page from a custom protocol first.                                                                                                                         |
| `WasmTrapHandlers`                      | on     | Electron's default (fast WebAssembly bounds checks). electron-builder 26 can't set it; the check expects the default.                                                                                                                                                                           |

What still works with them set, and why:

- **better-sqlite3** is a native module, unpacked beside the asar (`app.asar.unpacked`). Electron
  loads it from there; `OnlyLoadAppFromAsar` is about the app's code, not unpacked files.
- **The migrations** are an extra resource (`resources/migrations`), read as files.
- **The OAuth loopback server** is Node's `http` in main, which the fuses don't touch.
- **Launch at login** registers the app's own binary, with no arguments (`app.setLoginItemSettings`, `runtime/login-item.ts`).

## The window and its page

Set in `src/main/index.ts` and `src/main/runtime/hardening.ts`:

- **`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.** The page has no Node and
  no `require`; the preload is sandboxed too.
- **The preload exposes only the bridge** (`src/preload/index.ts`): one object, whose `invoke` and
  `subscribe` send the router's requests and pass events' payloads (never the IPC event). Main
  checks every request against its route's schema.
- **Every web contents is hardened as it's created** (`hardenAllWebContents`, on
  `web-contents-created`): `window.open` and links with `target=_blank` are denied
  (`setWindowOpenHandler`); `will-navigate` and `will-redirect` to anything but the page's own URL
  are cancelled (a reload is allowed); a `<webview>` is refused (`will-attach-webview`).
- **Permissions are refused** (`denyPermissions`, on the default session): camera, microphone,
  notifications, geolocation, MIDI, display capture, HID, USB, serial and the rest, both when the
  page asks and when it checks. Electron grants them all when no handler is set. The one allowed is
  `clipboard-sanitized-write`, which `navigator.clipboard.writeText` needs (the "Copy URL" and "Copy link" actions).
- **No devtools in a packaged app**: `webPreferences.devTools` is off, the menu leaves out Toggle
  Developer Tools and Force Reload, and anything that opens them closes them.
- **The CSP** (`src/renderer/index.html`): `default-src 'self'; script-src 'self'`, so no remote
  script, no inline script and no `eval`. `style-src` allows `'unsafe-inline'`, which the editor and
  the UI libraries' inline styles need; styles can't run code.
- **`shell.openExternal`** is reached only through `guardOpenExternal` (`core/shared/untrusted.ts`),
  which opens http and https URLs only: `Workspace.openUrl` and the OAuth sign-in page both use it,
  and main passes `shell.openExternal` nowhere else.

## The package

- **No `.env`**: it holds the building machine's secrets. The packaged app doesn't read one
  (`loadDevelopmentEnv`), and the OAuth client ids are inlined at build time.
- **No source maps, tests or sources**: `files` in `electron-builder.yml` lists what the app loads,
  and excludes `*.map`.
- **Native modules unpacked**, as above.

`check:package` fails on any of these, and on a fuse that isn't as the table says, including a fuse a
newer Electron adds (decide what it should be, then add it to the table, the check and
`electron-builder.yml`).

## Not covered yet

- **macOS and Windows** packages aren't built on CI, so their asar integrity check and signing are
  untested. `check:package` reads a `.app` or `win-unpacked` folder too; run it on the Mac or Windows
  build before a release (docs/releasing.md).
- **`--remote-debugging-port`** is a Chromium switch, not a Node one: no fuse turns it off, so the
  packaged app still opens the DevTools protocol for its page when launched with it. Anyone who can
  launch DevBrain with arguments can already run code as the user, so this protects no one else; it
  stays available for an automated check of the packaged app.
- **`file://` privileges**: serving the page from a custom protocol would let
  `GrantFileProtocolExtraPrivileges` be turned off.
- **The Linux sandbox**: the AppImage starts with `--no-sandbox` where the system gives no
  unprivileged user namespaces (docs/releasing.md).
