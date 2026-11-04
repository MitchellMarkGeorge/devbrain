import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimeGrid } from './TimeGrid';
import type { CalendarEvent } from './calendar-events';

const NOW = new Date(2026, 5, 22, 8, 46);
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 22 + i));
const at = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m);

const EVENTS: CalendarEvent[] = [
  {
    id: 'aws',
    title: 'AWS Incubator Course',
    start: new Date(2026, 5, 22),
    end: new Date(2026, 5, 25),
    allDay: true,
    color: 'amber',
  },
  {
    id: 'ooo',
    title: 'Out of office',
    start: new Date(2026, 5, 26),
    end: new Date(2026, 5, 27),
    allDay: true,
    kind: 'out-of-office',
  },
  { id: 'sprint', title: 'Sprint Planning', start: at(22, 9), end: at(22, 10), color: 'green' },
  {
    id: 'standup',
    title: 'Daily Standup',
    start: at(22, 9, 30),
    end: at(22, 9, 45),
    color: 'green',
  },
  {
    id: '1on1',
    title: 'Mitchell / Jesse 1:1',
    start: at(22, 10, 30),
    end: at(22, 11),
    color: 'green',
  },
  {
    id: 'design',
    title: 'Design Review',
    start: at(22, 13),
    end: at(22, 14),
    color: 'blue',
    meeting: true,
  },
  {
    id: 'task',
    title: 'Write PKCE migration guide',
    start: at(23, 10),
    end: at(23, 11),
    kind: 'task',
    status: 'not-started',
  },
  { id: 'focus', title: 'Focus time', start: at(24, 10), end: at(24, 12), kind: 'focus' },
  {
    id: 'a',
    title: 'Hiring sync',
    start: at(25, 15),
    end: at(25, 16),
    color: 'amber',
    tentative: true,
  },
  { id: 'b', title: 'Interview', start: at(25, 15), end: at(25, 16, 30), color: 'pink' },
  { id: 'c', title: 'Debrief', start: at(25, 15, 30), end: at(25, 16), color: 'indigo' },
];

const meta = {
  title: 'Calendar/TimeGrid',
  component: TimeGrid,
  parameters: { layout: 'fullscreen' },
  args: { days: WEEK, events: EVENTS, now: NOW, startHour: 8, endHour: 20 },
  decorators: [
    (Story) => (
      <div style={{ height: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The week: all-day chips spanning days, overlapping events side by side, the now line on Monday */
export const Week: Story = {};

/** The day view: the same grid with one column */
export const Day: Story = { args: { days: [WEEK[0]] } };

/** The whole day, scrolled to 8 AM on open */
export const ScrollsToMorning: Story = { args: { startHour: 0, endHour: 24, scrollToHour: 8 } };

/** The event whose sheet is open */
export const Selected: Story = { args: { selectedEventId: 'design', onEventClick: () => {} } };
