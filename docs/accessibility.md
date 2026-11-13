# Accessibility

DevBrain aims at **WCAG 2.2 AA** in both themes, with the keyboard as a first-class way to use
the app (the keymap, and later Vim mode, drive everything a pointer can). This note says what the
code relies on and how it is checked. The design system's rules (contrast, focus rings, the list's
keyboard model, motion) are in `docs/design-system/README.md`; the keyboard layer is
`src/renderer/keyboard/README.md`.

## What the code relies on

- **Base UI does the hard parts.** Dialogs, sheets (`Drawer`), menus, popovers, selects, the
  command palette (`Autocomplete`) and toasts come from `@base-ui/react`, which traps and returns
  focus, wires titles to their popups, and gives toasts a polite live region (F6 reaches them, Esc
  closes one). Check what it does before adding your own handling; pass `initialFocus` or
  `finalFocus` when the default target is wrong (a `TaskRow`'s status menu returns focus to the
  row, not to its untabbable status button).
- **A list is one tab stop.** `TaskList`, `NoteList` and `ProjectList` are `role="grid"`s with a
  roving `tabIndex`: one row is tabbable, the keymap moves focus, and the focused row is kept as an
  id (`useFocusedRowId`, `lists/row-focus.ts`) so it survives virtualization. Controls inside a row
  (its checkbox, status button, pills, "Due" button) take `tabIndex={-1}`. When the focused row's
  item leaves the list, the row now in its place takes focus (`useRefocusOnRemoval`), so focus
  never falls to the page and the list's keys keep working.
- **Rows are grid rows.** A `role="row"` holds one `role="gridcell"` (`display: contents`) around
  its parts, and sits in a `role="grid"`. Rows carry `aria-rowindex`; the grid carries
  `aria-rowcount`, the total when it is known and -1 while more pages may load.
- **Names.** An icon-only control is an `IconButton` (its `label` is the name and the tooltip). A
  name holds the words the control shows (WCAG 2.5.3): prefer naming by content, with a
  `VisuallyHidden` prefix for context ("Workspace: Work"), over an `aria-label` that drops them. A
  popover is named (`aria-label` on `PopoverContent`); a dialog by its title.
- **Headings and landmarks.** Each page has one `h1`: a list page's is visually hidden
  (`PageTitle`, `pages/app/page-header.tsx`), as its breadcrumb shows the name; sections under it
  are `h2`. The sidebar is `<nav aria-label="Main">` and the page `<main>`.
- **Announcements.** Toasts announce themselves. `SyncStatus` announces a change of state in a word,
  never its ticking relative time; ⌘K announces its result count (`CommandStatus`). A live region
  must be mounted before its text changes.
- **Contrast.** Text keeps 4.5:1 on every ground it sits on, icons and outlines 3:1. A quieter
  level is a token checked against those grounds, never an opacity on a text token.
- **Motion.** The duration tokens drop to 0 under `prefers-reduced-motion`; an animation that does
  not use them (a spinner) stops in its own media query.

## How it is checked

- **In the tests:** `src/renderer/tests/routing/accessibility.test.ts` runs axe-core over key
  screens drawn through the real routes (Home, the tasks list, groups and board, notes, projects,
  Settings) and checks each list page's `h1`. happy-dom lays nothing out, so it leaves colour
  contrast and target sizes out. `src/renderer/tests/components/task-list.test.ts` covers the
  list's roving focus.
- **In a browser:** `npm run build-storybook && npm run a11y:storybook` runs axe over every
  `Screens/*` story in the dark and light themes, contrast included, and writes the violations to
  `dist/axe-storybook.json` (pass part of a story id to check others:
  `npm run a11y:storybook -- lists-`). It needs a Chromium: Playwright's
  (`npx playwright install chromium`) or one at `CHROMIUM_PATH`.
- **By hand:** keyboard only (Tab, the list keys, Esc, F6 for toasts), and VoiceOver on macOS for
  what is announced. axe can't judge focus order or whether an announcement makes sense.

What is known and not yet done is in `docs/follow-ups.md` under "Accessibility".
