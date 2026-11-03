import { CalendarId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { asc, desc, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { InvalidInputError, NotFoundError } from '../shared/errors';
import { Calendar } from './types';

// What the user changed on a calendar, for in-process subscribers: the IPC layer tells the
// renderer, whose calendar view reads `visible`, and the workspace syncs a synced calendar's source
// when its selection changes. Sent only when the value changed. Sync's own writes to calendars are
// reported by its progress.
export type CalendarChange =
  | { type: 'visibility_changed'; calendar: Calendar }
  | { type: 'selection_changed'; calendar: Calendar };

// The calendars events belong to, local and synced: the public interface for managing them. It
// reads and writes the calendars table only. Synced calendars' rows come from their provider
// through the sync engine (SyncWriter.applyCalendarList); here the user shows or hides any calendar
// and chooses which synced ones sync.
export class CalendarService {
  private readonly changes = new ChangeListeners<CalendarChange>('Calendar');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<CalendarChange>): () => void {
    return this.changes.add(listener);
  }

  // every calendar: local first, then each source's primary calendar first, then by name
  list(): Calendar[] {
    return this.db
      .select()
      .from(calendars)
      .orderBy(
        asc(calendars.sourceId),
        desc(calendars.isPrimary),
        asc(calendars.name),
        asc(calendars.id),
      )
      .all();
  }

  getById(id: CalendarId): Calendar {
    const calendar = this.db.select().from(calendars).where(eq(calendars.id, id)).get();
    if (!calendar) throw new NotFoundError(id);
    return calendar;
  }

  /**
   * Whether a synced calendar syncs. Flips the column only, and announces it; the workspace then
   * asks for a run of its source, which gives a selected calendar a full pass and removes a
   * deselected one's events by the removal rule (see EventSyncer). A local calendar always syncs,
   * so it is refused. Setting the value it already has changes and announces nothing.
   */
  setSelected(id: CalendarId, selected: boolean): Calendar {
    const existing = this.getById(id);
    if (existing.sourceId === null) {
      throw new InvalidInputError(`${id} is a local calendar, which always syncs`);
    }
    if (existing.selected === selected) return existing;
    const calendar = this.db
      .update(calendars)
      .set({ selected })
      .where(eq(calendars.id, id))
      .returning()
      .get();
    if (!calendar) throw new NotFoundError(id);
    this.changes.emit({ type: 'selection_changed', calendar });
    return calendar;
  }

  /**
   * Shows or hides a calendar's events in the calendar view; nothing is synced or removed. Setting
   * the value it already has changes and announces nothing.
   */
  setVisible(id: CalendarId, visible: boolean): Calendar {
    const existing = this.getById(id);
    if (existing.visible === visible) return existing;
    const calendar = this.db
      .update(calendars)
      .set({ visible })
      .where(eq(calendars.id, id))
      .returning()
      .get();
    if (!calendar) throw new NotFoundError(id);
    this.changes.emit({ type: 'visibility_changed', calendar });
    return calendar;
  }
}
