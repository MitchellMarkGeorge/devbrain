export type ChangeListener<C> = (change: C) => void;

// The listeners of one service's changes, for in-process subscribers such as the workspace keeping
// search in step. Same contract as IntegrationService.onChange: a failing listener must not fail
// the write that emitted, or the other listeners.
export class ChangeListeners<C> {
  private readonly listeners = new Set<ChangeListener<C>>();

  // `name` labels a listener's error in the log, e.g. "task"
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
        console.error(`A ${this.name} change listener threw:`, error);
      }
    }
  }
}
