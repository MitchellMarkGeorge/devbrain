import { TaskStatus } from '@common/types';
import type { ExternalTask } from '../integrations/types';

// Where a provider's item is, and what sync does with it: the rule every provider's tasks follow
// (docs/integrations/tech-design.md, "Where an item is"). A provider maps its own flags to four
// states; DevBrain applies one table to them, whatever the provider calls them.
//
// | Where the item is            | Open                   | Closed                 |
// | ---------------------------- | ---------------------- | ---------------------- |
// | live (and assigned to you)   | synced                 | synced                 |
// | hidden (put away, kept)      | out: trash, `removed`  | kept, as last seen     |
// | deleted (provider's trash)   | out: trash, `removed`  | out: trash, `removed`  |
// | gone (permanently deleted)   | out: trash, `removed`  | out: trash, `removed`  |
//
// Deleted and gone items never reach keepsTask: a provider reports their ids (a page's
// trashedIds, a lookup's gone). A hidden open item was put away on purpose (Linear: its project
// was deleted; Trello: a card archived off the board). A hidden closed one was tidied away, and
// stays as the user's record of finished work (Linear's auto-archive).

const CLOSED_STATUSES: readonly TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

/**
 * Whether sync mirrors a task its provider listed or resolved, rather than taking it out: assigned
 * to the viewer, and not hidden while still open.
 */
export function keepsTask(
  task: Pick<ExternalTask, 'assignedToViewer' | 'hidden' | 'status'>,
): boolean {
  if (!task.assignedToViewer) return false;
  return !task.hidden || CLOSED_STATUSES.includes(task.status);
}
