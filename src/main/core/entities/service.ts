import { isId, type EventId, type NoteId, type ProjectId, type TaskId } from '@common/ids';
import type { EntitySummary, StampedId } from '@common/types';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  eventSummaries,
  noteSummaries,
  projectSummaries,
  taskSummaries,
} from '../shared/summaries';

/**
 * Entities read by id across types, for the editor's entity pills: a note can link hundreds of
 * tasks, projects, notes and events, and reading each with its own `get` made as many calls
 * (docs/performance.md).
 */
export class EntityService {
  constructor(private readonly db: BetterSQLite3Database) {}

  /**
   * The summaries of these entities, as a pill draws them, in the order asked, each once: one
   * query per type. An id of no entity, or of an archived task, project or note, is left out, so
   * its pill draws as missing.
   */
  summaries(ids: readonly StampedId[]): EntitySummary[] {
    const unique = [...new Set(ids)];
    const tasks = taskSummaries(
      this.db,
      unique.filter((id): id is TaskId => isId('task', id)),
    );
    const projects = projectSummaries(
      this.db,
      unique.filter((id): id is ProjectId => isId('project', id)),
    );
    const notes = noteSummaries(
      this.db,
      unique.filter((id): id is NoteId => isId('note', id)),
    );
    const events = eventSummaries(
      this.db,
      unique.filter((id): id is EventId => isId('event', id)),
    );
    return unique.flatMap((id): EntitySummary[] => {
      const task = tasks.get(id as TaskId);
      if (task) return [{ type: 'task', ...task }];
      const project = projects.get(id as ProjectId);
      if (project) return [{ type: 'project', ...project }];
      const note = notes.get(id as NoteId);
      if (note) return [{ type: 'note', ...note }];
      const event = events.get(id as EventId);
      return event ? [{ type: 'event', ...event }] : [];
    });
  }
}
