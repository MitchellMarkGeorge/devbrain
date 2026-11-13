/**
 * What a command returns when it can be taken back: moving a task to trash returns "restore it".
 * The toast's Undo button, ⌘Z and Vim's `u` pop the app's undo stack; Vim's `Ctrl-r` redoes.
 */
export interface Undoable {
  /** what is undone, for the toast and menus: "Moved “Fix login” to trash" */
  label: string;
  undo: () => void | Promise<void>;
  /** does it again once undone ("move it to trash again"); an entry without one can't be redone */
  redo?: () => void | Promise<void>;
}

export function isUndoable(value: unknown): value is Undoable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Undoable).label === 'string' &&
    typeof (value as Undoable).undo === 'function'
  );
}

/**
 * The app's undo stack: the last `limit` undoable commands, newest last. An entry undone that can
 * be redone goes on the redo stack, which a new entry empties, as in an editor.
 */
export class UndoStack {
  private entries: readonly Undoable[] = [];
  private undone: readonly Undoable[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly limit = 50) {}

  push(entry: Undoable): void {
    this.entries = [...this.entries, entry].slice(-this.limit);
    this.undone = [];
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

  /** how many entries `redo` can do again */
  get redoSize(): number {
    return this.undone.length;
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
    this.undid(entry);
    return entry;
  }

  /**
   * Does the newest undone entry again and puts it back on the undo stack, or returns `undefined`
   * when there is none. Like `undo`, it leaves the redo stack before its `redo` runs.
   */
  async redo(): Promise<Undoable | undefined> {
    const entry = this.undone[this.undone.length - 1];
    if (!entry?.redo) return undefined;
    this.undone = this.undone.slice(0, -1);
    this.emit();
    await entry.redo();
    this.entries = [...this.entries, entry].slice(-this.limit);
    this.emit();
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
    this.undid(entry);
    return entry;
  }

  clear(): void {
    if (this.entries.length === 0 && this.undone.length === 0) return;
    this.entries = [];
    this.undone = [];
    this.emit();
  }

  // an entry undone, once its undo has worked: on the redo stack if it can be redone
  private undid(entry: Undoable): void {
    if (!entry.redo) return;
    this.undone = [...this.undone, entry].slice(-this.limit);
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
