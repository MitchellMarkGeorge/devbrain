import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';

// What one call changed. A mutation's scope is open while it runs and closes when its response is
// built; the ChangeRouter adds core's changes to the open scope of the call that caused them
// (openScope), and broadcasts the rest. A handler adds what its service doesn't announce through
// ctx.changes, which is this scope.
export class ChangeScope {
  private readonly entities = new Set<ChangedEntity>();
  private closed = false;

  get isOpen(): boolean {
    return !this.closed;
  }

  // ignored once closed: the response has gone. Work that outlives its call reports through core's
  // events, which the ChangeRouter broadcasts once the scope has closed
  record(...entities: ChangedEntity[]): void {
    if (this.closed) return;
    for (const entity of entities) this.entities.add(entity);
  }

  // closes the scope and returns what it collected, in the order first recorded
  close(): ChangedEntity[] {
    this.closed = true;
    return [...this.entities];
  }
}

export type ScopeResult<T> =
  | { ok: true; value: T; changed: ChangedEntity[] }
  | { ok: false; error: unknown; changed: ChangedEntity[] };

const scopes = new AsyncLocalStorage<ChangeScope>();

/**
 * Runs `fn` in a new change scope and closes it once `fn` settles. `changed` is filled on failure
 * too: whatever committed before the throw is refetched. Core emits its changes synchronously, in
 * the async context of the call that made them, so a change made anywhere under `fn` (awaits
 * included) finds this scope through openScope.
 */
export function withChangeScope<T>(
  fn: (scope: ChangeScope) => T | Promise<T>,
): Promise<ScopeResult<T>> {
  const scope = new ChangeScope();
  return settle(scope, () => scopes.run(scope, () => fn(scope)));
}

/**
 * The same, with a scope only `fn` records into: openScope finds none under it, so core's changes
 * are broadcast. For a query, which changes nothing on purpose.
 */
export function withLocalScope<T>(
  fn: (scope: ChangeScope) => T | Promise<T>,
): Promise<ScopeResult<T>> {
  const scope = new ChangeScope();
  return settle(scope, () => scopes.exit(() => fn(scope)));
}

async function settle<T>(scope: ChangeScope, run: () => T | Promise<T>): Promise<ScopeResult<T>> {
  try {
    const value = await run();
    return { ok: true, value, changed: scope.close() };
  } catch (error) {
    return { ok: false, error, changed: scope.close() };
  }
}

/**
 * The scope of the call whose async context this runs in, while it is open. Undefined outside any
 * call, and once the call's response is built: work it started that finishes later (a sync run,
 * a note indexed after a restore) carries the context but no longer has a response to go in.
 */
export function openScope(): ChangeScope | undefined {
  const scope = scopes.getStore();
  return scope?.isOpen ? scope : undefined;
}
