import { describe, it, expect } from 'vitest';
import { generateId, TaskId } from '@common/ids';
import { localDayWindow, isSubtask } from '../../tasks/utils';
import type { Task } from '../../tasks/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';

describe('localDayWindow', () => {
  it('start is midnight at the beginning of the given day', () => {
    const { start } = localDayWindow(new Date(2024, 5, 15, 14, 30, 0));
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(15);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('end is midnight at the beginning of the next day', () => {
    const { end } = localDayWindow(new Date(2024, 5, 15, 14, 30, 0));
    expect(end.getFullYear()).toBe(2024);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(16);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
    expect(end.getSeconds()).toBe(0);
    expect(end.getMilliseconds()).toBe(0);
  });

  it('end is strictly after start', () => {
    const { start, end } = localDayWindow(new Date(2024, 5, 15, 9, 0, 0));
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('input at the very start of a day still maps to that day', () => {
    const midnight = new Date(2024, 5, 15, 0, 0, 0, 0);
    const { start } = localDayWindow(midnight);
    expect(start.getDate()).toBe(15);
  });

  it('input at 23:59:59.999 still maps to the same day', () => {
    const almostMidnight = new Date(2024, 5, 15, 23, 59, 59, 999);
    const { start, end } = localDayWindow(almostMidnight);
    expect(start.getDate()).toBe(15);
    expect(end.getDate()).toBe(16);
  });

  it('rolls over correctly at the last day of a month', () => {
    const { start, end } = localDayWindow(new Date(2024, 0, 31, 12, 0, 0)); // Jan 31
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(31);
    expect(end.getMonth()).toBe(1); // February
    expect(end.getDate()).toBe(1);
  });

  it('rolls over correctly at the last day of the year', () => {
    const { start, end } = localDayWindow(new Date(2024, 11, 31, 12, 0, 0)); // Dec 31
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(31);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });

  it('handles leap day (Feb 29)', () => {
    const { start, end } = localDayWindow(new Date(2024, 1, 29, 12, 0, 0)); // Feb 29 2024
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(29);
    expect(end.getMonth()).toBe(2); // March
    expect(end.getDate()).toBe(1);
  });

  it('the input date itself is not mutated', () => {
    const original = new Date(2024, 5, 15, 14, 30, 0);
    const originalTime = original.getTime();
    localDayWindow(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

const makeTask = (parentTaskId: TaskId | null): Task => ({
  id: generateId('task'),
  parentTaskId,
  title: 'Task',
  description: null,
  priority: TaskPriority.LOW,
  status: TaskStatus.NOT_STARTED,
  startDate: null,
  dueDate: new Date(),
  projectId: null,
  linkedEventId: null,
  linkedNoteId: null,
  pullRequestUrl: null,
  completedAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  favoritedAt: null,
});

describe('isSubtask', () => {
  it('returns true when parentTaskId is set', () => {
    const task = makeTask(generateId('task'));
    expect(isSubtask(task)).toBe(true);
  });

  it('returns false when parentTaskId is null', () => {
    const task = makeTask(null);
    expect(isSubtask(task)).toBe(false);
  });
});
