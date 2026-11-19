import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyDate } from '../../lib/story-dates';
import { CalendarUpNext } from './CalendarUpNext';

const meta = {
  title: 'Calendar/CalendarUpNext',
  component: CalendarUpNext,
  decorators: [(Story) => <div style={{ width: 224 }}>{Story()}</div>],
  args: {
    // the story's now is 9:48 AM: this one starts in 12 minutes
    event: {
      title: 'Sprint Planning',
      startAt: storyDate(0, 10, 0),
      endAt: storyDate(0, 11, 0),
      allDay: false,
      meetingUrl: 'https://meet.example.com/sprint',
      color: 'green',
    },
    onJoin: () => {},
    onOpen: () => {},
  },
} satisfies Meta<typeof CalendarUpNext>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Starts within the hour: "In 12m" in `date-today`, and Join */
export const Soon: Story = {};

/** In progress: "Now" heads the card */
export const InProgress: Story = {
  args: {
    event: {
      title: 'Daily Standup',
      startAt: storyDate(0, 9, 30),
      endAt: storyDate(0, 10, 0),
      allDay: false,
      meetingUrl: 'https://meet.example.com/standup',
      color: 'green',
    },
  },
};

/** Later today, with no meeting link: no Join */
export const LaterNoLink: Story = {
  args: {
    event: {
      title: 'Design Review',
      startAt: storyDate(0, 13, 0),
      endAt: storyDate(0, 14, 0),
      allDay: false,
      meetingUrl: null,
      color: 'blue',
    },
  },
};
