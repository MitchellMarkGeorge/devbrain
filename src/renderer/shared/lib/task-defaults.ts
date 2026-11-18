import type { AppSettings } from '@common/types';
import { defaultQuickPicks } from '@renderer/components';

/** The setting's default due date ("today", "tomorrow", "next week"), as a day from `today`. */
export function defaultDueDate(
  setting: AppSettings['tasks']['defaultDueDate'] | undefined,
  today: Date,
): Date | null {
  if (!setting) return null;
  const [day, tomorrow, nextWeek] = defaultQuickPicks(today).map((pick) => pick.date);
  return setting === 'today' ? day : setting === 'tomorrow' ? tomorrow : nextWeek;
}
