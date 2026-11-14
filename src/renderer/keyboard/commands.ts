import type { Platform } from '@renderer/components/lib/platform';
import type { Scope } from './scopes';
import type { Undoable, UndoStack } from './undo';

/** What a command is run with: the keymap entry's `args`, and the count typed before its keys. */
export interface CommandArgs {
  /** the count prefix (`3j`), when the keymap takes counts and one was typed */
  count?: number;
  [arg: string]: unknown;
}

/** What a command can see and do beyond its own closure. */
export interface CommandContext {
  platform: Platform;
  /** the keyboard's mode: one implicit mode in the default keymap; Vim's `normal`, `insert`, … */
  mode: string;
  setMode: (mode: string) => void;
  /** the scopes active where it ran, innermost first */
  scopes: readonly Scope[];
  undoStack: UndoStack;
  /** runs another command by id, as if its keys were pressed in the same place */
  run: (commandId: string, args?: CommandArgs) => boolean;
}

export type CommandResult = void | Undoable | Promise<void | Undoable>;

/**
 * Something the app can do, independent of keys. ⌘K, the shortcuts dialog, the app menu and later
 * Vim's `:` line all read the one registry, and keymaps bind keys to commands by `id`.
 */
export interface Command {
  /** `nav.tasks`, `task.new`, `list.down` */
  id: string;
  /** shown in ⌘K and the shortcuts dialog: "Go to Tasks" */
  title: string;
  /** where it applies */
  scope: Scope;
  /** does it; an `Undoable` it returns (or resolves to) goes on the undo stack */
  run: (ctx: CommandContext, args: CommandArgs) => CommandResult;
  /** whether it can run now; a disabled command's keys fall through to outer scopes */
  enabled?: (ctx: CommandContext) => boolean;
}

/**
 * The commands registered now. Several registrations of one id stack, and the newest wins until it
 * is unregistered: a page's `list.down` replaces nothing for good.
 */
export class CommandRegistry {
  private readonly stacks = new Map<string, Command[]>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly Command[] = [];

  /** registers commands and returns the function that unregisters them */
  register(commands: readonly Command[]): () => void {
    for (const command of commands) {
      const stack = this.stacks.get(command.id) ?? [];
      stack.push(command);
      this.stacks.set(command.id, stack);
    }
    this.changed();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      for (const command of commands) {
        const stack = this.stacks.get(command.id);
        if (!stack) continue;
        const index = stack.lastIndexOf(command);
        if (index !== -1) stack.splice(index, 1);
        if (stack.length === 0) this.stacks.delete(command.id);
      }
      this.changed();
    };
  }

  get(id: string): Command | undefined {
    const stack = this.stacks.get(id);
    return stack?.[stack.length - 1];
  }

  /** the live commands, one per id; a new array after every change (for `useSyncExternalStore`) */
  list = (): readonly Command[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    this.snapshot = [...this.stacks.values()].map((stack) => stack[stack.length - 1]);
    for (const listener of this.listeners) listener();
  }
}
