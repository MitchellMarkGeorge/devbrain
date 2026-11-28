import { useMutation, useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import type { EventId } from '@common/ids';
import { Button, ColourBar, resolveColor, useFormat } from '@renderer/components';
import { eventCountdown } from '@renderer/components/event-text';
import { trpc } from '@renderer/ipc';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { seriesOccurrenceOf } from '@renderer/features/calendar/lib/occurrence';
import { repeatText } from '@renderer/features/calendar/lib/repeat';
import { shownTiming } from '@renderer/features/calendar/lib/timing';
import styles from './EventStrip.module.css';

export interface EventStripProps {
  eventId: EventId;
  /** for a repeating event: the start of the occurrence the strip is for */
  occurrence?: Date;
}

/**
 * The meeting a note is for, over the note in its sheet (Figma `7410:34948`): the event's colour
 * and title, how soon it is, its times and place, and Join: "Mitchell / Jesse 1:1",
 * "Now · 10:30 – 11:00 AM · Room 2A". A repeating event opened without an occurrence (from the
 * note, not from the calendar's grid) says how it repeats instead, as no one occurrence is meant.
 * It reads the event itself; nothing is drawn until it has, or when the event is gone.
 */
export function EventStrip({ eventId, occurrence }: EventStripProps) {
  const format = useFormat('minute');
  const openUrl = useMutation(trpc.workspace.openUrl.mutationOptions());
  const event = useQuery({
    ...trpc.events.get.queryOptions({ id: eventId }),
    retry: (failures, error) => ipcErrorCode(error) !== 'not_found' && failures < 3,
  }).data;
  const calendars = useQuery(trpc.calendars.list.queryOptions()).data ?? [];
  if (!event) return null;

  const calendar = calendars.find((c) => c.id === event.calendarId);
  const color = resolveColor(event.color) ?? resolveColor(calendar?.color, 'blue');
  const shown = shownTiming(event, seriesOccurrenceOf({ event, occurrenceStart: occurrence }));
  // the series itself, with no occurrence named: when it repeats, not when one of them is
  const series = event.recurrenceRule !== null && occurrence === undefined;
  const countdown = eventCountdown(
    { startAt: shown.start, endAt: shown.end, allDay: shown.allDay },
    format,
  );
  const times = shown.allDay
    ? 'All day'
    : `${format.formatTime(shown.start)} – ${format.formatTime(shown.end)}`;
  return (
    <div className={styles.strip} data-testid="event-strip">
      <ColourBar color={color} height={36} />
      <div className={styles.text}>
        <span className={styles.title}>{event.title}</span>
        <span className={styles.meta}>
          {series ? (
            repeatText(event.recurrenceRule, event.startAt)
          ) : (
            <span className={countdown.tone === 'soon' ? styles.soon : undefined}>
              {countdown.text}
            </span>
          )}
          {' · '}
          {times}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </div>
      {event.meetingUrl && (
        <Button size="xs" icon={Video} onClick={() => openUrl.mutate({ url: event.meetingUrl! })}>
          Join
        </Button>
      )}
    </div>
  );
}
