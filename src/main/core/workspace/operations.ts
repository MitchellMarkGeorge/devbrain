import { WorkspaceClosedError } from '../shared/errors';

// Require an explicit entry for every synchronous public method. Promise-returning methods
// keep their rejection contract even when their implementation does not use `async`.
type SynchronousMethods<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => infer R
    ? R extends PromiseLike<unknown>
      ? never
      : K
    : never]: true;
};

/** Tracks concurrent service calls; closing rejects new calls and drains those already admitted. */
export class WorkspaceOperations {
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  readonly signal: AbortSignal = this.controller.signal;

  track<T extends object>(service: T, synchronous: SynchronousMethods<T>): T {
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
              if (!Object.hasOwn(synchronous, key)) {
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
    this.controller.abort(new WorkspaceClosedError());
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
