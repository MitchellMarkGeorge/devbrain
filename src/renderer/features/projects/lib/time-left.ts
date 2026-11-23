import { DateTime } from 'luxon';
import { ProjectStatus, type Project } from '@common/types';

export interface ProjectTime {
  /** `overdue` is drawn in `date-overdue`, `today` in `date-today`; the others as plain text */
  tone: 'done' | 'overdue' | 'today' | 'left';
  /** "18 days left", "Due today", "2 days overdue", "Done Nov 12" */
  headline: string;
  /** where today falls between the dates ("Day 25 of 43"), or the date itself ("Due Dec 8") */
  detail: string | null;
}

const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

/**
 * How long a project has left, in whole days, and where today falls in it. None for a project with
 * no due date (or a completed one with no completion day).
 */
export function projectTime(
  project: Pick<Project, 'status' | 'startDate' | 'dueDate' | 'completedAt'>,
  now: Date,
  formatDate: (date: Date) => string,
): ProjectTime | null {
  const { status, startDate, dueDate, completedAt } = project;
  if (status === ProjectStatus.COMPLETED) {
    if (!completedAt) return null;
    return {
      tone: 'done',
      headline: `Done ${formatDate(completedAt)}`,
      detail: dueDate ? `Due ${formatDate(dueDate)}` : null,
    };
  }
  if (!dueDate) return null;
  const today = DateTime.fromJSDate(now).startOf('day');
  const due = DateTime.fromJSDate(dueDate).startOf('day');
  const left = Math.round(due.diff(today, 'days').days);
  if (left < 0) {
    return {
      tone: 'overdue',
      headline: `${days(-left)} overdue`,
      detail: `Was due ${formatDate(dueDate)}`,
    };
  }
  let detail = `Due ${formatDate(dueDate)}`;
  if (startDate) {
    const start = DateTime.fromJSDate(startDate).startOf('day');
    const length = Math.round(due.diff(start, 'days').days) + 1;
    const day = Math.round(today.diff(start, 'days').days) + 1;
    if (day < 1) detail = `Starts ${formatDate(startDate)}`;
    else if (length > 1) detail = `Day ${day} of ${length}`;
  }
  return {
    tone: left === 0 ? 'today' : 'left',
    headline: left === 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `${days(left)} left`,
    detail,
  };
}
