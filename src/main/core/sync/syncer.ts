import { ExternalSourceId } from '@common/ids';
import { z } from 'zod';
import { Auth } from '../integrations/auth';
import { SyncTarget } from './sync-state';
import { SyncCursor, SyncPage, SyncSummary } from './types';

// The parts of a sync run that differ by source type. SyncEngine owns everything else: the gate
// (a source or integration that is off, needs reauth or is rate limited), the page loop,
// committing each page with its cursor in one transaction, and recording how the run ended. A
// Syncer is picked by the source's type (TaskSyncer, EventSyncer), and is the only place that
// knows what that type's cursor holds, how it asks the provider's source for each page, and how
// SyncWriter applies it.
//
// Every write of a run happens in `apply`, inside the transaction that also saves the page's
// cursor, so a run's writes and its cursor never get out of step. `start` may read and call the
// provider, and writes nothing. A reconcile pass is the same: `reconcile` reads, and the writes it
// returns run in the engine's transaction.
//
// One syncer serves every source of its type and provider, as the provider's sources serve every
// account, so a syncer keeps nothing between runs: what a run needs is in its RunContext, and what
// has to outlive it is in the cursor.

export interface Syncer {
  // how this type's cursor is stored; an unreadable one starts a fresh initial sync
  cursorSchema: z.ZodType<SyncCursor>;
  // Gets ready for one run and starts it: reads, and calls the provider where the run needs it
  // first (an events source lists its calendars). Writes nothing. Throws to fail the run.
  start(context: RunContext): Promise<ActiveSync>;
  // A reconcile pass, for a type whose pages cannot see everything that changed (tasks: a
  // reassignment or a deletion). Reads and calls the provider, writes nothing, and returns the
  // pass's writes. Null when the signal aborted before it finished reading. A type without it has
  // no reconcile, and the engine skips the pass as unsupported.
  reconcile?(context: ReconcileContext): Promise<PendingReconcile | null>;
}

// what a syncer is given to start a run
export interface RunContext {
  sourceId: ExternalSourceId;
  // the source's stored state and its integration's
  target: SyncTarget;
  auth: Auth;
  // the stored cursor, validated with the syncer's cursorSchema; null when there is none
  cursor: SyncCursor | null;
  // the run's signal, passed to every provider call so an abort cancels the request in flight
  signal?: AbortSignal;
}

// what a syncer is given for a reconcile pass
export interface ReconcileContext {
  sourceId: ExternalSourceId;
  target: SyncTarget;
  auth: Auth;
  // checked between provider calls, and passed to each so an abort cancels the request in flight
  signal?: AbortSignal;
}

// a reconcile pass that has done its reading
export interface PendingReconcile {
  // items the provider returned that could not be read, counted in the run summary
  skipped: number;
  // the pass's writes; called inside the engine's transaction
  apply(): SyncSummary;
}

// The run once started: the cursor it begins from, and how it pulls and applies each page.
// Thrown away when the run ends.
export interface ActiveSync<Page extends SyncPage = SyncPage> {
  cursor: SyncCursor | null;
  // one provider call: the page after `cursor`
  pull(cursor: SyncCursor | null): Promise<Page>;
  // Writes the page, and anything else the run writes (an events source's calendar rows, on its
  // first page). Called inside the engine's transaction, which then saves page.nextCursor, so the
  // page and its cursor commit together. Null writes nothing and ends the run.
  apply(page: Page): SyncSummary | null;
}

// the summary of a page that wrote nothing
export const NOTHING_APPLIED: SyncSummary = { inserted: 0, updated: 0, removed: 0, changed: [] };

// two summaries as one: the counts added up, the changed types each once
export function combineSummaries(a: SyncSummary, b: SyncSummary): SyncSummary {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    removed: a.removed + b.removed,
    changed: [...new Set([...a.changed, ...b.changed])],
  };
}
