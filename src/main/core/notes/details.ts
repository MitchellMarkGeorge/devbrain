import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eventSummaries, projectSummaries, taskSummaries, uniqueIds } from '../shared/summaries';
import { Note, NoteLinkSummary, NoteListItem } from './types';

/**
 * Adds what a note row shows beside its own fields: its project and the event or task it is linked
 * to. One query per kind for the whole page, never one per row. An archived project or task is
 * left out, as every list leaves them out.
 */
export function withNoteListDetails(db: BetterSQLite3Database, rows: Note[]): NoteListItem[] {
  if (rows.length === 0) return [];

  const projects = projectSummaries(db, uniqueIds(rows.map((row) => row.projectId)));
  const events = eventSummaries(db, uniqueIds(rows.map((row) => row.linkedEventId)));
  const tasks = taskSummaries(db, uniqueIds(rows.map((row) => row.linkedTaskId)));

  return rows.map((row) => {
    let link: NoteLinkSummary | null = null;
    const event = row.linkedEventId && events.get(row.linkedEventId);
    const task = row.linkedTaskId && tasks.get(row.linkedTaskId);
    if (event) link = { type: 'event', ...event };
    else if (task) link = { type: 'task', ...task };
    return {
      ...row,
      project: (row.projectId && projects.get(row.projectId)) || null,
      link,
    };
  });
}
