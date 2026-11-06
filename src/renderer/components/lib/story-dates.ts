/**
 * The time every story is drawn at: Monday 22 June 2026, 9:48 AM, as the designed screens use.
 * Storybook's `FormatProvider` decorator fixes `now` here, and fixtures build their `Date`s from
 * it so "Today", "Tomorrow" and "In 12 min." stay the same from day to day.
 */
export const STORY_NOW = new Date(2026, 5, 22, 9, 48);

/** A local time `days` from the story's day: `storyDate(1)` is tomorrow's midnight, `storyDate(0, 10)` 10 AM today. */
export function storyDate(days: number, hours = 0, minutes = 0): Date {
  return new Date(2026, 5, 22 + days, hours, minutes);
}

/** A time `minutes` before the story's `now` (negative for after): "2 hr. ago" is `storyAgo(120)`. */
export function storyAgo(minutes: number): Date {
  return new Date(STORY_NOW.getTime() - minutes * 60_000);
}
