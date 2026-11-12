import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { EventId, TaskId } from '@common/ids';
import type { Calendar as CalendarModel, Event, TaskListItem } from '@common/types';
import { occurrencesBetween, type Occurrence } from '../../../calendar';
import {
  Calendar,
  CalendarAgenda,
  CalendarAgendaItem,
  ScrollArea,
  useFormat,
} from '../../../components';
import { agendaEventsQuery, agendaRange, tasksDueQuery } from '../queries';
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
 * the page to a day, and today's and tomorrow's agenda, mixing events and tasks due.
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

  const days = [
    { title: 'Today', items: agendaItems(events, dueToday, range.start) },
    { title: 'Tomorrow', items: agendaItems(events, dueTomorrow, tomorrow) },
  ];

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
                {...activate(() =>
                  onOpenEvent(
                    item.occurrence.event.id,
                    item.occurrence.event.recurrenceRule ? item.occurrence.start : undefined,
                  ),
                )}
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
