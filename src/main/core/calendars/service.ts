import { CalendarId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { asc, desc, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { NotFoundError } from '../shared/errors';
import { Calendar } from './types';

// The calendars events belong to, local and synced: the public interface for managing them. It
// reads and writes the calendars table only. Synced calendars' rows come from their provider
// through the sync engine (SyncWriter.applyCalendarList); here the user shows or hides any calendar
// and chooses which synced ones sync.
export class CalendarService {
  constructor(private readonly db: BetterSQLite3Database) {}

  // every calendar: local first, then each source's primary calendar first, then by name
  async list(): Promise<Calendar[]> {
    return this.db
      .select()
      .from(calendars)
      .orderBy(
        asc(calendars.sourceId),
        desc(calendars.isPrimary),
        asc(calendars.name),
        asc(calendars.id),
      );
  }

  async getById(id: CalendarId): Promise<Calendar> {
    const [calendar] = await this.db.select().from(calendars).where(eq(calendars.id, id));
    if (!calendar) throw new NotFoundError(id);
    return calendar;
  }

  /**
   * Whether a synced calendar syncs. Flips the column only: the next sync run of its source gives a
   * selected calendar a full pass, and removes a deselected one's events by the removal rule (see
   * EventSyncer). A local calendar always syncs, so it is refused.
   */
  async setSelected(id: CalendarId, selected: boolean): Promise<Calendar> {
    const existing = await this.getById(id);
    if (existing.sourceId === null) {
      throw new Error(`${id} is a local calendar, which always syncs`);
    }
    const [calendar] = await this.db
      .update(calendars)
      .set({ selected })
      .where(eq(calendars.id, id))
      .returning();
    return calendar;
  }

  /** shows or hides a calendar's events in the calendar view; nothing is synced or removed */
  async setVisible(id: CalendarId, visible: boolean): Promise<Calendar> {
    const [calendar] = await this.db
      .update(calendars)
      .set({ visible })
      .where(eq(calendars.id, id))
      .returning();
    if (!calendar) throw new NotFoundError(id);
    return calendar;
  }
}
