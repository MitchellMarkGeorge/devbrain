import { linkOptions } from '@tanstack/react-router';
import { isId, type WorkspaceId } from '@common/ids';
import { dateParam } from './calendar/date-param';

// Where an entity's page is, by its id's prefix (tsk_, prj_, nte_, evt_): the one place that knows,
// for useOpenEntity, links and tests.

/** What opening an entity needs: its id, and for an event the day it is on. */
export interface EntityRef {
  id: string;
  /** an event's start, to open the calendar on its day */
  startAt?: Date | null;
}

/**
 * Where an entity opens, as options for a `Link` or `navigate`, or null for an id of no page: a
 * task, project or note's page, or an event in the calendar's sheet on its day (events have no
 * page of their own). Typed against the route tree, so a renamed route or a wrong search param
 * fails the build.
 */
export function entityLink(workspaceId: WorkspaceId, entity: EntityRef) {
  const { id } = entity;
  if (isId('task', id))
    return linkOptions({
      to: '/app/$workspaceId/tasks/$taskId',
      params: { workspaceId, taskId: id },
    });
  if (isId('project', id))
    return linkOptions({
      to: '/app/$workspaceId/projects/$projectId',
      params: { workspaceId, projectId: id },
    });
  if (isId('note', id))
    return linkOptions({
      to: '/app/$workspaceId/notes/$noteId',
      params: { workspaceId, noteId: id },
    });
  if (isId('event', id))
    return linkOptions({
      to: '/app/$workspaceId/calendar',
      params: { workspaceId },
      search: {
        date: entity.startAt ? dateParam(entity.startAt) : undefined,
        sheet: id,
      },
    });
  return null;
}
