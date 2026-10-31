import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Event } from '../events/types';
import { withEventDetails } from '../events/service';
import { withExternalRef } from '../integrations/refs';
import { Note } from '../notes/types';
import { Project } from '../projects/types';
import { Task } from '../tasks/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { NotFoundError } from '../shared/errors';
import { Page, PageOptions } from '../shared/pagination';
import { listByStamp } from '../shared/stamped';
import type {
  FavoritableEntityType,
  FavoritableId,
  FavoritedEntity,
  FavoritesFilterOptions,
} from './types';

// What a favorite or unfavorite changed, for in-process subscribers such as the IPC layer forwarding
// it to the renderer. Sent after the write commits.
export type FavoriteChange =
  | { type: 'favorited'; entityType: FavoritableEntityType; id: FavoritableId; favoritedAt: Date }
  | { type: 'unfavorited'; entityType: FavoritableEntityType; id: FavoritableId };

/**
 * Favoriting stamps an entity's `favoritedAt`; unfavoriting clears it. Unlike an archive nothing
 * cascades: only the entity named is changed.
 *
 * `favoritedAt` belongs to DevBrain, never to a provider (SyncWriter leaves it alone), so a synced
 * task, project or event can be favorited like a local one. Favoriting leaves `updatedAt` as it
 * was: it is not an edit of the entity, and must not move it in the lists sorted by last update.
 *
 * Both are idempotent: favoriting a favorite or unfavoriting what is not one changes nothing, and
 * sends no change.
 *
 * An archived entity keeps its favorite, but is left out of listFavorites until it is restored.
 */
export class FavoritesService {
  private readonly changes = new ChangeListeners<FavoriteChange>('Favorites');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<FavoriteChange>): () => void {
    return this.changes.add(listener);
  }

  favoriteTask(id: TaskId): Task {
    const existing = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // already a favorite: keep the first favoritedAt and send nothing
    if (existing.favoritedAt !== null) return withExternalRef(this.db, existing);

    const task = this.db
      .update(tasks)
      // updatedAt is set to what it was, or its $onUpdate would stamp it with now
      .set({ favoritedAt: new Date(), updatedAt: existing.updatedAt })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    this.changes.emit({
      type: 'favorited',
      entityType: 'tasks',
      id,
      favoritedAt: task.favoritedAt!,
    });
    return withExternalRef(this.db, task);
  }

  unfavoriteTask(id: TaskId): Task {
    const existing = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // not a favorite: nothing to clear
    if (existing.favoritedAt === null) return withExternalRef(this.db, existing);

    const task = this.db
      .update(tasks)
      .set({ favoritedAt: null, updatedAt: existing.updatedAt })
      .where(eq(tasks.id, id))
      .returning()
      .get();
    this.changes.emit({ type: 'unfavorited', entityType: 'tasks', id });
    return withExternalRef(this.db, task);
  }

  favoriteProject(id: ProjectId): Project {
    const existing = this.db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // already a favorite: keep the first favoritedAt and send nothing
    if (existing.favoritedAt !== null) return withExternalRef(this.db, existing);

    const project = this.db
      .update(projects)
      // updatedAt is set to what it was, or its $onUpdate would stamp it with now
      .set({ favoritedAt: new Date(), updatedAt: existing.updatedAt })
      .where(eq(projects.id, id))
      .returning()
      .get();
    this.changes.emit({
      type: 'favorited',
      entityType: 'projects',
      id,
      favoritedAt: project.favoritedAt!,
    });
    return withExternalRef(this.db, project);
  }

  unfavoriteProject(id: ProjectId): Project {
    const existing = this.db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // not a favorite: nothing to clear
    if (existing.favoritedAt === null) return withExternalRef(this.db, existing);

    const project = this.db
      .update(projects)
      .set({ favoritedAt: null, updatedAt: existing.updatedAt })
      .where(eq(projects.id, id))
      .returning()
      .get();
    this.changes.emit({ type: 'unfavorited', entityType: 'projects', id });
    return withExternalRef(this.db, project);
  }

  favoriteNote(id: NoteId): Note {
    const existing = this.db.select().from(notes).where(eq(notes.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // already a favorite: keep the first favoritedAt and send nothing
    if (existing.favoritedAt !== null) return existing;

    const note = this.db
      .update(notes)
      // updatedAt is set to what it was, or its $onUpdate would stamp it with now
      .set({ favoritedAt: new Date(), updatedAt: existing.updatedAt })
      .where(eq(notes.id, id))
      .returning()
      .get();
    this.changes.emit({
      type: 'favorited',
      entityType: 'notes',
      id,
      favoritedAt: note.favoritedAt!,
    });
    return note;
  }

  unfavoriteNote(id: NoteId): Note {
    const existing = this.db.select().from(notes).where(eq(notes.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // not a favorite: nothing to clear
    if (existing.favoritedAt === null) return existing;

    const note = this.db
      .update(notes)
      .set({ favoritedAt: null, updatedAt: existing.updatedAt })
      .where(eq(notes.id, id))
      .returning()
      .get();
    this.changes.emit({ type: 'unfavorited', entityType: 'notes', id });
    return note;
  }

  favoriteEvent(id: EventId): Event {
    const existing = this.db.select().from(events).where(eq(events.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // already a favorite: keep the first favoritedAt and send nothing
    if (existing.favoritedAt !== null) return withEventDetails(this.db, [existing])[0];

    const event = this.db
      .update(events)
      // updatedAt is set to what it was, or its $onUpdate would stamp it with now
      .set({ favoritedAt: new Date(), updatedAt: existing.updatedAt })
      .where(eq(events.id, id))
      .returning()
      .get();
    this.changes.emit({
      type: 'favorited',
      entityType: 'events',
      id,
      favoritedAt: event.favoritedAt!,
    });
    return withEventDetails(this.db, [event])[0];
  }

  unfavoriteEvent(id: EventId): Event {
    const existing = this.db.select().from(events).where(eq(events.id, id)).get();
    if (!existing) throw new NotFoundError(id);
    // not a favorite: nothing to clear
    if (existing.favoritedAt === null) return withEventDetails(this.db, [existing])[0];

    const event = this.db
      .update(events)
      .set({ favoritedAt: null, updatedAt: existing.updatedAt })
      .where(eq(events.id, id))
      .returning()
      .get();
    this.changes.emit({ type: 'unfavorited', entityType: 'events', id });
    return withEventDetails(this.db, [event])[0];
  }

  /**
   * Every favorited task, project, note and event as one list, most recently favorited first: the
   * query behind the favorites view. Paginated with an opaque cursor like the other list methods,
   * and optionally narrowed to one entity type.
   *
   * Left out: archived tasks, projects and notes, and events whose provider item was cancelled or
   * deleted (link state `removed`), which are kept only for the notes linked to them.
   */
  listFavorites(
    filter: FavoritesFilterOptions = {},
    page: PageOptions = {},
  ): Page<FavoritedEntity> {
    return listByStamp(this.db, 'favoritedAt', filter.entityType ?? 'all', page);
  }
}
