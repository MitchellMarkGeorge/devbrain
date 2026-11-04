import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CalendarEvent } from '../TimeGrid';
import { MonthGrid } from './MonthGrid';

const TODAY = new Date(2026, 5, 22);
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
  ...[1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 22, 23, 24, 25, 26].map(
    (d): CalendarEvent => ({
      id: `s${d}`,
      title: 'Daily Standup',
      start: at(d, 9, 30),
      end: at(d, 9, 45),
      color: 'green',
    }),
  ),
  { id: 'sp', title: 'Sprint Planning', start: at(22, 9), end: at(22, 10), color: 'green' },
  {
    id: '11',
    title: 'Mitchell / Jesse 1:1',
    start: at(22, 10, 30),
    end: at(22, 11),
    color: 'green',
  },
  { id: 'dr', title: 'Design Review', start: at(22, 13), end: at(22, 14), color: 'blue' },
  { id: 'ml', title: 'ML Platform Review', start: at(25, 13), end: at(25, 14), color: 'pink' },
  {
    id: 'hs',
    title: 'Hiring sync',
    start: at(11, 15),
    end: at(11, 16),
    color: 'amber',
    tentative: true,
  },
  {
    id: 'ooo',
    title: 'Out of office',
    start: new Date(2026, 5, 12),
    end: new Date(2026, 5, 13),
    allDay: true,
    kind: 'out-of-office',
  },
];

const meta = {
  title: 'Calendar/MonthGrid',
  component: MonthGrid,
  parameters: { layout: 'fullscreen' },
  args: { month: TODAY, today: TODAY, events: EVENTS },
  decorators: [
    (Story) => (
      <div style={{ height: 760 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MonthGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** June 2026: all-day events first, "+3 more" on the 22nd, other months' days dimmed */
export const Default: Story = {};

/** Weeks starting on Sunday */
export const SundayFirst: Story = { args: { weekStartsOn: 0 } };
