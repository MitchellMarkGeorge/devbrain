import { ExternalSourceId } from '@common/ids';
import { z } from 'zod';
import { Auth } from '../integrations/auth';
import { SyncCursor } from '../integrations/providers/provider';
import { SyncTarget } from './sync-state';
import { SyncSummary } from './types';

// The parts of a sync run that differ by source type. SyncEngine owns everything else: the gate
// (a source or integration that is off, needs reauth or is rate limited), the mode, the page loop,
// committing each page with its cursor in one transaction, and recording how the run ended. A
// Syncer is picked by the source's type (TaskSyncer, EventSyncer), and is the only place that
// knows what a page of that type holds and how SyncWriter applies it.
//
// Every write of a run happens in `apply`, inside the transaction that also saves the page's
// cursor, so a run's writes and its cursor never get out of step. `start` may read and call the
// provider, and writes nothing.

export interface Syncer {
  // how this type's cursor is stored; an unreadable one starts a fresh initial sync
  cursorSchema: z.ZodType<SyncCursor>;
  // Gets ready for one run and starts it: reads, and calls the provider where the run needs it
  // first (an events source lists its calendars). Writes nothing. Throws to fail the run.
  start(context: RunContext): Promise<ActiveSync>;
}

// what a syncer is given to start a run
export interface RunContext {
  sourceId: ExternalSourceId;
  // the source's stored state and its integration's
  target: SyncTarget;
  auth: Auth;
  // the stored cursor, validated with the syncer's cursorSchema; null when there is none
  cursor: SyncCursor | null;
}

// what every page has, whatever its type
export interface SyncPage {
  nextCursor: SyncCursor;
  done: boolean;
  // items that failed to validate or map, counted in the run summary
  skipped: number;
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
