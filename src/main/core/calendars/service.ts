import { CalendarId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { asc, desc, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { InvalidInputError, NotFoundError } from '../shared/errors';
import { Calendar } from './types';

// The calendars events belong to, local and synced: the public interface for managing them. It
// reads and writes the calendars table only. Synced calendars' rows come from their provider
// through the sync engine (SyncWriter.applyCalendarList); here the user shows or hides any calendar
// and chooses which synced ones sync.
export class CalendarService {
  constructor(private readonly db: BetterSQLite3Database) {}

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
   * Whether a synced calendar syncs. Flips the column only: the next sync run of its source gives a
   * selected calendar a full pass, and removes a deselected one's events by the removal rule (see
   * EventSyncer). A local calendar always syncs, so it is refused.
   */
  setSelected(id: CalendarId, selected: boolean): Calendar {
    const existing = this.getById(id);
    if (existing.sourceId === null) {
      throw new InvalidInputError(`${id} is a local calendar, which always syncs`);
    }
    const calendar = this.db
      .update(calendars)
      .set({ selected })
      .where(eq(calendars.id, id))
      .returning()
      .get();
    if (!calendar) throw new NotFoundError(id);
    return calendar;
  }

  /** shows or hides a calendar's events in the calendar view; nothing is synced or removed */
  setVisible(id: CalendarId, visible: boolean): Calendar {
    const calendar = this.db
      .update(calendars)
      .set({ visible })
      .where(eq(calendars.id, id))
      .returning()
      .get();
    if (!calendar) throw new NotFoundError(id);
    return calendar;
  }
}
