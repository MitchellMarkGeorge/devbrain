import { DateTime } from 'luxon';
import { repeatLabel } from '../../components/event-text';

// The repeat choices the Create event dialog and the event sheet offer, as the rule each writes.
// A rule from a provider, or one written elsewhere, that is none of these shows as its own words
// and stays as it is until another choice replaces it.

export const REPEAT_PRESETS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

export const REPEAT_LABELS: Record<RepeatPreset, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** The rule a choice writes for a series starting at `start`, or null for none. */
export function repeatRule(preset: RepeatPreset, start: Date): string | null {
  switch (preset) {
    case 'none':
      return null;
    case 'daily':
      return 'RRULE:FREQ=DAILY';
    case 'weekdays':
      return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly':
      return `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[DateTime.fromJSDate(start).weekday - 1]}`;
    case 'monthly':
      return 'RRULE:FREQ=MONTHLY';
    case 'yearly':
      return 'RRULE:FREQ=YEARLY';
  }
}

/** The choice a rule is, or `custom` for one none of them writes. */
export function repeatPresetOf(rule: string | null, start: Date): RepeatPreset | 'custom' {
  if (!rule) return 'none';
  const normalized = rule.trim();
  for (const preset of REPEAT_PRESETS) {
    if (preset !== 'none' && repeatRule(preset, start) === normalized) return preset;
  }
  // a weekly rule on another single day is still "every week"
  if (/^RRULE:FREQ=WEEKLY(;BYDAY=(MO|TU|WE|TH|FR|SA|SU))?$/.test(normalized)) return 'weekly';
  return 'custom';
}

/** How a series repeats, in the sheet's words: "Every week", "Every 2 weeks". */
export function repeatText(rule: string | null, start: Date): string {
  const preset = repeatPresetOf(rule, start);
  if (preset !== 'custom') return REPEAT_LABELS[preset];
  return repeatLabel(rule, 'long') ?? 'Custom';
}

/**
 * Whether "This and following" can split the series: core refuses a rule with `RDATE`, `EXRULE`
 * or more than one `RRULE` (docs/calendar/fullcalendar-adapter.md).
 */
export function canSplit(rule: string | null): boolean {
  if (!rule) return false;
  const lines = rule
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean);
  return (
    lines.filter((line) => /^RRULE[;:]/.test(line)).length === 1 &&
    !lines.some((line) => /^(RDATE|EXRULE)[;:]/.test(line))
  );
}
