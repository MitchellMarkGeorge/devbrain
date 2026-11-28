import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import { TASKS_SOURCE_ID, toTaskInput, toTaskSource } from '@renderer/shared/lib/calendar';
import { fakeTask } from '../../routing/fake-tasks';

// A task due on a day as FullCalendar input (docs/calendar/fullcalendar-adapter.md, "Tasks").

describe('toTaskInput', () => {
  it('puts the task on the local day it is due, all-day, with its status', () => {
    // late in the day: still that day's, not the next one's in UTC
    const dueDate = new Date(2026, 5, 22, 23, 30);
    const task = { ...fakeTask('tsk_guide', 'Write the guide'), dueDate };
    expect(toTaskInput({ ...task, status: TaskStatus.IN_PROGRESS })).toEqual({
      id: 'tsk_guide',
      title: 'Write the guide',
      allDay: true,
      start: '2026-06-22',
      editable: false,
      extendedProps: { kind: 'task', status: TaskStatus.IN_PROGRESS },
    });
  });
});

describe('toTaskSource', () => {
  it('reads the range FullCalendar asks for, and leaves out a task with no due date', async () => {
    const ranges: { start: Date; end: Date }[] = [];
    const source = toTaskSource((range) => {
      ranges.push(range);
      return Promise.resolve([
        fakeTask('tsk_dated', 'Dated', { dueDate: new Date(2026, 5, 24) }),
        fakeTask('tsk_undated', 'Undated'),
      ]);
    }) as { id: string; events: (info: never) => Promise<{ id: string }[]> };
    const range = { start: new Date(2026, 5, 22), end: new Date(2026, 5, 29) };
    const inputs = await source.events(range as never);
    expect(source.id).toBe(TASKS_SOURCE_ID);
    expect(ranges).toEqual([range]);
    expect(inputs.map((input) => input.id)).toEqual(['tsk_dated']);
  });
});
