/** Tracks concurrent service calls; closing rejects new calls and drains those already admitted. */
export class WorkspaceOperations {
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  readonly signal: AbortSignal = this.controller.signal;

  track<T extends object>(service: T): T {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(service, {
      get: (target, key, receiver) => {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== 'function') return value;
        if (!methods.has(key)) {
          methods.set(key, (...args: unknown[]) => {
            // Preserve synchronous APIs (search and subscriptions) and invoke async calls now,
            // so independent operations are never queued behind one another.
            if (this.signal.aborted) {
              if (value.constructor.name === 'AsyncFunction') {
                return Promise.reject(this.signal.reason);
              }
              this.signal.throwIfAborted();
            }
            const result = Reflect.apply(value, target, args);
            if (!(result instanceof Promise)) return result;
            this.pending.add(result);
            const settled = () => this.pending.delete(result);
            void result.then(settled, settled);
            return result;
          });
        }
        return methods.get(key);
      },
    });
  }

  cancel(): void {
    this.controller.abort(new DOMException('Workspace is closing', 'AbortError'));
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
