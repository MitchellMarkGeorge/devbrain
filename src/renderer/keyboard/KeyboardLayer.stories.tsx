import { useRef, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../components/layout/Flex';
import { Text } from '../components/layout/Text';
import { WindowFrameProvider } from '../components/lib/platform';
import { Input } from '../components/ui/Input';
import { Kbd, KbdGroup } from '../components/ui/Kbd';
import { createAppCommands, defaultKeymap } from './default-keymap';
import type { Command } from './commands';
import {
  KeyboardProvider,
  useCommands,
  useKeyboard,
  useKeyboardState,
  useUndoEntries,
} from './KeyboardProvider';
import type { Keymap } from './keymap';
import { KeyScope } from './KeyScope';
import { ShortcutsDialog } from './ShortcutsDialog';

/**
 * The keyboard layer, mounted on its own with demo commands: the default keymap's keys write to
 * the log, a list takes `list` keys while a row is focused, and moving a row to trash can be
 * undone. Click into the frame first, so it has the keyboard.
 */
const meta = {
  title: 'Keyboard/KeyboardLayer',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const INITIAL_ROWS = [
  'Implement OAuth2 PKCE flow',
  'Refactor token refresh logic',
  'Audit token storage',
  'Write PKCE migration guide',
  'Set up API Gateway',
];

// ---------- the demo keymaps ----------

const listEntries: Keymap['entries'] = [
  { scope: 'list', keys: 'arrowdown', command: 'list.down', group: 'Lists', label: 'Down / up' },
  { scope: 'list', keys: 'arrowup', command: 'list.up', group: 'Lists', label: 'Down / up' },
  { scope: 'list', keys: 'mod+backspace', command: 'row.trash', group: 'Lists' },
  { scope: 'global', keys: 'mod+z', command: 'app.undo', group: 'Everywhere' },
];

const demoKeymap: Keymap = {
  ...defaultKeymap,
  entries: [...defaultKeymap.entries, ...listEntries],
};

/** A sketch of how Vim plugs in: modes, counts and lower-case keys, on the same commands. */
const vimKeymap: Keymap = {
  id: 'vim',
  title: 'Vim',
  modes: ['normal', 'insert'],
  counts: true,
  upperCaseKeys: false,
  groups: ['Move', 'Go to', 'Act', 'Find'],
  entries: [
    {
      scope: 'list',
      mode: 'normal',
      keys: 'j',
      command: 'list.down',
      group: 'Move',
      label: 'Down / up',
    },
    {
      scope: 'list',
      mode: 'normal',
      keys: 'k',
      command: 'list.up',
      group: 'Move',
      label: 'Down / up',
    },
    {
      scope: 'list',
      mode: 'normal',
      keys: 'g g',
      command: 'list.first',
      group: 'Move',
      label: 'First / last item',
    },
    {
      scope: 'list',
      mode: 'normal',
      keys: 'G',
      command: 'list.last',
      group: 'Move',
      label: 'First / last item',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'g h',
      command: 'nav.home',
      group: 'Go to',
      label: 'Home',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'g t',
      command: 'nav.tasks',
      group: 'Go to',
      label: 'Tasks',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'g p',
      command: 'nav.projects',
      group: 'Go to',
      label: 'Projects',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'g n',
      command: 'nav.notes',
      group: 'Go to',
      label: 'Notes',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'g c',
      command: 'nav.calendar',
      group: 'Go to',
      label: 'Calendar',
    },
    { scope: 'global', mode: 'normal', keys: 'c', command: 'task.new', group: 'Act' },
    { scope: 'list', mode: 'normal', keys: 'd d', command: 'row.trash', group: 'Act' },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'u',
      command: 'app.undo',
      group: 'Act',
      label: 'Undo',
    },
    {
      scope: 'global',
      mode: 'normal',
      keys: 'i',
      command: 'mode.insert',
      group: 'Act',
      label: 'Insert mode',
    },
    {
      scope: 'global',
      mode: 'insert',
      keys: 'escape',
      command: 'mode.normal',
      allowInTyping: true,
      allowInEditor: true,
      group: 'Act',
      label: 'Normal mode',
    },
    { scope: 'global', keys: 'mod+k', command: 'search.open', allowInTyping: true, group: 'Find' },
    {
      scope: 'global',
      mode: 'normal',
      keys: '?',
      command: 'help.shortcuts',
      group: 'Find',
      label: 'Keys',
    },
  ],
};

const modeCommands: Command[] = [
  { id: 'mode.insert', title: 'Insert mode', scope: 'global', run: (ctx) => ctx.setMode('insert') },
  { id: 'mode.normal', title: 'Normal mode', scope: 'global', run: (ctx) => ctx.setMode('normal') },
];

// ---------- the demo ----------

const panel: CSSProperties = {
  padding: 'var(--space-3)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
};

function DemoList({ log }: { log: (line: string) => void }) {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const listRef = useRef<HTMLDivElement>(null);

  const rowButtons = () => [...(listRef.current?.querySelectorAll('button') ?? [])];
  const focusedIndex = () => rowButtons().findIndex((b) => b === document.activeElement);
  const focusRow = (index: number) => {
    const buttons = rowButtons();
    buttons[Math.max(0, Math.min(buttons.length - 1, index))]?.focus();
  };

  useCommands([
    {
      id: 'list.down',
      title: 'Down',
      scope: 'list',
      run: (_ctx, { count = 1 }) => focusRow(focusedIndex() + count),
    },
    {
      id: 'list.up',
      title: 'Up',
      scope: 'list',
      run: (_ctx, { count = 1 }) => focusRow(focusedIndex() - count),
    },
    { id: 'list.first', title: 'First item', scope: 'list', run: () => focusRow(0) },
    { id: 'list.last', title: 'Last item', scope: 'list', run: () => focusRow(rows.length - 1) },
    {
      id: 'row.trash',
      title: 'Move to trash',
      scope: 'list',
      enabled: () => focusedIndex() !== -1,
      run: (_ctx, { count = 1 }) => {
        const index = focusedIndex();
        const removed = rows.slice(index, index + count);
        setRows((current) => [...current.slice(0, index), ...current.slice(index + count)]);
        log(`Moved ${removed.length} to trash`);
        return {
          label: `Moved “${removed[0]}” to trash`,
          undo: () => {
            setRows((current) => [...current.slice(0, index), ...removed, ...current.slice(index)]);
            log(`Restored ${removed.length}`);
          },
        };
      },
    },
  ]);

  return (
    <KeyScope name="list" render={<div ref={listRef} style={panel} />}>
      <Text size="xs" tone="muted">
        List scope: focus a row
      </Text>
      <Stack gap="1">
        {rows.map((row) => (
          <button key={row} type="button" style={{ textAlign: 'left' }}>
            {row}
          </button>
        ))}
      </Stack>
    </KeyScope>
  );
}

function StatusLine() {
  const { keymap } = useKeyboard();
  const { mode, pending, count } = useKeyboardState();
  const undo = useUndoEntries();
  return (
    <Stack gap="1" style={panel}>
      <Text size="xs" tone="muted">
        Keymap: {keymap.title} · mode: {mode} · count: {count ?? '–'} · undo stack: {undo.length}
      </Text>
      <Text size="xs" tone="muted">
        Pending:{' '}
        {pending.length > 0 ? (
          <KbdGroup>
            {pending.map((stroke, i) => (
              <Kbd key={i}>{stroke}</Kbd>
            ))}
            <span>…</span>
          </KbdGroup>
        ) : (
          '–'
        )}
      </Text>
    </Stack>
  );
}

function Demo({ vim = false }: { vim?: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const log = (line: string) => setLines((current) => [line, ...current].slice(0, 8));

  useCommands([
    ...createAppCommands({
      openSearch: () => log('Search'),
      newTask: () => log('New task'),
      newNote: () => log('New note'),
      goTo: (page) => log(`Go to ${page}`),
      openShortcuts: () => setShortcutsOpen(true),
      toggleSidebar: () => log('Toggle sidebar'),
    }),
    ...(vim ? modeCommands : []),
  ]);

  return (
    <Stack gap="3" style={{ padding: 'var(--space-6)', maxWidth: 560 }}>
      <Text size="sm">
        Click here, then try the keys. Press <Kbd>?</Kbd> for the full list.
      </Text>
      <StatusLine />
      <DemoList log={log} />
      <Stack gap="2" style={panel}>
        <Text size="xs" tone="muted">
          Typing targets: plain keys type, ⌘K and ⌘\ still work (the editor keeps ⌘K)
        </Text>
        <Input placeholder="An input" />
        <div contentEditable suppressContentEditableWarning style={{ ...panel, minHeight: 40 }}>
          A contenteditable, like the rich text editor
        </div>
      </Stack>
      <Stack gap="1" style={panel}>
        <Text size="xs" tone="muted">
          Log
        </Text>
        {lines.length === 0 ? (
          <Text size="xs">Nothing yet</Text>
        ) : (
          lines.map((line, i) => (
            <Text key={i} size="xs">
              {line}
            </Text>
          ))
        )}
      </Stack>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </Stack>
  );
}

export const Default: Story = {
  render: () => (
    <KeyboardProvider keymap={demoKeymap}>
      <Demo />
    </KeyboardProvider>
  ),
};

/** `mod` is Ctrl, and the keys are named for Windows */
export const Windows: Story = {
  render: () => (
    <WindowFrameProvider value={{ platform: 'windows', controls: 'drawn' }}>
      <KeyboardProvider keymap={demoKeymap}>
        <Demo />
      </KeyboardProvider>
    </WindowFrameProvider>
  ),
};

/**
 * Not a feature: a sketch of a Vim keymap on the same layer, with modes (`i`, Esc), counts (`3j`,
 * `2dd`), `gg`/`G` and `u`.
 */
export const VimSketch: Story = {
  render: () => (
    <KeyboardProvider keymap={vimKeymap}>
      <Demo vim />
    </KeyboardProvider>
  ),
};
