import type { Platform } from '@renderer/components/lib/platform';
import type { Command, CommandArgs, CommandContext, CommandResult } from './commands';
import type { CommandRegistry } from './commands';
import { entryAppliesInMode, keymapModes, type Keymap, type KeymapEntry } from './keymap';
import { parseKeys, strokeFromEvent, type Stroke } from './keys';
import { activeScopes, type Scope } from './scopes';
import { isUndoable, type UndoStack } from './undo';

export const DEFAULT_SEQUENCE_TIMEOUT = 1000;

/** What the dispatcher is in the middle of, for a status line or a which-key popup. */
export interface KeyboardState {
  mode: string;
  /** the strokes of a sequence typed so far (`['g']` after `g`) */
  pending: readonly Stroke[];
  /** the count typed so far, when the keymap takes counts */
  count: number | undefined;
}

/** Where a key was typed: not in a typing target, in a form field, or in `contenteditable`. */
type TypingTarget = 'none' | 'input' | 'editor';

interface CompiledEntry {
  entry: KeymapEntry;
  strokes: Stroke[];
}

type Decision =
  | { kind: 'none' }
  | { kind: 'exact'; entry: CompiledEntry }
  | { kind: 'prefix'; fallback: CompiledEntry | undefined };

export interface KeyDispatcherOptions {
  keymap: Keymap;
  registry: CommandRegistry;
  undoStack: UndoStack;
  platform: Platform;
  /** the document scopes are read from; the global one by default */
  document?: Document;
  /** a command that threw or rejected; `console.error` by default */
  onError?: (error: unknown, command: Command) => void;
}

// input types that don't take text: keys pressed on them are not typing
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function typingTarget(target: Element | null): TypingTarget {
  if (!target) return 'none';
  if (target.closest('[contenteditable]:not([contenteditable="false"])')) return 'editor';
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return 'input';
  if (tag === 'INPUT') {
    const type = (target.getAttribute('type') ?? 'text').toLowerCase();
    return NON_TEXT_INPUTS.has(type) ? 'none' : 'input';
  }
  return 'none';
}

function allowedIn(entry: KeymapEntry, typing: TypingTarget, composing: boolean): boolean {
  if (composing) return entry.allowInTyping === true;
  if (typing === 'input') return entry.allowInTyping === true;
  if (typing === 'editor') return entry.allowInEditor === true;
  return true;
}

function startsWith(strokes: readonly Stroke[], prefix: readonly Stroke[]): boolean {
  return prefix.every((stroke, i) => strokes[i] === stroke);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as Promise<unknown> | undefined)?.then === 'function';
}

/**
 * The one `keydown` listener (on the window, in the capture phase) that turns keys into commands.
 * It knows nothing of React: `KeyboardProvider` builds one and attaches it.
 *
 * For each key it:
 * 1. skips lone modifiers;
 * 2. reads a count prefix when the keymap takes counts (`3`, `12`), outside typing targets;
 * 3. appends the stroke to the pending sequence;
 * 4. walks the active scopes from the innermost out, taking the first scope with a binding that
 *    is in the current mode, allowed where the key was typed, and whose command is registered and
 *    enabled: a binding these strokes start waits for the next stroke (or the timeout, after
 *    which a binding they complete in that scope runs), and one they complete runs;
 * 5. with no such binding, drops the sequence and lets the key through.
 *
 * A key it uses has its default prevented and stops propagating.
 */
export class KeyDispatcher {
  private keymap: Keymap;
  private platform: Platform;
  private compiled: CompiledEntry[] = [];
  private state: KeyboardState;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly registry: CommandRegistry;
  private readonly undoStack: UndoStack;
  private readonly doc: Document;
  private onError!: (error: unknown, command: Command) => void;

  constructor(options: KeyDispatcherOptions) {
    this.keymap = options.keymap;
    this.platform = options.platform;
    this.registry = options.registry;
    this.undoStack = options.undoStack;
    this.doc = options.document ?? document;
    this.setOnError(options.onError);
    this.state = { mode: keymapModes(this.keymap)[0], pending: [], count: undefined };
    this.compile();
  }

  // ---------- configuration ----------

  /** swaps the keymap (the default one for Vim's); a mode the new one lacks becomes its first */
  setKeymap(keymap: Keymap): void {
    if (keymap === this.keymap) return;
    this.keymap = keymap;
    this.compile();
    const modes = keymapModes(keymap);
    this.clearSequence();
    this.setState({ mode: modes.includes(this.state.mode) ? this.state.mode : modes[0] });
  }

  setPlatform(platform: Platform): void {
    if (platform === this.platform) return;
    this.platform = platform;
    this.compile();
  }

  /** where a command that threw or rejected is reported; `console.error` when `undefined` */
  setOnError(onError: ((error: unknown, command: Command) => void) | undefined): void {
    this.onError =
      onError ?? ((error, command) => console.error(`Command ${command.id} failed:`, error));
  }

  /** listens on `target`'s `keydown` in the capture phase; returns the function that stops */
  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
    target.addEventListener('keydown', this.handleKeyDown, true);
    return () => {
      target.removeEventListener('keydown', this.handleKeyDown, true);
      this.clearSequence();
    };
  }

  // ---------- state ----------

  getState = (): KeyboardState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setMode = (mode: string): void => {
    this.clearSequence();
    if (mode !== this.state.mode) this.setState({ mode });
  };

  // ---------- running commands ----------

  /**
   * Runs a command by id where focus is now, as ⌘K, the app menu and the `:` line do. Returns
   * whether it ran: `false` when it isn't registered or isn't enabled.
   */
  run = (commandId: string, args: CommandArgs = {}): boolean => {
    const scopes = activeScopes(this.doc.activeElement, this.doc);
    return this.execute(commandId, args, scopes);
  };

  // ---------- keys ----------

  handleKeyDown = (event: KeyboardEvent): void => {
    const stroke = strokeFromEvent(event);
    if (stroke === null) return;
    const target = this.targetOf(event);
    const typing = typingTarget(target);
    // the first key an IME takes can come before `isComposing` is set, but Chromium sends it as
    // `key: 'Process'`, which isn't a stroke (`strokeFromEvent`)
    const composing = event.isComposing;
    const scopes = activeScopes(target, this.doc);

    if (this.readsCount(stroke, typing, composing)) {
      this.stopTimer();
      this.setState({ count: (this.state.count ?? 0) * 10 + Number(stroke) });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const sequence = [...this.state.pending, stroke];
    const decision = this.decide(sequence, scopes, typing, composing);

    if (decision.kind === 'none') {
      const wasPending = this.state.pending.length > 0 || this.state.count !== undefined;
      this.clearSequence();
      // the key ended a sequence or count that matched nothing: it was meant for the keymap
      if (wasPending) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (decision.kind === 'prefix') {
      this.stopTimer();
      this.setState({ pending: sequence });
      const fallback = decision.fallback;
      this.timer = setTimeout(() => {
        const count = this.state.count;
        this.clearSequence();
        if (fallback) this.runEntry(fallback.entry, count, scopes);
      }, this.keymap.sequenceTimeout ?? DEFAULT_SEQUENCE_TIMEOUT);
      return;
    }

    const count = this.state.count;
    this.clearSequence();
    this.runEntry(decision.entry.entry, count, scopes);
  };

  private readsCount(stroke: Stroke, typing: TypingTarget, composing: boolean): boolean {
    if (!this.keymap.counts || typing !== 'none' || composing) return false;
    if (this.state.pending.length > 0 || !/^[0-9]$/.test(stroke)) return false;
    // a leading 0 is a key of its own (Vim's "start of line"); after a digit it's a digit
    return stroke !== '0' || this.state.count !== undefined;
  }

  private decide(
    sequence: readonly Stroke[],
    scopes: readonly Scope[],
    typing: TypingTarget,
    composing: boolean,
  ): Decision {
    const ctx = this.context(scopes);
    for (const scope of scopes) {
      let exact: CompiledEntry | undefined;
      let prefix = false;
      for (const compiled of this.compiled) {
        const { entry, strokes } = compiled;
        if (entry.scope !== scope || !entryAppliesInMode(entry, this.state.mode)) continue;
        if (strokes.length < sequence.length || !startsWith(strokes, sequence)) continue;
        if (!allowedIn(entry, typing, composing) || !this.available(entry.command, ctx)) continue;
        if (strokes.length === sequence.length) exact ??= compiled;
        else prefix = true;
      }
      if (prefix) return { kind: 'prefix', fallback: exact };
      if (exact) return { kind: 'exact', entry: exact };
    }
    return { kind: 'none' };
  }

  private available(commandId: string, ctx: CommandContext): boolean {
    const command = this.registry.get(commandId);
    if (!command) return false;
    try {
      return command.enabled?.(ctx) ?? true;
    } catch (error) {
      this.onError(error, command);
      return false;
    }
  }

  private runEntry(entry: KeymapEntry, count: number | undefined, scopes: readonly Scope[]): void {
    const args: CommandArgs = { ...entry.args };
    if (count !== undefined) args.count = count;
    this.execute(entry.command, args, scopes);
  }

  private execute(commandId: string, args: CommandArgs, scopes: readonly Scope[]): boolean {
    const command = this.registry.get(commandId);
    const ctx = this.context(scopes);
    if (!command || !this.available(commandId, ctx)) return false;
    let result: CommandResult;
    try {
      result = command.run(ctx, args);
    } catch (error) {
      this.onError(error, command);
      return true;
    }
    if (isPromise(result)) {
      result.then(
        (value) => {
          if (isUndoable(value)) this.undoStack.push(value);
        },
        (error: unknown) => this.onError(error, command),
      );
    } else if (isUndoable(result)) {
      this.undoStack.push(result);
    }
    return true;
  }

  private context(scopes: readonly Scope[]): CommandContext {
    return {
      platform: this.platform,
      mode: this.state.mode,
      setMode: this.setMode,
      scopes,
      undoStack: this.undoStack,
      run: (commandId, args = {}) => this.execute(commandId, args, scopes),
    };
  }

  // ---------- helpers ----------

  private compile(): void {
    const compiled: CompiledEntry[] = [];
    for (const entry of this.keymap.entries) {
      try {
        compiled.push({ entry, strokes: parseKeys(entry.keys, this.platform) });
      } catch (error) {
        console.error(`Keymap ${this.keymap.id}: skipping "${entry.keys}":`, error);
      }
    }
    this.compiled = compiled;
  }

  private targetOf(event: KeyboardEvent): Element | null {
    const target = event.target;
    if (target && typeof (target as Element).closest === 'function') return target as Element;
    return this.doc.activeElement;
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private clearSequence(): void {
    this.stopTimer();
    if (this.state.pending.length > 0 || this.state.count !== undefined) {
      this.setState({ pending: [], count: undefined });
    }
  }

  private setState(change: Partial<KeyboardState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}
