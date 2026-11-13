import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Kbd, StatusLine, type StatusLineHint, type StatusLineMode } from '../components';
import { entryAppliesInMode, type Keymap } from './keymap';
import { keyLabels, parseKeys, strokeLabel, type Stroke } from './keys';
import { activeScopes, type Scope } from './scopes';
import styles from './ModeLine.module.css';
import type { Platform } from '../components/lib/platform';
import { useCommandList, useCommands, useKeyboard, useKeyboardState } from './KeyboardProvider';
import { COMMAND_MODE, CommandLine } from './CommandLine';
import { OPEN_COMMAND_LINE_ID } from './command-line';
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

/** The keys the line names while focus is in the editor, whose Vim keys are its own. */
const EDITOR_HINTS: Record<string, readonly StatusLineHint[]> = {
  normal: [
    { keys: 'i', label: 'insert' },
    { keys: 'v', label: 'visual' },
    { keys: 'Esc', label: 'leave editor' },
  ],
  insert: [
    { keys: 'Esc', label: 'normal mode' },
    { keys: '/', label: 'insert block' },
    { keys: '⌘B', label: 'bold' },
  ],
  visual: [
    { keys: 'd', label: 'delete' },
    { keys: 'y', label: 'copy' },
    { keys: '>', label: 'indent' },
    { keys: 'Esc', label: 'cancel' },
  ],
};
EDITOR_HINTS['visual-line'] = EDITOR_HINTS.visual;

// whether focus is in the rich text editor
function inEditor(): boolean {
  return document.activeElement?.closest('[contenteditable="true"]') != null;
}

/** Whether focus is in the editor, kept as focus moves (going in can leave the mode as it was). */
function useFocusInEditor(): boolean {
  const [editing, setEditing] = useState(inEditor);
  useEffect(() => {
    const update = () => setEditing(inEditor());
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return editing;
}

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

/** A key that can follow the strokes typed so far, and what it does: `t` "Tasks" after `g`. */
export interface Continuation {
  key: string;
  label: string;
}

/**
 * What can follow `pending` (Figma's which-key popup, `7703:55909`): the next stroke of each
 * binding in `mode` whose keys start with it, in an active scope, with its command registered, as
 * the innermost scope binds it. Left out: hidden bindings.
 */
export function continuations(
  keymap: Keymap,
  pending: readonly Stroke[],
  mode: string,
  scopes: readonly Scope[],
  commands: ReadonlyMap<string, string>,
  platform: Platform,
): Continuation[] {
  if (pending.length === 0) return [];
  const found = new Map<Stroke, Continuation>();
  for (const scope of scopes) {
    for (const entry of keymap.entries) {
      if (entry.scope !== scope || entry.hidden || !entryAppliesInMode(entry, mode)) continue;
      const title = commands.get(entry.command);
      if (title === undefined) continue;
      let strokes: Stroke[];
      try {
        strokes = parseKeys(entry.keys, platform);
      } catch {
        continue;
      }
      if (strokes.length <= pending.length) continue;
      if (!pending.every((stroke, i) => strokes[i] === stroke)) continue;
      const next = strokes[pending.length];
      if (found.has(next)) continue;
      const label = strokes.length === pending.length + 1 ? (entry.label ?? title) : '…';
      found.set(next, {
        key: strokeLabel(next, { upperCase: keymap.upperCaseKeys ?? true }),
        label: label.replace(/^Go to /, ''),
      });
    }
  }
  return [...found.values()];
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
  const editing = useFocusInEditor();
  // `:` opens the line drawn here, so the command lives here too
  useCommands([
    {
      id: OPEN_COMMAND_LINE_ID,
      title: 'Command line',
      scope: 'global',
      run: (ctx) => ctx.setMode(COMMAND_MODE),
    },
  ]);
  const commands = useCommandList();
  const titles = useMemo(
    () => new Map(commands.map((command) => [command.id, command.title])),
    [commands],
  );
  const registered = useMemo(() => new Set(titles.keys()), [titles]);
  // read as the keys are typed: where focus is says which scopes' bindings can follow
  const next =
    pending.length > 0
      ? continuations(
          keymap,
          pending,
          mode,
          activeScopes(document.activeElement, document),
          titles,
          platform,
        )
      : [];
  const hints = useMemo(
    () => modeHints(keymap, mode, registered, platform),
    [keymap, mode, registered, platform],
  );
  if (mode === COMMAND_MODE) return <CommandLine />;
  // the editor's Visual line is Visual, named for itself
  const lineMode =
    mode === 'visual-line'
      ? 'visual'
      : (LINE_MODES as readonly string[]).includes(mode)
        ? (mode as StatusLineMode)
        : 'normal';
  return (
    <StatusLine
      mode={lineMode}
      label={mode === 'visual-line' ? 'VISUAL LINE' : undefined}
      context={context}
      pending={pendingText(count, pending)}
      hints={editing ? (EDITOR_HINTS[mode] ?? hints) : hints}
      popup={
        next.length > 0 && (
          <div className={styles.whichKey} aria-label="Keys that can follow">
            <span className={styles.typed}>{pending.join(' ')} …</span>
            <ul className={styles.keys}>
              {next.map(({ key, label }) => (
                <li key={key} className={styles.row}>
                  <Kbd variant="raised">{key}</Kbd>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )
      }
    />
  );
}
