import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { ColourBar } from '../../ui/ColourBar';
import { Icon } from '../../ui/Icon';
import { Progress } from '../../ui/Progress';
import { storyDate } from '../../lib/story-dates';
import { HomeMeetingRow, HomeRow, HomeRowNote, type HomeMeetingData } from './HomeRow';

function meeting(title: string, startAt: Date, color: string, link = false): HomeMeetingData {
  return {
    title,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    allDay: false,
    meetingUrl: link ? 'https://meet.google.com/abc-defg-hij' : null,
    color,
  };
}

const meta = {
  title: 'Home/HomeRow',
  component: HomeRow,
  args: { icon: <ColourBar color="green" />, title: 'Mitchell / Jesse 1:1', meta: '10:30' },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Meetings, from core's events at 9:48 AM: the next meeting filled with `card`, with its countdown
 * and Join (the page passes `onJoin` from 5 minutes before the start); later ones by their start; tomorrow's first meeting dimmed with its weekday.
 */
export const Meetings: Story = {
  render: () => (
    <div>
      <HomeMeetingRow
        current
        event={meeting('Sprint Planning', storyDate(0, 10), 'green', true)}
        onJoin={() => {}}
      />
      <HomeMeetingRow event={meeting('Mitchell / Jesse 1:1', storyDate(0, 10, 30), 'green')} />
      <HomeMeetingRow event={meeting('Design Review', storyDate(0, 13), 'blue')} />
      <HomeMeetingRow muted event={meeting('Daily Standup', storyDate(1, 9, 30), 'green')} />
    </div>
  ),
};

/** Recent projects: the folder in the project's colour, a 96px bar and "3/12", then the due date or status. */
export const Projects: Story = {
  render: () => (
    <div>
      <HomeRow
        icon={<Icon icon={Folder} style={{ color: 'var(--swatch-blue)' }} />}
        title="Auth Overhaul"
        meta="Due Jul 1"
      >
        <Progress value={25} aria-label="Auth Overhaul: 3 of 12 tasks done" style={{ width: 96 }} />
        <HomeRowNote style={{ width: 36 }}>3/12</HomeRowNote>
      </HomeRow>
      <HomeRow
        icon={<Icon icon={Folder} style={{ color: 'var(--swatch-pink)' }} />}
        title="ML Platform"
        meta="On hold"
      >
        <Progress value={60} aria-label="ML Platform: 6 of 10 tasks done" style={{ width: 96 }} />
        <HomeRowNote style={{ width: 36 }}>6/10</HomeRowNote>
      </HomeRow>
    </div>
  ),
};
