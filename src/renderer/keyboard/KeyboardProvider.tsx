import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePlatform, type Platform } from '../components/lib/platform';
import { CommandRegistry, type Command, type CommandArgs } from './commands';
import { KeyDispatcher, type KeyboardState } from './dispatcher';
import type { Keymap } from './keymap';
import { UndoStack, type Undoable } from './undo';
import { SET_MODE_COMMAND_ID } from './vim-keymap';
import { cursorCommands } from './cursor';
import { HintContext, HintRegistry } from './hints';
import { HINT_MODE, HintOverlay } from './HintOverlay';

interface KeyboardContextValue {
  registry: CommandRegistry;
  /** the elements registered for Vim's `f` hints (`useHintTarget`) */
  hints: HintRegistry;
  undoStack: UndoStack;
  dispatcher: KeyDispatcher;
  keymap: Keymap;
  platform: Platform;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

/** `app.undo`: takes back the newest entry of the undo stack. Registered by `KeyboardProvider`. */
export const UNDO_COMMAND_ID = 'app.undo';
/** `app.redo`: does the newest undone entry again (Vim's `Ctrl-r`). */
export const REDO_COMMAND_ID = 'app.redo';
/** `app.repeat`: runs the last change made by its keys again (Vim's `.`). */
export const REPEAT_COMMAND_ID = 'app.repeat';
/** `hints.show`: labels every target on screen (Vim's `f`; `HintOverlay`). */
export const SHOW_HINTS_COMMAND_ID = 'hints.show';

export interface KeyboardProviderProps {
  /** the active keymap; swapping it (default for Vim) keeps the registry and the undo stack */
  keymap: Keymap;
  /** the platform `mod` is read for; the window frame's (`usePlatform`) by default */
  platform?: Platform;
  /** a command that threw or rejected; `console.error` by default */
  onError?: (error: unknown, command: Command) => void;
  children?: ReactNode;
}

/**
 * The keyboard layer: the command registry, the undo stack and the dispatcher listening on the
 * window. Mount one, around the app.
 */
export function KeyboardProvider({ keymap, platform, onError, children }: KeyboardProviderProps) {
  const framePlatform = usePlatform();
  const activePlatform = platform ?? framePlatform;
  const [core] = useState(() => {
    const registry = new CommandRegistry();
    const undoStack = new UndoStack();
    const dispatcher = new KeyDispatcher({
      keymap,
      registry,
      undoStack,
      platform: activePlatform,
    });
    return { registry, undoStack, dispatcher, hints: new HintRegistry() };
  });

  useEffect(() => core.dispatcher.setKeymap(keymap), [core, keymap]);
  useEffect(() => core.dispatcher.setPlatform(activePlatform), [core, activePlatform]);
  useEffect(() => core.dispatcher.setOnError(onError), [core, onError]);
  useEffect(() => core.dispatcher.attach(window), [core]);
  useEffect(
    () =>
      core.registry.register([
        {
          id: UNDO_COMMAND_ID,
          title: 'Undo',
          scope: 'global',
          run: (ctx) => {
            ctx.undoStack.undo().catch((error: unknown) => console.error('Undo failed:', error));
          },
          enabled: (ctx) => ctx.undoStack.size > 0,
        },
        {
          id: REDO_COMMAND_ID,
          title: 'Redo',
          scope: 'global',
          run: (ctx) => {
            ctx.undoStack.redo().catch((error: unknown) => console.error('Redo failed:', error));
          },
          enabled: (ctx) => ctx.undoStack.redoSize > 0,
        },
        {
          id: REPEAT_COMMAND_ID,
          title: 'Repeat',
          scope: 'global',
          run: (_ctx, { count }) => void core.dispatcher.repeat(count),
        },
        {
          id: SET_MODE_COMMAND_ID,
          title: 'Change mode',
          scope: 'global',
          run: (ctx, { mode }) => {
            if (typeof mode === 'string') ctx.setMode(mode);
          },
        },
        {
          id: SHOW_HINTS_COMMAND_ID,
          title: 'Hints',
          scope: 'global',
          run: (ctx) => ctx.setMode(HINT_MODE),
        },
        ...cursorCommands(),
      ]),
    [core],
  );

  const value = useMemo(
    () => ({ ...core, keymap, platform: activePlatform }),
    [core, keymap, activePlatform],
  );
  return (
    <KeyboardContext.Provider value={value}>
      <HintContext.Provider value={core.hints}>
        {children}
        <HintOverlay />
      </HintContext.Provider>
    </KeyboardContext.Provider>
  );
}

export function useKeyboard(): KeyboardContextValue {
  const value = useContext(KeyboardContext);
  if (!value) throw new Error('useKeyboard needs a KeyboardProvider');
  return value;
}

/**
 * Registers commands while the component is mounted. They re-register when an id, title or scope
 * changes; `run` and `enabled` are read from the latest render, so they may close over props and
 * state without memoising.
 */
export function useCommands(commands: readonly Command[]): void {
  const { registry } = useKeyboard();
  const latest = useRef(commands);
  useEffect(() => {
    latest.current = commands;
  });
  const signature = commands
    .map(({ id, title, scope }) => `${id}\u0000${title}\u0000${scope}`)
    .join('\n');
  useEffect(() => {
    const current = (i: number) => latest.current[i];
    return registry.register(
      latest.current.map(({ id, title, scope }, i) => ({
        id,
        title,
        scope,
        run: (ctx, args) => current(i).run(ctx, args),
        enabled: (ctx) => current(i).enabled?.(ctx) ?? true,
      })),
    );
  }, [registry, signature]);
}

/** The commands registered now, for ⌘K and the shortcuts dialog. */
export function useCommandList(): readonly Command[] {
  const { registry } = useKeyboard();
  return useSyncExternalStore(registry.subscribe, registry.list);
}

/** The dispatcher's mode, pending sequence and count, for a status line or a which-key popup. */
export function useKeyboardState(): KeyboardState {
  const { dispatcher } = useKeyboard();
  return useSyncExternalStore(dispatcher.subscribe, dispatcher.getState);
}

/** The app's undo stack, for the toast's Undo button. */
export function useUndoStack(): UndoStack {
  return useKeyboard().undoStack;
}

/** The undo stack's entries, oldest first, re-rendering as they change. */
export function useUndoEntries(): readonly Undoable[] {
  const { undoStack } = useKeyboard();
  return useSyncExternalStore(undoStack.subscribe, undoStack.list);
}

/**
 * Runs a registered command by its id, as its key would (`KeyDispatcher.run`): ⌘K's "Go to" rows.
 * Returns false when it isn't registered or enabled.
 */
export function useRunCommand(): (commandId: string, args?: CommandArgs) => boolean {
  const { dispatcher } = useKeyboard();
  return useCallback((commandId, args) => dispatcher.run(commandId, args), [dispatcher]);
}

/** The active keymap. */
export function useKeymap(): Keymap {
  return useKeyboard().keymap;
}
