import type { EventInput, EventSourceFuncInfo, EventSourceInput } from '@fullcalendar/react';
import type { TaskListItem } from '@common/types';
import type { CalendarViewEventProps } from '@renderer/components/calendar/CalendarView';
import { dateParam } from './date-param';

// Tasks as FullCalendar event input: a task with a due date is drawn on that day, as an all-day
// item with its status icon and no calendar colour (docs/calendar/fullcalendar-adapter.md).

/** The id of the tasks' event source, beside the calendars' (theirs are calendar ids). */
export const TASKS_SOURCE_ID = 'tasks';

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

/** The tasks due in a range as a FullCalendar event source. `load` fetches the range's tasks. */
export function toTaskSource(
  load: (range: { start: Date; end: Date }) => Promise<TaskListItem[]>,
): EventSourceInput {
  return {
    id: TASKS_SOURCE_ID,
    events: async (info: EventSourceFuncInfo) => {
      const tasks = await load({ start: info.start, end: info.end });
      return tasks
        .filter((task): task is TaskListItem & { dueDate: Date } => task.dueDate !== null)
        .map(toTaskInput);
    },
  };
}
