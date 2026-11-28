import type { EventInput } from '@fullcalendar/react';
import type { TaskListItem } from '@common/types';
import type { CalendarViewEventProps } from '@renderer/components/calendar/CalendarView';
import { dateParam } from './date-param';

// Tasks as FullCalendar event input: a task with a due date is drawn on that day, as an all-day
// item with its status icon and no calendar colour (docs/calendar/fullcalendar-adapter.md).

/**
 * A task due on a day, as FullCalendar input: an all-day item on the local day its due date falls
 * on, its id the task's (`tsk_…`, which is how a click tells it from an event). Never editable.
 */
export function toTaskInput(task: TaskListItem & { dueDate: Date }): EventInput {
  const props: CalendarViewEventProps = { kind: 'task', status: task.status };
  return {
    id: task.id,
    title: task.title,
    allDay: true,
    start: dateParam(task.dueDate),
    editable: false,
    extendedProps: props,
  };
}

/** The tasks as FullCalendar input, one for each that has a due date. */
export function toTaskInputs(tasks: readonly TaskListItem[]): EventInput[] {
  return tasks
    .filter((task): task is TaskListItem & { dueDate: Date } => task.dueDate !== null)
    .map(toTaskInput);
}
