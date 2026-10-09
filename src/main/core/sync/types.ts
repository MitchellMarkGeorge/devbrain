import { ExternalSourceId } from '@common/ids';
import type { TaskPage } from '../integrations/providers/provider';

// what SyncWriter.applyTaskPage takes: the items of a pulled page, or of a lookup result
export type TaskPageItems = Pick<TaskPage, 'projects' | 'tasks' | 'removedIds'>;

// the entity types a write touched, so the renderer refetches only those queries
export type SyncEntityType = 'task' | 'project';

// what one writer call did; the engine passes it to its progress callback
export interface SyncSummary {
  // new entities, each with a new link
  inserted: number;
  // entities whose provider-owned fields were written, restored ones included
  updated: number;
  // entities archived because they left scope
  removed: number;
  changed: SyncEntityType[];
}

// string values, as they appear in the run's log line

// an initial pass walks everything in scope; an incremental one walks changes since the cursor
export enum SyncMode {
  INITIAL = 'initial',
  INCREMENTAL = 'incremental',
}

// sent after each committed page, so the renderer can refetch what changed
export interface SyncProgress {
  sourceId: ExternalSourceId;
  phase: SyncMode;
  // pages committed so far in this run, this one included
  pages: number;
  // this page's writer summary
  summary: SyncSummary;
  // inserted, updated and removed so far in this run
  itemsApplied: number;
}

export type SyncProgressListener = (progress: SyncProgress) => void;

// why a run did nothing
export enum SyncSkipReason {
  SOURCE_DISABLED = 'source_disabled',
  INTEGRATION_DISABLED = 'integration_disabled',
  NEEDS_REAUTH = 'needs_reauth',
  // the provider's retry time from a rate-limited run has not passed
  RATE_LIMITED = 'rate_limited',
  ALREADY_RUNNING = 'already_running',
  // the source's type has no sync yet, or its provider does not serve it
  UNSUPPORTED = 'unsupported',
}

export enum SyncRunOutcome {
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  ABORTED = 'aborted',
  RATE_LIMITED = 'rate_limited',
  FAILED = 'failed',
}

// what one runSource call did; also what the run's log line reports
export interface SyncRunResult {
  sourceId: ExternalSourceId;
  outcome: SyncRunOutcome;
  skipReason?: SyncSkipReason;
  mode: SyncMode | null;
  // pages committed
  pages: number;
  inserted: number;
  updated: number;
  removed: number;
  // items the provider could not map, left out of their pages
  skipped: number;
  changed: SyncEntityType[];
  durationMs: number;
  // set when the outcome is failed or rate_limited
  error?: Error;
  retryAt?: Date;
}
