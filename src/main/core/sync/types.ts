import { ExternalSourceId, TaskId } from '@common/ids';
import type { EventPage, LookupResult, TaskPage } from '../integrations/providers/provider';

// what SyncWriter.applyTaskPage takes: the items of a pulled page, or of a lookup result
export type TaskPageItems = Pick<TaskPage, 'projects' | 'tasks' | 'removedIds'>;

// what SyncWriter.applyReconcile takes: a reconcile pass's lookup result, empty when nothing was
// looked up
export type ReconcileItems = Pick<LookupResult, 'tasks' | 'projects' | 'gone' | 'goneProjects'>;

// What a reconcile pass looks up, from SyncWriter.planReconcile. It compares the provider's
// snapshot of open items assigned to the user with the source's links. Every entry is an external
// id (`external_links.externalId`, the provider's own id), not a DevBrain id or a display key.
export interface ReconcilePlan {
  // external task ids of watched links (synced, not settled, task still open locally) that are
  // missing from the snapshot: reassigned, deleted or trashed since the last run, or closed in a
  // way the incremental pull has not picked up yet
  candidates: string[];
  // external task ids in the snapshot with no synced link: a removed link (e.g. restored from the
  // trash) or none yet (e.g. assigned since the last pull). Detached links are left out
  returning: string[];
  // external project ids of every project the source mirrors (link synced), so one deleted in the
  // provider is noticed; sent only with a lookup the other two lists already need
  projectIds: string[];
}

// what SyncWriter.applyEventPage takes: the items of a pulled page
export type EventPageItems = Pick<EventPage, 'events' | 'cancelledIds'>;

// the entity types a write touched, so the renderer refetches only those queries
export type SyncEntityType = 'task' | 'project' | 'event' | 'calendar';

// what one writer call did; the engine passes it to its progress callback
export interface SyncSummary {
  // new entities, each with a new link
  inserted: number;
  // entities whose provider-owned fields were written, restored ones included
  updated: number;
  // entities archived because they left scope; for events, deleted or hidden
  removed: number;
  changed: SyncEntityType[];
}

// string values, as they appear in the run's log line

// an initial pass walks everything in scope; an incremental one walks changes since the cursor;
// a reconcile pass diffs the mirror against the provider's current assignments
export enum SyncMode {
  INITIAL = 'initial',
  INCREMENTAL = 'incremental',
  RECONCILE = 'reconcile',
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
  // reconcile waits for the first full pass, which brings in everything the snapshot would
  INITIAL_SYNC_PENDING = 'initial_sync_pending',
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

// why SyncEngine.reattachTasks wrote nothing, beyond the reasons a run is skipped for
export enum ReattachRefusal {
  // the issue no longer resolves, or resolves to a trashed one
  GONE = 'gone',
  // the issue resolves but is assigned to someone else
  UNASSIGNED = 'unassigned',
  // the issue resolves but could not be mapped
  UNREADABLE = 'unreadable',
  // the task's link was no longer detached by the time the lookup came back
  CHANGED = 'changed',
}

// what SyncWriter.reattachTasks did
export interface ReattachSummary extends SyncSummary {
  // tasks whose links went back to synced and were refreshed
  reattached: TaskId[];
  // detached tasks that stayed detached and were moved out from under a reattached parent
  promoted: TaskId[];
}

// what SyncEngine.reattachTasks did; nothing is written unless ok
export type ReattachResult =
  | { ok: true; summary: ReattachSummary }
  | { ok: false; reason: SyncSkipReason | ReattachRefusal };
