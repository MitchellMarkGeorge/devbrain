// Sync tuning, in one place. Durations are in milliseconds.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

// how often an enabled source runs an incremental sync while the workspace is open
export const INCREMENTAL_INTERVAL_MS = 5 * MINUTE;
// how often Linear's reconcile pass looks for reassigned, trashed and deleted issues
export const RECONCILE_INTERVAL_MS = 30 * MINUTE;
// focus and resume trigger a sync only if the last run finished longer ago than this
export const MIN_TRIGGER_GAP_MS = 60 * SECOND;

// items requested per page
export const PAGE_SIZE = 50;
// ids per lookup request in the reconcile pass
export const LOOKUP_BATCH_SIZE = 100;

// closed issues are mirrored for this long, then settled and no longer checked
export const CLOSED_ISSUE_WINDOW_MS = 30 * DAY;
// events are mirrored from this far back, with no forward limit
export const EVENT_HISTORY_WINDOW_MS = 30 * DAY;
// subtracted from the stored incremental cursor; upserts are idempotent so re-reads are harmless
export const CURSOR_OVERLAP_MS = 60 * SECOND;

// failures back off exponentially from the first value, doubling up to the cap
export const BACKOFF_INITIAL_MS = 1 * MINUTE;
export const BACKOFF_MAX_MS = 30 * MINUTE;

export const HTTP_TIMEOUT_MS = 30 * SECOND;
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * MINUTE;
// refresh an OAuth access token when it is this close to expiry
export const TOKEN_REFRESH_MARGIN_MS = 60 * SECOND;
