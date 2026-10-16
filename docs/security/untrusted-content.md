# Untrusted content

What the renderer may do with the text, URLs and colours core hands it. Most of it comes from outside DevBrain: Linear issues and projects, Google events (whose descriptions are HTML converted to Markdown), and invitations other people send to the user's calendar. Anyone who can put an event on the user's calendar or edit an issue assigned to them can write these fields. The user's own input is treated the same way, because it is mixed with synced content in the same views.

The rule is simple: **every string from core is text unless this page says otherwise.** Core does two things to make that hold, and the renderer does the rest.

## What core guarantees

- **Search results are the only HTML core returns.** `SearchService.search` returns `title` and `body` with the indexed text escaped (`&`, `<`, `>`, `"`, `'`) and each match wrapped in `<b>…</b>`. Those balanced, unnested `<b>` elements are the only markup in them, whatever the indexed text held. FTS5 marks matches with control characters, which are removed from text before it is indexed; core escapes the marked text and only then turns the markers into tags (`highlightToHtml` in `core/search/utils.ts`).
- **Only http and https URLs reach the browser.** Every URL core opens goes through `guardOpenExternal` (`core/shared/untrusted.ts`), in front of the injected `openExternal` (Electron's `shell.openExternal` in the app). It opens the URL only if `safeExternalUrl` (`src/common/safe-url.ts`) accepts it, and throws `UnsafeUrlError` (code `unsafe_url`), having opened nothing, otherwise. Both the OAuth sign-in page and `Workspace.openUrl` go through it.
- **`safeExternalUrl`** accepts an absolute `http:` or `https:` URL with a host and no user name or password, and returns it normalised by the WHATWG URL parser (so quotes and angle brackets come back percent-encoded). It refuses `javascript:`, `data:`, `file:`, `vbscript:`, `mailto:`, `tel:`, custom schemes, relative and protocol-relative URLs, and URLs such as `https://bank.example@evil.example` whose credentials part can disguise the host. The allow-list is `SAFE_URL_PROTOCOLS`. Adding a scheme there is a security decision, not a convenience.
- **Stored values are kept as the provider sent them.** Core does not rewrite URLs or Markdown when it syncs them, so what is stored is faithful and the checks above are applied where a value is used.

## Fields and how to render them

| Kind        | Fields                                                                                                                                                                                                                            | Render as                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text        | Titles of tasks, projects, notes and events; `Note.preview`; `Event.location`; `Calendar.name`; `Integration.accountLabel`; `ExternalSource.lastError`; `ExternalRef.key`, `statusLabel` and `priorityLabel`; every error message | A text node (React's `{value}`). Never `dangerouslySetInnerHTML`, `innerHTML` or an attribute other than `title`/`aria-*`.                                                   |
| Markdown    | `description` of tasks, projects and events, synced or local; note content                                                                                                                                                        | A Markdown renderer with raw HTML off and the link and image rules below. Synced descriptions are read-only.                                                                 |
| URL         | `ExternalRef.url` (the issue or event page), `Event.meetingUrl` (Meet or other video link), `Task.pullRequestUrl`, link targets inside Markdown                                                                                   | Text, or a control that calls `Workspace.openUrl` over IPC. Show it as a link only when `safeExternalUrl` returns non-null, and pass the original value to `openUrl`.        |
| Colour      | `Calendar.color`, `Event.color`, `Project.color`                                                                                                                                                                                  | Only through `safeHexColor` (`#rrggbb`); fall back to a theme colour when it returns null. Never interpolate the raw value into CSS.                                         |
| Search HTML | `SearchResult.title`, `SearchResult.body`                                                                                                                                                                                         | The one place `dangerouslySetInnerHTML` is allowed. Style the `<b>` as the match highlight. Do not pass these strings anywhere else or concatenate other text into them.     |
| Time zone   | `Event.timeZone`, `Calendar.timeZone`                                                                                                                                                                                             | Pass to `Intl` / FullCalendar as a zone. Local events' zones are validated as IANA names; a provider's may not be, so catch a `RangeError` and fall back to the system zone. |

### Markdown

A Google description is HTML that core converts to Markdown with turndown, which drops `script`, `style`, `iframe` and similar elements. That conversion is for readability, not safety: turndown passes text through as it is, so a description whose text reads `<img src=x onerror=…>` becomes Markdown containing that HTML. Linear descriptions are Markdown as Linear stores them. So the Markdown renderer must:

- **Not render raw HTML.** Show it as text, or drop it.
- **Filter link targets through `safeExternalUrl`.** A link whose target is refused renders as its text only. A link that passes opens through `Workspace.openUrl` on click; it never navigates the DevBrain window.
- **Not load remote images.** Show an image as a link (its alt text, or the URL) that opens through `openUrl`. Loading one would tell its sender when the user read the event, and from where.
- **Not autolink other schemes.** Bare `javascript:`, `file:` and `data:` text stays text.

DevBrain's own syntax (local links between notes and tasks) is resolved by the renderer and never reaches `openUrl`.

### Opening links

`Workspace.openUrl(url)` is the only way the renderer opens anything outside the app. The renderer may check first, to decide whether to draw a link at all, but `openUrl` checks again: the renderer's check is for display, core's is the one that counts. An `UnsafeUrlError` is not worth more than a quiet "This link can't be opened"; it means the value was never a web link.

The main process should back this up at the window level: deny `window.open` with `setWindowOpenHandler` and cancel `will-navigate` to anything other than the app's own pages, so a link that escapes the rules above still cannot load a remote page inside DevBrain or reach `shell.openExternal` unchecked.

## Changing this contract

A new field from a provider defaults to text. Making it Markdown, a URL or a colour means adding it to the table above, and a new kind of rendering (HTML from core other than search) needs escaping in core and a test in `core/tests/shared/untrusted.test.ts` or beside the service that produces it.
