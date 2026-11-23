import { describe, expect, it } from 'vitest';
import { ProjectStatus } from '@common/types';
import { projectTime } from '@renderer/features/projects/lib/time-left';

const now = new Date(2026, 10, 23, 15);
const day = (offset: number) => new Date(2026, 10, 23 + offset);
const format = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
const time = (project: Partial<Parameters<typeof projectTime>[0]>) =>
  projectTime(
    { status: ProjectStatus.ACTIVE, startDate: null, dueDate: null, completedAt: null, ...project },
    now,
    format,
  );

describe('projectTime', () => {
  it('has nothing to say without a due date', () => {
    expect(time({})).toBeNull();
    expect(time({ startDate: day(-3) })).toBeNull();
  });

  it('counts the days left, and the day of the project with a start date', () => {
    expect(time({ dueDate: day(18) })).toEqual({
      tone: 'left',
      headline: '18 days left',
      detail: 'Due 12/11',
    });
    expect(time({ startDate: day(-24), dueDate: day(18) })?.detail).toBe('Day 25 of 43');
    expect(time({ startDate: day(2), dueDate: day(18) })?.detail).toBe('Starts 11/25');
  });

  it('names today and tomorrow', () => {
    expect(time({ dueDate: day(0) })).toMatchObject({ tone: 'today', headline: 'Due today' });
    expect(time({ dueDate: day(1) })).toMatchObject({ tone: 'left', headline: 'Due tomorrow' });
  });

  it('says how overdue an open project is', () => {
    expect(time({ dueDate: day(-1) })).toEqual({
      tone: 'overdue',
      headline: '1 day overdue',
      detail: 'Was due 11/22',
    });
    expect(time({ dueDate: day(-2) })?.headline).toBe('2 days overdue');
  });

  it('says when a completed project was done', () => {
    const done = { status: ProjectStatus.COMPLETED, dueDate: day(-2) };
    expect(time({ ...done, completedAt: day(-5) })).toEqual({
      tone: 'done',
      headline: 'Done 11/18',
      detail: 'Due 11/21',
    });
    expect(time(done)).toBeNull();
  });
});
