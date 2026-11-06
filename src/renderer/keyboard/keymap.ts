import type { Scope } from './scopes';

/** The mode of a keymap that declares none. */
export const DEFAULT_MODE = 'default';

/** One binding: these keys, in this scope and mode, run this command. */
export interface KeymapEntry {
  scope: Scope;
  /** the mode it applies in; every mode when omitted */
  mode?: string;
  /** strokes separated by spaces (`g t`), modifiers joined by `+` (`mod+k`); see `keys.ts` */
  keys: string;
  /** a `Command`'s id */
  command: string;
  /** passed to the command's `run`, with the count */
  args?: Record<string, unknown>;
  /** also fires in inputs, text areas and selects, and during IME composition */
  allowInTyping?: boolean;
  /**
   * also fires in `contenteditable` (the rich text editor), which otherwise keeps its keys: TipTap
   * binds ⌘K to Link, so search's ⌘K leaves this off
   */
  allowInEditor?: boolean;
  /** the shortcuts dialog's section; by default the scope's ("Everywhere" for `global`) */
  group?: string;
  /** the shortcuts dialog's row label, when not the command's title ("Down / up") */
  label?: string;
  /** left out of the shortcuts dialog */
  hidden?: boolean;
}

/**
 * Bindings as data. The default keymap has one implicit mode; a Vim keymap declares `modes`, turns
 * on `counts` and writes keys in their own case.
 */
export interface Keymap {
  id: string;
  title: string;
  /** the modes it has, the first being the one it starts in; `[DEFAULT_MODE]` when omitted */
  modes?: readonly string[];
  /** whether a number typed before keys is a count (`3j`); off by default */
  counts?: boolean;
  /** how long a sequence waits for its next stroke, in ms; 1000 by default */
  sequenceTimeout?: number;
  /** whether the shortcuts dialog draws lone letters in capitals (`G T`); on by default */
  upperCaseKeys?: boolean;
  /** the order of the shortcuts dialog's sections; others follow in the order they appear */
  groups?: readonly string[];
  entries: readonly KeymapEntry[];
}

export function keymapModes(keymap: Keymap): readonly string[] {
  return keymap.modes && keymap.modes.length > 0 ? keymap.modes : [DEFAULT_MODE];
}

export function entryAppliesInMode(entry: KeymapEntry, mode: string): boolean {
  return entry.mode === undefined || entry.mode === mode;
}
