/**
 * What a command returns when it can be taken back: moving a task to trash returns "restore it".
 * The toast's Undo button, ⌘Z and later Vim's `u` pop the app's undo stack.
 */
export interface Undoable {
  /** what is undone, for the toast and menus: "Moved “Fix login” to trash" */
  label: string;
  undo: () => void | Promise<void>;
}

export function isUndoable(value: unknown): value is Undoable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Undoable).label === 'string' &&
    typeof (value as Undoable).undo === 'function'
  );
}

/** The app's undo stack: the last `limit` undoable commands, newest last. */
export class UndoStack {
  private entries: readonly Undoable[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly limit = 50) {}

  push(entry: Undoable): void {
    this.entries = [...this.entries, entry].slice(-this.limit);
    this.emit();
  }

  /** the entry `undo` would take back */
  peek(): Undoable | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** the entries, oldest first; a new array after every change (for `useSyncExternalStore`) */
  list = (): readonly Undoable[] => this.entries;

  get size(): number {
    return this.entries.length;
  }

  /**
   * Takes back the newest entry and returns it, or `undefined` when there is none. The entry
   * leaves the stack before its `undo` runs, so a failed undo is not tried twice; the error is
   * thrown to the caller.
   */
  async undo(): Promise<Undoable | undefined> {
    const entry = this.peek();
    if (!entry) return undefined;
    this.entries = this.entries.slice(0, -1);
    this.emit();
    await entry.undo();
    return entry;
  }

  /**
   * Takes back `entry` wherever it is on the stack (the toast's Undo, for the change it reported
   * when others have been pushed since), or `undefined` when it has gone. Like `undo`, it leaves
   * the stack before its `undo` runs.
   */
  async take(entry: Undoable): Promise<Undoable | undefined> {
    if (!this.entries.includes(entry)) return undefined;
    this.entries = this.entries.filter((other) => other !== entry);
    this.emit();
    await entry.undo();
    return entry;
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
