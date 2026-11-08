import type { Platform } from '../../components/lib/platform';
import { CommandRegistry, type Command, type CommandArgs } from '../../keyboard/commands';
import { KeyDispatcher } from '../../keyboard/dispatcher';
import type { Keymap, KeymapEntry } from '../../keyboard/keymap';
import { UndoStack } from '../../keyboard/undo';

export interface PressOptions {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  code?: string;
  isComposing?: boolean;
}

/** a `keydown` on `target` (the focused element), as the browser sends it */
export function press(target: EventTarget, key: string, options: PressOptions = {}): KeyboardEvent {
  const code =
    options.code ??
    (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : '');
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    shiftKey: options.shift ?? false,
    ctrlKey: options.ctrl ?? false,
    metaKey: options.meta ?? false,
    altKey: options.alt ?? false,
    isComposing: options.isComposing ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** a command that records each run's args */
export function recorder(id: string, scope: Command['scope'] = 'global') {
  const calls: CommandArgs[] = [];
  const command: Command = { id, title: id, scope, run: (_ctx, args) => void calls.push(args) };
  return { command, calls };
}

export function keymap(entries: KeymapEntry[], extra: Partial<Keymap> = {}): Keymap {
  return { id: 'test', title: 'Test', entries, ...extra };
}

/** a dispatcher listening on the window, with its registry and undo stack */
export function setUp(map: Keymap, platform: Platform = 'macos') {
  const registry = new CommandRegistry();
  const undoStack = new UndoStack();
  const errors: unknown[] = [];
  const dispatcher = new KeyDispatcher({
    keymap: map,
    registry,
    undoStack,
    platform,
    onError: (error) => errors.push(error),
  });
  const detach = dispatcher.attach(window);
  return { registry, undoStack, dispatcher, detach, errors };
}

/** an element in a `KeyScope`-style wrapper, attached to the document */
export function scoped(parent: Element, scope: string, options: { modal?: boolean } = {}) {
  const element = document.createElement('div');
  element.setAttribute('data-key-scope', scope);
  if (options.modal) element.setAttribute('data-key-modal', '');
  parent.appendChild(element);
  return element;
}

export function button(parent: Element): HTMLButtonElement {
  const element = document.createElement('button');
  parent.appendChild(element);
  return element;
}
