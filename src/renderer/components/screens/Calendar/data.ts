import type { CalendarEvent } from '../../ui/TimeGrid';

/** The Figma file's calendar: the week of Monday 22 June 2026, "now" at 8:46 AM. */
export const NOW = new Date(2026, 5, 22, 8, 46);
export const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 22 + i));

const at = (day: number, h: number, m = 0) => new Date(2026, 5, day, h, m);

export const WEEK_EVENTS: CalendarEvent[] = [
  {
    id: 'aws',
    title: 'AWS Incubator Course',
    start: new Date(2026, 5, 22),
    end: new Date(2026, 5, 25),
    allDay: true,
    color: 'amber',
  },
  { id: 'sprint', title: 'Sprint Planning', start: at(22, 9), end: at(22, 10), color: 'green' },
  ...[22, 23, 24, 25, 26].map(
    (d): CalendarEvent => ({
      id: `standup-${d}`,
      title: 'Daily Standup',
      start: at(d, 9, 30),
      end: at(d, 9, 45),
      color: 'green',
    }),
  ),
  {
    id: '1on1',
    title: 'Mitchell / Jesse 1:1',
    start: at(22, 10, 30),
    end: at(22, 11),
    color: 'green',
  },
  { id: 'design', title: 'Design Review', start: at(22, 13), end: at(22, 14), color: 'blue' },
  { id: 'retro', title: 'Retrospective', start: at(22, 16), end: at(22, 17), color: 'amber' },
  {
    id: 'auth-review',
    title: 'Auth Overhaul Design Review',
    start: at(23, 14),
    end: at(23, 15, 30),
    color: 'blue',
  },
  { id: 'ml', title: 'ML Platform Review', start: at(25, 13), end: at(25, 14), color: 'pink' },
  {
    id: 'allhands',
    title: 'Engineering All-hands',
    start: at(26, 11),
    end: at(26, 12),
    color: 'indigo',
    meeting: true,
  },
];

/** Focus time, a tentative event and a day out of office, added to the same week */
export const WEEK_EVENTS_MORE: CalendarEvent[] = [
  ...WEEK_EVENTS,
  {
    id: 'ooo',
    title: 'Out of office',
    start: new Date(2026, 5, 26),
    end: new Date(2026, 5, 27),
    allDay: true,
    kind: 'out-of-office',
  },
  { id: 'focus', title: 'Focus time', start: at(24, 10), end: at(24, 12), kind: 'focus' },
  {
    id: 'hiring',
    title: 'Hiring sync',
    start: at(25, 15),
    end: at(25, 16),
    color: 'amber',
    tentative: true,
  },
];

/** June 2026 for the month view: the same meetings, recurring */
export const MONTH_EVENTS: CalendarEvent[] = (() => {
  const out: CalendarEvent[] = [];
  for (let d = 1; d <= 30; d++) {
    const day = new Date(2026, 5, d).getDay();
    if (day === 0 || day === 6) continue;
    const add = (
      id: string,
      title: string,
      h: number,
      m: number,
      mins: number,
      color: CalendarEvent['color'],
    ) =>
      out.push({
        id: `${id}-${d}`,
        title,
        start: at(d, h, m),
        end: new Date(at(d, h, m).getTime() + mins * 60000),
        color,
      });
    if (day === 1 && (d === 8 || d === 22)) add('sprint', 'Sprint Planning', 9, 0, 60, 'green');
    add('standup', 'Daily Standup', 9, 30, 15, 'green');
    if (day === 1) {
      add('1on1', 'Mitchell / Jesse 1:1', 10, 30, 30, 'green');
      add('design', 'Design Review', 13, 0, 60, 'blue');
    }
    if (day === 1 && (d === 8 || d === 22)) add('retro', 'Retrospective', 16, 0, 60, 'amber');
    if (day === 4 && (d === 11 || d === 25)) add('ml', 'ML Platform Review', 13, 0, 60, 'pink');
    if (day === 5 && (d === 12 || d === 26))
      add('allhands', 'Engineering All-hands', 11, 0, 60, 'indigo');
    if (d === 23) add('auth-review', 'Auth Overhaul Design Review', 14, 0, 90, 'blue');
  }
  out.push(WEEK_EVENTS[0]);
  return out;
})();
