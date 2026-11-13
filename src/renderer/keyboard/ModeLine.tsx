import { useMemo, type ReactNode } from 'react';
import { StatusLine, type StatusLineHint, type StatusLineMode } from '../components';
import { entryAppliesInMode, type Keymap } from './keymap';
import { keyLabels, type Stroke } from './keys';
import type { Platform } from '../components/lib/platform';
import { useCommandList, useKeyboard, useKeyboardState } from './KeyboardProvider';
import { SET_MODE_COMMAND_ID } from './vim-keymap';

const LINE_MODES: readonly StatusLineMode[] = ['normal', 'insert', 'visual', 'hint', 'command'];

// a hint: a command's keys in the mode (left out while it's unbound or unregistered), or keys
// written out for what isn't a command (a field's Esc)
type HintSpec = { label: string } & ({ command: string } | { keys: string });

/** The keys each mode's line names on its right (Figma's mode lines). */
const MODE_HINTS: Record<string, readonly HintSpec[]> = {
  normal: [
    { command: 'help.shortcuts', label: 'keys' },
    { command: 'commandLine.open', label: 'command' },
    { command: 'hints.show', label: 'hints' },
  ],
  insert: [{ keys: 'Esc', label: 'normal mode' }],
  visual: [
    { command: 'list.toggleSelect', label: 'select' },
    { command: 'row.openStatusMenu', label: 'status' },
    { command: 'row.trash', label: 'trash' },
    { keys: 'Esc', label: 'cancel' },
  ],
  hint: [
    { keys: '', label: 'type a label to click' },
    { keys: 'Esc', label: 'cancel' },
  ],
  command: [
    { keys: 'Tab', label: 'next' },
    { keys: '↵', label: 'run' },
    { keys: 'Esc', label: 'cancel' },
  ],
};

/** A binding's keys as the line writes them: `gg`, `dd`, `⌃D`. */
function keysOf(keymap: Keymap, keys: string, platform: Platform): string {
  return keyLabels(keys, platform, { upperCase: keymap.upperCaseKeys ?? true }).join('');
}

/** What has been typed so far, as the line writes it: a count, then the strokes (`3d`, `g`). */
export function pendingText(count: number | undefined, pending: readonly Stroke[]): string {
  return `${count ?? ''}${pending.join('')}`;
}

export function modeHints(
  keymap: Keymap,
  mode: string,
  registered: ReadonlySet<string>,
  platform: Platform,
): StatusLineHint[] {
  return (MODE_HINTS[mode] ?? []).flatMap((hint): StatusLineHint[] => {
    if ('keys' in hint) return [{ keys: hint.keys, label: hint.label }];
    if (!registered.has(hint.command)) return [];
    const entry = keymap.entries.find(
      (candidate) =>
        candidate.command === hint.command &&
        candidate.command !== SET_MODE_COMMAND_ID &&
        entryAppliesInMode(candidate, mode),
    );
    return entry ? [{ keys: keysOf(keymap, entry.keys, platform), label: hint.label }] : [];
  });
}

export interface ModeLineProps {
  /** where the cursor is: the page's title ("Tasks") */
  context?: ReactNode;
}

/**
 * The mode line for a keymap with modes (Vim): the `StatusLine` with the dispatcher's mode, the
 * keys typed so far, and the mode's keys on the right. The workspace layout passes it to the shell
 * while Vim mode is on.
 */
export function ModeLine({ context }: ModeLineProps) {
  const { keymap, platform } = useKeyboard();
  const { mode, pending, count } = useKeyboardState();
  const commands = useCommandList();
  const registered = useMemo(() => new Set(commands.map((command) => command.id)), [commands]);
  const hints = useMemo(
    () => modeHints(keymap, mode, registered, platform),
    [keymap, mode, registered, platform],
  );
  const lineMode = (LINE_MODES as readonly string[]).includes(mode)
    ? (mode as StatusLineMode)
    : 'normal';
  return (
    <StatusLine
      mode={lineMode}
      context={context}
      pending={pendingText(count, pending)}
      hints={hints}
    />
  );
}
