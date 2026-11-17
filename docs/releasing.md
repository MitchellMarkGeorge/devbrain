# Releasing DevBrain

How a version of DevBrain is numbered, built for each platform, checked and signed, and what is
still done by hand. Nothing has been released yet: read **Before the first release** first.

## Before the first release

- **Choose the app id.** `appId` in `electron-builder.yml` is the placeholder
  `com.example.devbrain`. It must be a reverse-DNS name the owner controls (such as
  `com.<your-domain>.devbrain`). macOS uses it as the bundle id (Keychain items, preferences,
  notarization, the Developer ID profile) and Windows as the app's identity (taskbar, notifications,
  the uninstaller's registry key). Changing it after a release makes the OS treat the new version as
  another app, so set it once, before the first build anyone installs.
- With it, set `desktopName` in `package.json` (`<app id>.desktop`) and `linux.syncDesktopName: true`,
  so Linux desktops link the window to its launcher; electron-builder warns until then.
- Set up signing for macOS and Windows (below); unsigned builds are for testing only.

## Versions

The version is `version` in `package.json` (semantic versioning). It names the installers
(`DevBrain-<version>-<arch>.dmg`, …) and is what the app reports (`app.getVersion()`).

To release a version, on an up-to-date `main`:

```bash
npm version minor   # or patch / major / 1.0.0: updates package.json and package-lock.json,
                    # commits, and tags v<version>
git push --follow-tags
```

The tag marks the commit each platform is built from. A workspace's database is migrated forward on
open and never back (`src/main/db/migrations`), so a release with a new migration can't be
downgraded to one without it: say so in its notes.

Release notes are written by hand for now, from the merged pull requests since the last tag
(`git log --merges v<last>..v<new>`), on the GitHub release (once releases are published there; see
**Publishing and auto-update**).

## Building

`npm run compile` builds main, the preload and the renderer, then runs electron-builder
(`electron-builder.yml`) for the platform it runs on, into `release/`. Each platform must be built on
its own OS: better-sqlite3 is a native module, built (or downloaded prebuilt) for Electron and for the
target's OS and architecture, and macOS signing and notarization need macOS.

| Platform | Build on                     | Output in `release/`                                         | CI                                |
| -------- | ---------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Linux    | Linux x64                    | `DevBrain-<version>-x86_64.AppImage`                         | `package_linux` (CircleCI)        |
| macOS    | a Mac (Apple Silicon or x64) | `DevBrain-<version>-arm64.dmg`, `DevBrain-<version>-x64.dmg` | not yet: needs a macOS executor   |
| Windows  | Windows x64                  | `DevBrain-Setup-<version>-x64.exe` (NSIS, per user)          | not yet: needs a Windows executor |

On a Mac, one `npm run compile` builds both architectures; electron-builder fetches better-sqlite3
for each.

What the package holds, and why (the comments in `electron-builder.yml` say more):

- the three builds in `dist/`, and `package.json`, in an **asar**;
- of `node_modules`, only what Vite leaves external (`vite/main.config.ts`): better-sqlite3 (with
  `bindings`) and electron-log. Its native module is **unpacked** beside the asar
  (`app.asar.unpacked`), as Electron can't load one from inside it. A new external dependency needs
  its line in `files`, or the packaged app fails to start (and `npm run smoke:packaged` with it);
- the **migrations**, as an extra resource (`resources/migrations`), found from
  `process.resourcesPath` (`src/main/runtime/migrations.ts`);
- the **icons** from `build/`, drawn from the logomark by `npm run icons`;
- never `.env`: the packaged app has its OAuth client ids inlined at build time instead
  (`vite/main.config.ts`), from `.env` or the build's environment. A release build needs the keys
  in `OAUTH_CLIENT_ENV_KEYS` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) in its environment, or
  Google Calendar can't connect; on CI, as environment variables of the release job. CI's
  `package_linux` builds without them.

Electron's **fuses** are flipped in the packaged binary: it can't run as plain Node, ignores
`NODE_OPTIONS` and `--inspect`, loads the app only from its asar, and on macOS and Windows checks the
asar against a hash built into the app. The window keeps its hardening (`sandbox`,
`contextIsolation`, no `nodeIntegration`, the page's CSP; `docs/security/untrusted-content.md`).

The AppImage starts through electron-builder's `AppRun`, which adds `--no-sandbox` when the system
gives no unprivileged user namespaces (Ubuntu 24.04 and later restrict them with AppArmor), as
Chromium's sandbox can't start there from an AppImage. The page is still sandboxed in Electron's
sense (no Node in the page or the preload), without the OS sandbox around the renderer. A `.deb`
target, whose `chrome-sandbox` helper can be installed setuid, would keep it; that's a later choice.

## Checking a build

`npm run smoke:packaged` launches the app in `release/` for this platform (the AppImage, extracted;
`mac-arm64/DevBrain.app` or `mac/DevBrain.app`; `win-unpacked/DevBrain.exe`), or the one given with
`--app <path>`, and fails unless:

- the package holds the asar with the builds and fonts and no `.env`, the unpacked better-sqlite3,
  and every migration in the journal;
- the first window loads with no error thrown or logged (a CSP violation, a missing file), the CSP in
  place and no Node in the page;
- in a temporary DevBrain folder and home, it creates and opens a workspace (better-sqlite3 and the
  shipped migrations), writes a task and draws it in the bundled fonts.

CI runs it on the AppImage. Run it on the macOS and Windows builds before releasing them (on
Linux without a display it needs `xvfb`). After signing, also open the installed app once by hand:
the smoke check runs the app from `release/`, not as installed from the DMG or the installer.

## Signing

electron-builder signs when it finds the credentials in the environment, and builds unsigned (with a
warning) when it doesn't. None are set up yet. Keep them out of the repository: on CircleCI, as
project environment variables or in a restricted context used only by release jobs.

**macOS** (Developer ID, then notarization; both needed for Gatekeeper to open a downloaded app):

| Variable                                                | What                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `CSC_LINK`                                              | the Developer ID Application certificate and key, a base64 `.p12` (or a path) |
| `CSC_KEY_PASSWORD`                                      | its password                                                                  |
| `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | an App Store Connect API key for notarization (the `.p8` as a path)           |

electron-builder notarizes once the `APPLE_API_*` variables are set (Apple ID with an app-specific
password, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, works too, but an API key is the
safer choice). The app is built with the hardened runtime, which notarization requires, and
electron-builder's default entitlements. Needs: an Apple Developer Program membership and a Mac.

**Windows** (Authenticode; without it SmartScreen warns on every download until the file gains a
reputation): code-signing certificates are now issued only on hardware or cloud keys, so a `.pfx`
in `WIN_CSC_LINK` is rarely an option. The likely route is Azure Trusted Signing: add
`win.azureSignOptions` (`publisherName`, `endpoint`, `certificateProfileName`, `codeSigningAccountName`)
to `electron-builder.yml`, and give the build `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and
`AZURE_CLIENT_SECRET`. Needs: an Azure Trusted Signing account with a verified publisher identity,
and a Windows build machine.

**Linux**: AppImages aren't signed by convention; publish a checksum (`sha256sum`) beside it.

## Not automated yet

- Building and checking the macOS and Windows installers: CircleCI's `package_linux` covers Linux
  only. Adding them means a macOS and a Windows executor running `npm ci`, `npm run compile` and
  `npm run smoke:packaged` (with `xvfb` not needed there).
- Signing and notarization: no credentials exist yet (above).
- Tagging, release notes and uploading the installers: by hand.
- Updates: none (below). Users install each version over the last.

## Publishing and auto-update

There is no auto-update, and `publish: null` keeps electron-builder from guessing a target (it
would otherwise pick GitHub releases from the repository, and try to publish when CI builds a tag).
Auto-update needs a publish target chosen first; the options:

- **GitHub Releases** with `electron-updater`: `publish: github`, a `GH_TOKEN` on the release job,
  and the app checking on start. Free, and the usual choice for a public repository; a private
  repository needs a token in the app, so it suits public releases only.
- **A static host** (S3, R2, any HTTPS server) with `electron-updater`'s `generic` or `s3`
  provider: electron-builder uploads the installers and `latest*.yml`, the app reads them. Works for
  private builds; costs the hosting.
- **update.electronjs.org** (Electron's free update service, through `update-electron-app`): for
  public GitHub repositories, macOS and Windows only, and it needs signed builds.

Whichever it is, it needs: the `zip` target beside `dmg` on macOS (Squirrel.Mac updates from a zip),
signed builds on macOS (an unsigned app can't update itself), the `publish` setting, a token for the
release job, and code in main to check for and apply updates.
