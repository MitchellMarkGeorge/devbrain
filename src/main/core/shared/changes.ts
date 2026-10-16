export type ChangeListener<C> = (change: C) => void;

// The listeners of one service's changes (integrations, tasks, projects, notes), for in-process
// subscribers such as the scheduler and the workspace keeping search in step. A failing listener is
// logged and must not fail the write that emitted, or the other listeners.
export class ChangeListeners<C> {
  private readonly listeners = new Set<ChangeListener<C>>();

  // `name` labels a listener's error in the log, e.g. "Task"
  constructor(private readonly name: string) {}

  // returns a function that unsubscribes the listener
  add(listener: ChangeListener<C>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(change: C): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error(`${this.name} change listener threw:`, error);
      }
    }
  }
}
