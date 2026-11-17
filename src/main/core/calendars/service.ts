import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { asc, desc, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { InvalidInputError, NotFoundError } from '../shared/errors';
import { Calendar } from '@common/types';

// What changed on a calendar, for in-process subscribers: the IPC layer tells the renderer, whose
// calendar view reads `visible`. `selection_changed` is sent as the last step of its transaction:
// the workspace removes a deselected calendar's events in it (SyncEngine.deselectCalendar), and
// syncs a selected one's source after. `calendars_refreshed`: a source's calendars were listed again
// and their rows changed. Sent only when something changed. Sync's own writes to calendars during
// a run are reported by its progress.
export type CalendarChange =
  | { type: 'visibility_changed'; calendar: Calendar }
  | { type: 'selection_changed'; calendar: Calendar }
  | { type: 'calendars_refreshed'; sourceId: ExternalSourceId };

// Lists an events source's calendars again and stores them; resolves whether any row changed.
// The workspace passes SyncEngine.refreshCalendars.
export type RefreshCalendars = (sourceId: ExternalSourceId) => Promise<boolean>;

// The calendars events belong to, local and synced: the public interface for managing them. It
// reads and writes the calendars table only. Synced calendars' rows come from their provider
// through the sync engine (SyncWriter.applyCalendarList); here the user shows or hides any calendar
// and chooses which synced ones sync.
export class CalendarService {
  private readonly changes = new ChangeListeners<CalendarChange>('Calendar');

  constructor(
    private readonly db: BetterSQLite3Database,
    // without one, refresh lists nothing
    private readonly refreshSource: RefreshCalendars = async () => false,
  ) {}

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
   * Whether a synced calendar syncs. Flips the column and announces it as the last step of its
   * transaction. The workspace removes a deselected calendar's events in that transaction, so they
   * are gone when this returns, even offline; a selected one's source then syncs, giving it a full
   * pass. A local calendar always syncs, so it is refused. Setting the value it already has changes
   * and announces nothing.
   */
  setSelected(id: CalendarId, selected: boolean): Calendar {
    const existing = this.getById(id);
    if (existing.sourceId === null) {
      throw new InvalidInputError(`${id} is a local calendar, which always syncs`);
    }
    if (existing.selected === selected) return existing;
    return this.db.transaction(() => {
      const calendar = this.db
        .update(calendars)
        .set({ selected })
        .where(eq(calendars.id, id))
        .returning()
        .get();
      if (!calendar) throw new NotFoundError(id);
      this.changes.emit({ type: 'selection_changed', calendar });
      return calendar;
    });
  }

  /**
   * Lists the source's calendars again from its provider and stores them, so the picker shows new
   * and renamed ones without waiting for a sync, and returns the source's calendars. No events are
   * pulled. While the provider can't be asked (the integration is disabled or needs reauth, or is
   * rate limited) it lists nothing and returns what is stored; a provider failure is thrown.
   */
  async refresh(sourceId: ExternalSourceId): Promise<Calendar[]> {
    if (await this.refreshSource(sourceId)) {
      this.changes.emit({ type: 'calendars_refreshed', sourceId });
    }
    return this.db
      .select()
      .from(calendars)
      .where(eq(calendars.sourceId, sourceId))
      .orderBy(desc(calendars.isPrimary), asc(calendars.name), asc(calendars.id))
      .all();
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
