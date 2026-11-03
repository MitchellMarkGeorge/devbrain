# DevBrain UI

Production React components for the current [design system](../../../../docs/design-system/README.md), built on Base UI and CSS Modules. No Tailwind or Electron APIs are required. The reference bundle is never imported at runtime.

## Start here

```sh
npm run storybook         # http://localhost:6006
npm run build-storybook   # static output in storybook-static/
npm run test:ui           # form, keyboard, selection, and overlay interactions
npm run test:storybook    # Chromium rendering and accessibility; build Storybook first
```

For browser tests, install Chromium once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable.

Every documented component has its own story, including variants and states where applicable. `Examples/Workspace` composes the library into a working list/board layout. Use the Storybook theme toolbar to switch between dark, light, and system. The accessibility addon is available in every story.

Import the tokens and base styles once, as the existing renderer entry already does. Inter and Geist Mono are bundled locally for offline use.

```tsx
import { Button, Field, Flex, Heading, Input, Stack, Text } from './components/ui';

<Stack gap={6}>
  <Heading as="h1" variant="page">
    Tasks
  </Heading>
  <Text tone="muted">Keep the important work moving.</Text>
  <Field id="task-name" label="Task name">
    <Input id="task-name" placeholder="What needs doing?" />
  </Field>
  <Flex gap={2} justify="flex-end">
    <Button variant="ghost">Cancel</Button>
    <Button icon="plus" onClick={createTask}>
      Create Task
    </Button>
  </Flex>
</Stack>;
```

## Foundations

- `Box`, `Flex`, `Stack`, `Grid`: token-based `padding`, `paddingX`, `paddingY`, and `gap`. Spacing values are token steps (for example, `gap={4}` means 16px). `as` changes the HTML element. `Grid minWidth={240}` makes responsive equal columns.
- `Text`: body, label, meta, and code variants; semantic tones, size, weight, truncation, and an `as` element.
- `Heading`: page (30px), document (24px), section (14px), card/dialog (16px). Choose `as` for heading hierarchy independently of visual size.
- `Icon`: the documented Lucide set at stroke 1.75, plus common navigation/action icons. Extend `icons.ts` for additional glyphs; explicit imports avoid bundling every Lucide icon. Decorative icons are hidden from assistive technology; `label` makes an icon accessible.

## Controls and composition

Buttons forward refs and Base UI props, including `render` and `nativeButton`. The quiet `default` is the everyday action; `primary` is the filled variant. Icon-only buttons require `aria-label`. `value` displays a toolbar's current choice; also supply `title` with the full choice for compact windows.

`Input`, `Textarea`, `Checkbox`, and `Switch` support native form props and controlled/uncontrolled values. Pair inputs with `Field`, using matching `id` values for the control and label. `error` marks the field invalid and displays an associated error. `Tabs`, `ToggleGroup`, and `SwatchPicker` expose `value`, `defaultValue`, and `onValueChange`. Tabs use arrow keys to move focus and Enter/Space to activate, following Base UI's default behavior.

`Calendar` uses real dates and react-day-picker, starts weeks on Monday, and supports `selected`, `defaultSelected`, `onSelect`, disabled dates, month navigation, and keyboard selection. Date picker surfaces use Base UI Popover.

Menus accept actions, checked items, disabled items, nested `items`, group headings, and separators. Provide a trigger React element; `RightClickMenu` uses the same items for context menus. `Command` filters grouped actions and supports arrow/Enter navigation. It can be placed inside a `Dialog` for an application's command palette.

`Dialog` accepts a trigger or controlled `open`/`onOpenChange`; `alert` chooses AlertDialog. An asynchronous `onAction` disables actions until it finishes, closes on success, and leaves the dialog open with an error on failure. Sheets dock in their parent's flex layout at 1080px and wider, and become modal drawers below that width; `overlay` overrides the responsive choice. Mount the sheet beside the content that should narrow.

`Toast` is a standalone announcement for previews or inline use. Wrap the app with `ToastProvider` and call `useToast()` for timed, dismissible notifications:

```tsx
const toast = useToast();
toast.add({
  title: 'Task moved to trash',
  type: 'success',
  actionProps: { children: 'Undo', onClick: restoreTask },
});
```

Use `EntityHoverCard trigger={<EntityPill ... />}` for entity previews. The preview opens after 400ms, remains interactive, and works with keyboard focus. Entity and source pills forward refs for Base UI trigger composition.

## Tasks and app integration

Components are presentation components: consumers supply data and callbacks, with no IPC coupling. Adapt core records into the exported `Task` presentation type, including display dates. Give tasks stable `id` values.

`TaskList` manages selection and local status/priority/date changes, and emits `onSelectionChange` and `onTaskChange` so the application can persist them. Use `selected` for controlled selection (row indexes, matching the design guide). Bulk actions apply to each selected task. Use `onDueDateChange(date, tasks)` to persist the full date (including year); `Task.date` is a display string. `onOpenTask`, `onEntityClick`, and `onMove` connect navigation and moving tasks to app behavior. Arrow keys move between focused rows, X selects, S opens the status menu, and 1/2/3 picks status. Enter opens a task; Escape clears selection; Cmd/Ctrl+A selects all. Shortcuts do not intercept input editing.

Adjacent selected rows join, and checkboxes remain visible while selecting. `density="compact"` gives 40px rows. Pills stack automatically in narrow lists and expand on hover/focus; `stack` can force stacking. `BoardColumn`, `BoardCard`, `GroupHeading`, event/note cards, property rows, and the sidebar expose callbacks for their actions.

The sidebar supports custom navigation entries with links or callbacks, workspace menu actions, recents/favorites, controlled collapse, and a modal drawer in compact windows. Choosing a destination or pressing Escape closes the drawer.

## Styling

`ui.module.css` adapts the current reference visuals into scoped styles and adds live Base UI states, portals, responsive behavior, and reduced motion. Readable metadata blends the subtle colour with foreground to maintain contrast on dark surfaces. Components consume generated semantic tokens; edit `docs/design-system/tokens.json` and run `npm run tokens` to change those values. The generator also supports `data-theme="dark"`/`"light"` on the document root for Storybook and browser consumers; Electron continues to follow its native theme setting by default.

Public props and domain types are exported from `index.ts`. Most components accept standard element/Base UI props; use `className` or `style` for view-specific customization.
