# Vulnerable dependencies

How DevBrain keeps known-vulnerable packages out, and the findings left open on purpose.

## What checks

- **CI** (`audit` job in `.github/workflows/ci.yml`) runs `npm audit --omit=dev --audit-level=high`
  against the lockfile and fails on a high or critical advisory in a production dependency. It
  needs no install, and fails on a new advisory too, not only on a change to the lockfile.
- **Dependabot** (`.github/dependabot.yml`) opens a pull request each week: one for the minor and
  patch updates of all npm packages, one per major, and Electron on its own (below). It also
  opens a security update as soon as an advisory is published, when that is enabled for the
  repository (Settings → Code security → Dependabot security updates).

"Production" means `dependencies`. Electron is a dev dependency, but it is the runtime the app
ships in, so treat its advisories as production ones even though `--omit=dev` leaves it out.

## Fixing a finding

1. Find what brings it in: `npm ls <name>`.
2. Update it within the range its parent asks for (`npm update <name>`), or update the parent.
   Take the smallest version that clears the advisory and is at least two weeks old
   (`--before=<date>`).
3. Use `overrides` in `package.json` only when the parent has not released a fix and the fixed
   version is within a range it supports; say why next to it here, and remove it once the parent
   catches up.
4. Never `npm audit fix --force`: it installs whatever major (or downgrade) it takes, including
   electron-builder 24 and drizzle-kit 0.18 today.
5. Electron: stay on the same major unless the update is planned, and run the app (not just the
   tests) before merging; see "Electron" below.

npm 10's `npm audit fix` and `npm install` can fail with `Cannot read properties of null (reading
'edgesOut')` resolving vite 8.1's optional peers; npm 11 (which CI's Node 24 ships) does not.

## Electron

Dependabot opens Electron updates in their own pull request. A new Electron changes Chromium and
Node, the fuses (`electron-builder.yml`), and the Node ABI better-sqlite3 is rebuilt for
(`postinstall`). Before merging one: `npm ci` (rebuilds better-sqlite3), `npm test` (runs on
Electron's Node), `npm run build`, start the app and open a workspace, and `npm run compile` for a
package. Majors also need their breaking changes read.

## Open findings

Checked 2026-11-18. `npm audit --omit=dev`: none. The full `npm audit` reports these, all
moderate, all in build, lint or development tooling that is not in the packaged app (see the
`files` list in `electron-builder.yml`: only `dist/` and better-sqlite3 and electron-log are
shipped).

| Package                     | Brought in by                                                                | Why it can't be fixed yet                                                                                                 | Reachable?                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimatch` <11.0.1 (ReDoS) | electron-builder (`@electron/universal`), typescript-eslint                  | The fix is minimatch 11, outside what either asks for. typescript-eslint 8.73.0 moves to it, but was released 2026-11-16. | No: they match the build's and ESLint's own glob patterns, not user input.                                                                                        |
| `glob` 9–14.0.1             | `@storybook/react-vite` → `@joshwooding/vite-plugin-react-docgen-typescript` | No release of the plugin takes a fixed glob.                                                                              | No: Storybook only, on the developer's own files. The bug is a traversal continuing after its AbortSignal fires.                                                  |
| `esbuild` ≤0.24.2           | drizzle-kit → `@esbuild-kit/esm-loader`                                      | drizzle-kit 0.31 still uses the deprecated `@esbuild-kit` loader; no fixed release yet.                                   | No: the advisory is esbuild's dev server answering any site; drizzle-kit only uses esbuild to load the schema for `db:generate-migrations`, and starts no server. |

Watch for: typescript-eslint ≥8.73 once it is two weeks old (clears minimatch for lint), an
electron-builder 26 release on `@electron/universal` with minimatch 11, a drizzle-kit release
without `@esbuild-kit`, and a docgen plugin release on glob ≥14.0.2. Dependabot will open each as
it comes.

## Fixed 2026-11-18

What `npm audit --omit=dev` reported on `main`, and where it came from:

- **js-yaml** 5.2.3 → 5.4.1 (direct). Parses the front matter of note files
  (`core/local/frontmatter.ts`), including notes imported from anywhere
  ([import-export.md](../import-export.md)), so a crafted file could spend the main process's CPU on
  empty merge keys. Reachable; fixed. The 4.x copies under electron-builder and ESLint went to 4.3.2.
- **fast-uri** 3.1.2 → 3.1.9, **undici** 7.28.0 → 7.30.1, **systeminformation** 5.31.8 → 5.33.19,
  all through `@dotenvx/dotenvx` (in range; dotenvx unchanged). dotenvx is bundled into
  `dist/main`, but DevBrain calls only `config()`, and only when not packaged (`loadDevelopmentEnv`
  in `src/main/index.ts`), to read `.env`. Its session store (conf → ajv → fast-uri) parses no
  URLs from outside, undici is only used by dotenvx's own CLI commands, and DevBrain never calls
  systeminformation's `networkStats()` (dotenvx only calls `system()` and `osInfo()`). Not reachable;
  updated anyway. undici also comes in through Electron's installer (`@electron/get`) and
  node-gyp (6.27.0 → 6.29.1), at install time only.

Also updated, from the full audit: **Electron** 42.4.1 → 42.11.16 (high: sandbox inheritance for
popups and sandboxed windows, cross-origin reads through protocol handlers, compromised eMudhra
certificates), **vite** 8.0.16 → 8.1.6 and **vitest** 4.1.9 → 4.1.12 (dev server and mock server
file reads), and, in range, tar, brace-expansion, @xmldom/xmldom, browserslist, nanoid, postcss and
source-map-js (build tooling).
