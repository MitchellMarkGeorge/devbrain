import { DateTime } from 'luxon';
import { isId, type WorkspaceId } from '@common/ids';

// Where an entity's page is, by its id's prefix (tsk_, prj_, nte_, evt_): the one place that knows,
// for useOpenEntity, links and tests.

/** What opening an entity needs: its id, and for an event the day it is on. */
export interface EntityRef {
  id: string;
  /** an event's start, to open the calendar on its day */
  startAt?: Date | null;
}

/**
 * The app path an entity opens at, or null for an id of no page: a task, project or note's page,
 * or an event in the calendar's sheet on its day (events have no page of their own).
 */
export function entityPath(workspaceId: WorkspaceId, entity: EntityRef): string | null {
  const base = `/app/${workspaceId}`;
  const { id } = entity;
  if (isId('task', id)) return `${base}/tasks/${id}`;
  if (isId('project', id)) return `${base}/projects/${id}`;
  if (isId('note', id)) return `${base}/notes/${id}`;
  if (isId('event', id)) {
    const date = entity.startAt ? DateTime.fromJSDate(entity.startAt).toISODate() : null;
    const search = new URLSearchParams({ ...(date ? { date } : {}), open: id });
    return `${base}/calendar?${search.toString()}`;
  }
  return null;
}
