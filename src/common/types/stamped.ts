import type { EventId, NoteId, ProjectId, TaskId } from '../ids';
import type { Event } from './events';
import type { Note } from './notes';
import type { Project } from './projects';
import type { Task } from './tasks';

// The favorites and recents lists: every task, project, note and event with a timestamp set
// (favoritedAt, viewedAt), most recent first. Core's shared/stamped reads them.

export type StampedEntityType = 'tasks' | 'projects' | 'notes' | 'events';

export type StampedId = TaskId | ProjectId | NoteId | EventId;

/** the timestamps a stamped list is ordered by */
export type Stamp = 'favoritedAt' | 'viewedAt';

/**
 * A row in a stamped list: the whole entity, read as its own service reads it, so a view can show
 * what it shows elsewhere (a task's status, a project's colour, an event's colour), with the stamp.
 * Narrow on `entityType` to get the entity's type.
 */
export type StampedEntity<S extends Stamp> = (
  | { entityType: 'tasks'; entity: Task }
  | { entityType: 'projects'; entity: Project }
  | { entityType: 'notes'; entity: Note }
  | { entityType: 'events'; entity: Event }
) &
  Record<S, Date>;

export type FavoritableId = StampedId;

export type FavoritableEntityType = StampedEntityType;

/**
 * A single row in the favorites view: the whole entity under `entity`, as its service reads it, and
 * when it was favorited. Narrow on `entityType` to get the entity's type.
 */
export type FavoritedEntity = StampedEntity<'favoritedAt'>;

export type RecentId = StampedId;

export type RecentEntityType = StampedEntityType;

/**
 * A single row in the recents list: the whole entity under `entity`, as its service reads it, and
 * when it was last viewed. Narrow on `entityType` to get the entity's type.
 */
export type RecentEntity = StampedEntity<'viewedAt'>;
