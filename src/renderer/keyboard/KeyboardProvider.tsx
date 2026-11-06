import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePlatform, type Platform } from '../components/lib/platform';
import { CommandRegistry, type Command } from './commands';
import { KeyDispatcher, type KeyboardState } from './dispatcher';
import type { Keymap } from './keymap';
import { UndoStack, type Undoable } from './undo';

interface KeyboardContextValue {
  registry: CommandRegistry;
  undoStack: UndoStack;
  dispatcher: KeyDispatcher;
  keymap: Keymap;
  platform: Platform;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

/** `app.undo`: takes back the newest entry of the undo stack. Registered by `KeyboardProvider`. */
export const UNDO_COMMAND_ID = 'app.undo';

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
    return { registry, undoStack, dispatcher };
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
      ]),
    [core],
  );

  const value = useMemo(
    () => ({ ...core, keymap, platform: activePlatform }),
    [core, keymap, activePlatform],
  );
  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
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

/** The active keymap. */
export function useKeymap(): Keymap {
  return useKeyboard().keymap;
}
