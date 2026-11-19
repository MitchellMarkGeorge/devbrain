# DevBrain website

The public site: the home page, downloads, the changelog and the user docs. It's a static
[Astro](https://astro.build) site with [Starlight](https://starlight.astro.build) for the docs,
built into `dist/` and served by any static host (Cloudflare Pages, below).

It's its own npm package, with its own `package-lock.json`: the app's `npm ci` never installs it,
and its dependencies never reach the app.

```bash
cd website
npm ci
npm run dev       # http://localhost:4321
npm run build     # into dist/
npm run check     # type-checks the .astro and .ts files
```

## When the app changes

The site describes the app, so a change users can see updates it in the same pull request: the
screenshots, the docs, the home page's copy, and the privacy policy when what the app sends or
stores changes. The checklist is in the repository's `CLAUDE.md`, under **Website › Keeping it in
step with the app**.

## What's where

| Path                          | What it is                                                            |
| ----------------------------- | --------------------------------------------------------------------- |
| `src/pages/index.astro`       | The home page                                                         |
| `src/pages/download.astro`    | The installers of the latest release, read from GitHub Releases       |
| `src/pages/changelog.astro`   | Every release's notes, from GitHub Releases                           |
| `src/pages/404.astro`         | Every missing address, docs included (Starlight's own 404 is off)     |
| `src/content/docs/docs/*.md*` | The docs, served under `/docs/`; the sidebar is in `astro.config.mjs` |
| `src/components/Layout.astro` | The frame of the home, download and changelog pages                   |
| `src/lib/releases.ts`         | Reads the releases and sorts their files by platform                  |
| `src/styles/site.css`         | The marketing pages' base styles                                      |
| `src/styles/starlight.css`    | The docs' theme: Starlight's variables set from the app's tokens      |

## What it shares with the app

The site doesn't copy the design system; it reads it from the app:

- **Tokens.** Both stylesheets import `src/renderer/styles/tokens.css`, so the site has the app's
  colours, type, spacing and corners, in dark and light. Change a token in
  `docs/design-system/tokens.json` and run `npm run tokens` at the root, as for the app; the site
  follows on its next build. Use the theme variables (`--background`, `--foreground`, …), never the
  raw palette.
- **Logomark.** The header and the docs read `src/renderer/assets/devbrain-logomark*.svg`. Only
  `public/favicon.svg` is a copy (a favicon must be a public file): the same paths, drawn black or
  white by the browser's colour scheme.
- **Typefaces.** Inter and Geist Mono, from the same `@fontsource` packages.

`astro.config.mjs` allows the dev server to read the repository's files for this.

## Screenshots of the app

The screenshots on the home page are the real app, taken by `npm run website:screenshots` at the
repository's root: it builds the app, makes the **showcase workspace**
(`scripts/setup_showcase_workspace.mts`: a few projects, tasks, notes and a week of meetings,
dated from the moment the screenshots show: 10:40 on a weekday of this week, with each note
edited a believable while before), opens it in the built app through the end-to-end harness
(`e2e/screenshots/website.screens.ts`), and captures each page in dark and light at 2x into
`src/assets/screenshots/<page>-<theme>.png`. Commit the new files.

- Take them again when a page they show changes, or to bring their dates up to now.
- `Screenshot.astro` (the home page) shows the capture in the visitor's theme
  (`prefers-color-scheme`), resized and converted to WebP when the site is built.
  Its `crop` shows one part of a capture (a close-up of a piece of the UI), so a new close-up
  needs no new capture.
- `DocsScreenshot.astro` does the same in the docs, following Starlight's theme picker instead, with
  a caption.
- The showcase workspace's links (a task's note, a meeting's note) are there for the task and event
  screenshots; keep them when changing its data.
- The same run draws the **share image** (`public/og.png`, 1200x630: what a link to any page shows in
  Slack, X or LinkedIn) from the dark task list, in a hidden window of the app
  (`e2e/screenshots/share-card.ts`). Every page names it as `og:image` (`src/lib/share-image.ts`);
  change its words in `share-card.ts` and its alt text there too.
- To show another page, add it to `PAGES` in `website.screens.ts`, and to what the showcase
  workspace holds if it needs data; `seed:dev`'s generated rows are for testing, not for showing.
- On Linux without a display it runs under Xvfb, as the end-to-end tests do.

## Search engines and link previews

- Every page has its own title ("Tasks · DevBrain"), a description of 100–160 characters (front
  matter `description`, or `Layout`'s prop), a canonical link to `https://devbrainapp.dev`, and the
  share image. Keep new pages' descriptions in that range: shorter ones are often replaced by text
  taken from the page.
- `robots.txt` (`src/pages/robots.txt.ts`) and the sitemap (`@astrojs/sitemap`) are built for the
  site's address.
- The home page describes the app to search engines as a `SoftwareApplication` (JSON-LD, in
  `index.astro`): update its platforms or licence when those change.

## Releases on the site

The download page and changelog read `api.github.com/repos/MitchellMarkGeorge/devbrain/releases`
when the site is **built**, not in the visitor's browser:

- A release's installers are found by the names electron-builder gives them
  (`artifactName` in `electron-builder.yml`). Renaming them needs a change in `releases.ts`.
- The download page offers the newest release that isn't a pre-release; drafts are never shown.
- The changelog shows each release's notes as written on GitHub (`docs/releasing.md`), rendered and
  sanitised by GitHub.
- Before the first release, or while the repository is private (the API reads it as not found), the
  pages say there's no release yet. Installers on a private repository's releases can't be
  downloaded by visitors anyway.
- Any other failure of the API fails the build, rather than publishing a download page with nothing
  on it. Set `GITHUB_TOKEN` (any token that can read the repository) in the build's environment if
  the API's limit of 60 requests an hour per address is hit.

So a new release appears once the site is rebuilt, which is done by hand: after publishing,
editing or deleting a release, open the Pages project in Cloudflare, then **Deployments**, and
retry the latest production deployment (**⋯ › Retry deployment**). A push to `main` rebuilds it
too.

## Hosting on Cloudflare Pages

1. In Cloudflare: **Workers & Pages › Create › Pages › Connect to Git**, and pick this repository.
2. Build settings:
   - Production branch: `main`
   - Root directory: `website`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Environment variables: `NODE_VERSION` = `24`. Canonical links and the sitemap name
     `https://devbrainapp.dev` (`astro.config.mjs`), in previews too; set `SITE_URL` only to
     build for another address.
3. Under **Custom domains**, add `devbrainapp.dev`. With the domain on Cloudflare's DNS, it's one
   click; otherwise add the CNAME record Cloudflare shows at the domain's DNS host.
4. Optional: under **Settings › Builds › Build watch paths**, include only `website/*`,
   `src/renderer/styles/tokens.css` and `src/renderer/assets/*`, so app-only changes don't rebuild
   the site.

Every pull request then gets a preview build at its own address. Vercel and Netlify work the same
way: root directory `website`, the same build command and output directory.

Installers are never served from the site: they stay on GitHub Releases (Pages refuses files over
25 MB), and the download page links there.

## Writing docs

A page is a Markdown file in `src/content/docs/docs/`, with a `title` and `description` in its front
matter; add it to `sidebar` in `astro.config.mjs`. A page that shows a screenshot is MDX (`.mdx`),
importing `DocsScreenshot` with the capture's name (`page="board"`), alt text, and `focusX`
for the crop phones show. Starlight's
[asides](https://starlight.astro.build/guides/authoring-content/#asides) (`:::note`) and code blocks
work as in its docs. Search is built with the site.

The docs are for people using DevBrain. The design notes in the repository's `docs/` are for people
building it: link to neither from the other, and describe what the app does, not how.
