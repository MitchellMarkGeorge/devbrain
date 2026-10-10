import { CalendarId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { asc, desc, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { NotFoundError } from '../shared/errors';
import { Calendar } from './types';

// The calendars events belong to, local and synced. Which synced calendars sync at all is chosen
// through IntegrationService.setCalendars; this only reads them and shows or hides them.
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
