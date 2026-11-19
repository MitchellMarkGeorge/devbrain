import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { EventId, TaskId } from '@common/ids';
import type { Calendar as CalendarModel, Event, TaskListItem } from '@common/types';
import { occurrencesBetween, type Occurrence } from '@renderer/shared/lib/calendar';
import {
  Calendar,
  CalendarAgenda,
  CalendarAgendaItem,
  CalendarUpNext,
  ScrollArea,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { agendaEventsQuery, agendaRange, tasksDueQuery } from '../../api/queries';
import styles from './CalendarSidePanel.module.css';

export type AgendaItem =
  | { kind: 'event'; key: string; occurrence: Occurrence }
  | { kind: 'task'; key: string; task: TaskListItem };

/**
 * One day's agenda: the events' occurrences that day (all-day first, then by start; a series
 * expanded with `occurrencesBetween`), then the tasks due.
 */
export function agendaItems(
  events: readonly Event[],
  tasks: readonly TaskListItem[],
  day: Date,
): AgendaItem[] {
  const start = DateTime.fromJSDate(day).startOf('day');
  const end = start.plus({ days: 1 });
  const occurrences = events
    .flatMap((event) => occurrencesBetween(event, start.toJSDate(), end.toJSDate()))
    .sort(
      (a, b) =>
        Number(b.event.allDay) - Number(a.event.allDay) ||
        a.start.getTime() - b.start.getTime() ||
        a.event.title.localeCompare(b.event.title),
    );
  return [
    ...occurrences.map(
      (occurrence): AgendaItem => ({
        kind: 'event',
        key: `${occurrence.event.id}@${occurrence.start.getTime()}`,
        occurrence,
      }),
    ),
    ...tasks.map((task): AgendaItem => ({ kind: 'task', key: task.id, task })),
  ];
}

/**
 * The meeting the panel puts above the agenda: today's timed occurrence in progress, else the next
 * to start; none once the day's last has ended.
 */
export function upNext(items: readonly AgendaItem[], now: Date): Occurrence | undefined {
  return items
    .flatMap((item) => (item.kind === 'event' ? [item.occurrence] : []))
    .filter((occurrence) => !occurrence.event.allDay && occurrence.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
}

// an agenda line opens on a click, and on Enter or Space while focused
function activate(open: () => void) {
  return {
    onClick: open,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    },
  };
}

export interface CalendarSidePanelProps {
  /** the anchor day: the mini calendar's selected day */
  date: Date;
  firstDay: 0 | 1;
  calendars: readonly CalendarModel[];
  onDateChange: (date: Date) => void;
  /** an agenda event: the sheet, at the occurrence for a series */
  onOpenEvent: (id: EventId, occurrence?: Date) => void;
  onOpenTask: (id: TaskId) => void;
}

/**
 * The calendar's right panel, in wide windows (Figma `7158:13273`): the mini calendar, which moves
 * the page to a day, the meeting up next (in progress or next to start today, with Join), and
 * today's and tomorrow's agenda, mixing events and tasks due.
 */
export function CalendarSidePanel({
  date,
  firstDay,
  calendars,
  onDateChange,
  onOpenEvent,
  onOpenTask,
}: CalendarSidePanelProps) {
  const { now } = useFormat();
  // the meeting up next moves on as the time does: `now` above is the start of today (the agenda's
  // days), so the card's choice reads the minute, and the panel re-renders as each minute starts
  const { now: minute } = useFormat('minute');
  // the month shown follows the anchor, and ‹ › page through months on their own
  const [month, setMonth] = useState(date);
  const [anchor, setAnchor] = useState(date);
  if (anchor.getTime() !== date.getTime()) {
    setAnchor(date);
    if (!DateTime.fromJSDate(date).hasSame(DateTime.fromJSDate(month), 'month')) setMonth(date);
  }

  const range = agendaRange(now);
  const events = useQuery(agendaEventsQuery(range)).data ?? [];
  const tomorrow = DateTime.fromJSDate(range.start).plus({ days: 1 }).toJSDate();
  const dueToday = useQuery(tasksDueQuery(range.start)).data?.items ?? [];
  const dueTomorrow = useQuery(tasksDueQuery(tomorrow)).data?.items ?? [];
  const colorOf = (event: Event) => calendars.find((c) => c.id === event.calendarId)?.color;
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());

  const today = agendaItems(events, dueToday, range.start);
  const next = upNext(today, minute);
  const nextKey = next && `${next.event.id}@${next.start.getTime()}`;
  // the meeting up next is the card, not a line of the agenda as well
  const days = [
    { title: 'Today', items: today.filter((item) => item.key !== nextKey) },
    { title: 'Tomorrow', items: agendaItems(events, dueTomorrow, tomorrow) },
  ];
  const openOccurrence = (occurrence: Occurrence) =>
    onOpenEvent(
      occurrence.event.id,
      occurrence.event.recurrenceRule ? occurrence.start : undefined,
    );

  return (
    <ScrollArea
      render={<aside />}
      className={styles.panel}
      viewportClassName={styles.content}
      aria-label="Agenda"
      data-testid="calendar-panel"
    >
      <Calendar
        mode="single"
        today={now}
        month={month}
        onMonthChange={setMonth}
        weekStartsOn={firstDay}
        selected={date}
        onSelect={(day) => day && onDateChange(day)}
      />
      {next && (
        <CalendarUpNext
          event={{ ...next.event, startAt: next.start, endAt: next.end }}
          calendarColor={colorOf(next.event)}
          onOpen={() => openOccurrence(next)}
          onJoin={() => next.event.meetingUrl && openUrl({ url: next.event.meetingUrl })}
        />
      )}
      {days.map((day) => (
        <CalendarAgenda key={day.title} title={day.title}>
          {day.items.map((item) =>
            item.kind === 'event' ? (
              <CalendarAgendaItem
                key={item.key}
                event={{
                  ...item.occurrence.event,
                  startAt: item.occurrence.start,
                  endAt: item.occurrence.end,
                }}
                calendarColor={colorOf(item.occurrence.event)}
                {...activate(() => openOccurrence(item.occurrence))}
              />
            ) : (
              <CalendarAgendaItem
                key={item.key}
                task={item.task}
                {...activate(() => onOpenTask(item.task.id))}
              />
            ),
          )}
        </CalendarAgenda>
      ))}
    </ScrollArea>
  );
}
